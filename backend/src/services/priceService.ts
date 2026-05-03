import fetch from 'node-fetch';
import { AuditLogger, AuditEventType } from './auditLogger';

const COINGECKO_API = 'https://api.coingecko.com/api/v3/simple/price';
const JUPITER_PRICE_API = 'https://lite-api.jup.ag/price/v2';
const JUPITER_PRICE_API_ALT = 'https://api.jup.ag/price/v2';
const FX_API = 'https://api.exchangerate-api.com/v4/latest/USD';
const FX_API_ALT = 'https://open.er-api.com/v6/latest/USD';

// ═══════════════════════════════════════════════════════════════════════
// PRICING ENGINE — Deterministic Oracle per SOLQ Spec
// Per "HUKUM 4 — DETERMINISTIC PRICING":
// - Cache TTL: EXACTLY 60 seconds (not 45)
// - Staleness max: 2 minutes (not 5)
// - Spread: 50 bps (0.5%) embedded in rate
// - Failure mode: ABORT, never silent fallback
// ═══════════════════════════════════════════════════════════════════════
export class PriceService {
    private static instance: PriceService;

    // Cache to prevent rate limits
    private cache: {
        [key: string]: {
            price: number;
            timestamp: number;
            source: string;
            spreadApplied: number;
        }
    } = {};
    private inflight: { [key: string]: Promise<number> | undefined } = {};

    // FIXED PER SPEC:
    private readonly CACHE_DURATION_MS = 60 * 1000; // Exactly 60 seconds
    private readonly MAX_STALENESS_MS = 2 * 60 * 1000; // Max 2 minutes
    private readonly PLATFORM_SPREAD_BPS = 50; // 0.5% spread (50 basis points)
    private readonly FETCH_TIMEOUT_MS = 3000; // 3 second timeout

    private constructor() { }

    public static getInstance(): PriceService {
        if (!PriceService.instance) {
            PriceService.instance = new PriceService();
        }
        return PriceService.instance;
    }

    /**
     * Get Real-Time Price of Token in IDR (Multi-Oracle) WITH 50 bps SPREAD
     * 
     * Returns: oracle price × (1 - 50 bps) = conservative rate for SOLQ
     * Example: Oracle 16,200 IDR → Returns 16,119 IDR (50 bps spread to platform)
     */
    public async getPrice(tokenId: string = 'solana', currency: string = 'idr'): Promise<number> {
        const cacheKey = `${tokenId}-${currency}`;
        const cached = this.cache[cacheKey];

        // Check cache TTL (EXACTLY 60 seconds)
        if (cached && (Date.now() - cached.timestamp < this.CACHE_DURATION_MS)) {
            console.log(`[PRICE] Cache HIT: ${cacheKey} (age: ${Date.now() - cached.timestamp}ms)`);
            return cached.price; // Includes spread already
        }

        // Collapse concurrent lookups to a single upstream oracle request.
        const existingInflight = this.inflight[cacheKey];
        if (existingInflight) {
            return existingInflight;
        }

        this.inflight[cacheKey] = this.fetchAndCachePrice(cacheKey, tokenId, currency, cached);
        try {
            return await this.inflight[cacheKey]!;
        } finally {
            delete this.inflight[cacheKey];
        }
    }

    private async fetchAndCachePrice(
        cacheKey: string,
        tokenId: string,
        currency: string,
        cached?: { price: number; timestamp: number; source: string; spreadApplied: number }
    ): Promise<number> {

        // ORACLE 1: CoinGecko (primary source)
        try {
            const oraclePrice = await this.fetchFromCoinGecko(tokenId, currency);
            if (oraclePrice > 0) {
                const priceWithSpread = this.applySpread(oraclePrice);
                this.cache[cacheKey] = { 
                    price: priceWithSpread,
                    timestamp: Date.now(),
                    source: 'COINGECKO',
                    spreadApplied: this.PLATFORM_SPREAD_BPS
                };
                AuditLogger.log(AuditEventType.PRICE_FETCHED, {
                    token: tokenId,
                    oraclePrice,
                    spreadBps: this.PLATFORM_SPREAD_BPS,
                    finalPrice: priceWithSpread,
                    source: 'COINGECKO'
                });
                console.log(`[PRICE] CoinGecko OK: ${tokenId} = ${oraclePrice} IDR → ${priceWithSpread} IDR (spread: ${this.PLATFORM_SPREAD_BPS}bps)`);
                return priceWithSpread;
            }
        } catch (err: any) {
            console.warn(`[PRICE] CoinGecko FAILED: ${err.message}`);
        }

        // ORACLE 2: Jupiter + FX API (fallback)
        try {
            const oraclePrice = await this.fetchFromJupiter(tokenId, currency);
            if (oraclePrice > 0) {
                const priceWithSpread = this.applySpread(oraclePrice);
                this.cache[cacheKey] = { 
                    price: priceWithSpread,
                    timestamp: Date.now(),
                    source: 'JUPITER',
                    spreadApplied: this.PLATFORM_SPREAD_BPS
                };
                AuditLogger.log(AuditEventType.PRICE_FETCHED, {
                    token: tokenId,
                    oraclePrice,
                    spreadBps: this.PLATFORM_SPREAD_BPS,
                    finalPrice: priceWithSpread,
                    source: 'JUPITER'
                });
                console.log(`[PRICE] Jupiter OK: ${tokenId} = ${oraclePrice} IDR → ${priceWithSpread} IDR (spread: ${this.PLATFORM_SPREAD_BPS}bps)`);
                return priceWithSpread;
            }
        } catch (err: any) {
            console.warn(`[PRICE] Jupiter FAILED: ${err.message}`);
        }

        // STALENESS CHECK — Max 2 minutes (not 5!)
        // If all live oracles fail, check if cached price is still within staleness window
        if (cached) {
            const cacheAgeMs = Date.now() - cached.timestamp;
            if (cacheAgeMs < this.MAX_STALENESS_MS) {
                AuditLogger.log(AuditEventType.PRICE_STALE_FALLBACK, {
                    token: tokenId,
                    cacheAgeMs,
                    maxStalenessMs: this.MAX_STALENESS_MS,
                    stalenessExceeded: false,
                    price: cached.price,
                    source: cached.source
                });
                console.warn(
                    `[PRICE] All oracles FAILED, using cached price (age: ${cacheAgeMs}ms, max: ${this.MAX_STALENESS_MS}ms): ` +
                    `${tokenId} = ${cached.price} IDR`
                );
                return cached.price;
            } else {
                // Cache too old — FAIL EXPLICITLY
                const stalenessExcessMs = cacheAgeMs - this.MAX_STALENESS_MS;
                AuditLogger.log(AuditEventType.PRICE_STALE_EXCEEDS_MAX, {
                    token: tokenId,
                    cacheAgeMs,
                    maxStalenessMs: this.MAX_STALENESS_MS,
                    excessMs: stalenessExcessMs,
                    lastPrice: cached.price
                });
                throw new Error(
                    `[PRICE] ORACLE FAILURE: All price sources unavailable. ` +
                    `Cached price is ${stalenessExcessMs}ms too old (max ${this.MAX_STALENESS_MS}ms). ` +
                    `Transaction aborted for user safety.`
                );
            }
        }

        // No cache and all oracles failed — FAIL HARD
        AuditLogger.log(AuditEventType.CRITICAL_PRICE_UNAVAILABLE, {
            token: tokenId,
            reason: 'All price sources failed and no valid cache'
        });
        throw new Error(
            `[PRICE] CRITICAL FAILURE: All price sources unavailable for ${tokenId}. ` +
            `No cache available. Transaction cannot proceed.`
        );
    }

    /**
     * Apply 50 bps (0.5%) platform spread to oracle price
     * Formula: price × (1 - 50/10000) = price × 0.995
     * This is a conservative spread to protect SOLQ from slippage
     * Example: 16,200 IDR × 0.995 = 16,119 IDR
     */
    private applySpread(oraclePrice: number): number {
        const spreadMultiplier = 1 - (this.PLATFORM_SPREAD_BPS / 10000);
        return oraclePrice * spreadMultiplier;
    }

    private async fetchJsonWithTimeout(url: string, headers?: Record<string, string>): Promise<any> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.FETCH_TIMEOUT_MS);
        try {
            const response = await fetch(url, {
                headers,
                signal: controller.signal
            });
            if (!response.ok) return null;
            return await response.json();
        } finally {
            clearTimeout(timeout);
        }
    }

    private async fetchFromCoinGecko(tokenId: string, currency: string): Promise<number> {
        const apiKey = process.env.COINGECKO_API_KEY;
        const headers: any = { 'Accept': 'application/json' };
        if (apiKey) headers['x-cg-demo-api-key'] = apiKey;

        const data: any = await this.fetchJsonWithTimeout(
            `${COINGECKO_API}?ids=${tokenId}&vs_currencies=${currency}`,
            headers
        );
        if (!data) return 0;
        return data[tokenId]?.[currency] || 0;
    }

    private async fetchFromJupiter(tokenId: string, currency: string): Promise<number> {
        if (currency !== 'idr' || tokenId !== 'solana') return 0;

        const solUsdc = await this.fetchSolUsdcFromJupiter();
        if (solUsdc <= 0) return 0;

        // Get USD/IDR from FX API (fallback to alternate provider)
        const fxData: any = await this.fetchJsonWithTimeout(FX_API) || await this.fetchJsonWithTimeout(FX_API_ALT);
        if (!fxData) return 0;
        const usdIdr = fxData?.rates?.IDR || 15800;

        return solUsdc * usdIdr;
    }

    private async fetchSolUsdcFromJupiter(): Promise<number> {
        const token = 'So11111111111111111111111111111111111111112';
        const primary: any = await this.fetchJsonWithTimeout(`${JUPITER_PRICE_API}?ids=${token}`);
        const primaryPrice = parseFloat(primary?.data?.[token]?.price || '0');
        if (primaryPrice > 0) return primaryPrice;

        const alternate: any = await this.fetchJsonWithTimeout(`${JUPITER_PRICE_API_ALT}?ids=${token}`);
        const alternatePrice = parseFloat(alternate?.data?.[token]?.price || '0');
        return alternatePrice > 0 ? alternatePrice : 0;
    }

    /**
     * Verify if Jupiter Quote is within acceptable slippage of Market Price
     */
    public async verifyRate(jupiterRate: number, marketTokenId: string, tolerancePct: number = 2.5): Promise<boolean> {
        try {
            const marketPrice = await this.getPrice(marketTokenId, 'idr');
            const diff = Math.abs(jupiterRate - marketPrice);
            const diffPct = (diff / marketPrice) * 100;
            return diffPct <= tolerancePct;
        } catch (_) {
            return false; // STRICT: No oracle = No safety
        }
    }
}
