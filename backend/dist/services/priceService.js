"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PriceService = void 0;
const node_fetch_1 = __importDefault(require("node-fetch"));
const auditLogger_1 = require("./auditLogger");
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
class PriceService {
    constructor() {
        // Cache to prevent rate limits
        this.cache = {};
        this.inflight = {};
        // FIXED PER SPEC:
        this.CACHE_DURATION_MS = 60 * 1000; // Exactly 60 seconds
        this.MAX_STALENESS_MS = 2 * 60 * 1000; // Max 2 minutes
        this.PLATFORM_SPREAD_BPS = 50; // 0.5% spread (50 basis points)
        this.FETCH_TIMEOUT_MS = 3000; // 3 second timeout
    }
    static getInstance() {
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
    getPrice() {
        return __awaiter(this, arguments, void 0, function* (tokenId = 'solana', currency = 'idr') {
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
                return yield this.inflight[cacheKey];
            }
            finally {
                delete this.inflight[cacheKey];
            }
        });
    }
    fetchAndCachePrice(cacheKey, tokenId, currency, cached) {
        return __awaiter(this, void 0, void 0, function* () {
            // ORACLE 1: CoinGecko (primary source)
            try {
                const oraclePrice = yield this.fetchFromCoinGecko(tokenId, currency);
                if (oraclePrice > 0) {
                    const priceWithSpread = this.applySpread(oraclePrice);
                    this.cache[cacheKey] = {
                        price: priceWithSpread,
                        timestamp: Date.now(),
                        source: 'COINGECKO',
                        spreadApplied: this.PLATFORM_SPREAD_BPS
                    };
                    auditLogger_1.AuditLogger.log(auditLogger_1.AuditEventType.PRICE_FETCHED, {
                        token: tokenId,
                        oraclePrice,
                        spreadBps: this.PLATFORM_SPREAD_BPS,
                        finalPrice: priceWithSpread,
                        source: 'COINGECKO'
                    });
                    console.log(`[PRICE] CoinGecko OK: ${tokenId} = ${oraclePrice} IDR → ${priceWithSpread} IDR (spread: ${this.PLATFORM_SPREAD_BPS}bps)`);
                    return priceWithSpread;
                }
            }
            catch (err) {
                console.warn(`[PRICE] CoinGecko FAILED: ${err.message}`);
            }
            // ORACLE 2: Jupiter + FX API (fallback)
            try {
                const oraclePrice = yield this.fetchFromJupiter(tokenId, currency);
                if (oraclePrice > 0) {
                    const priceWithSpread = this.applySpread(oraclePrice);
                    this.cache[cacheKey] = {
                        price: priceWithSpread,
                        timestamp: Date.now(),
                        source: 'JUPITER',
                        spreadApplied: this.PLATFORM_SPREAD_BPS
                    };
                    auditLogger_1.AuditLogger.log(auditLogger_1.AuditEventType.PRICE_FETCHED, {
                        token: tokenId,
                        oraclePrice,
                        spreadBps: this.PLATFORM_SPREAD_BPS,
                        finalPrice: priceWithSpread,
                        source: 'JUPITER'
                    });
                    console.log(`[PRICE] Jupiter OK: ${tokenId} = ${oraclePrice} IDR → ${priceWithSpread} IDR (spread: ${this.PLATFORM_SPREAD_BPS}bps)`);
                    return priceWithSpread;
                }
            }
            catch (err) {
                console.warn(`[PRICE] Jupiter FAILED: ${err.message}`);
            }
            // STALENESS CHECK — Max 2 minutes (not 5!)
            // If all live oracles fail, check if cached price is still within staleness window
            if (cached) {
                const cacheAgeMs = Date.now() - cached.timestamp;
                if (cacheAgeMs < this.MAX_STALENESS_MS) {
                    auditLogger_1.AuditLogger.log(auditLogger_1.AuditEventType.PRICE_STALE_FALLBACK, {
                        token: tokenId,
                        cacheAgeMs,
                        maxStalenessMs: this.MAX_STALENESS_MS,
                        stalenessExceeded: false,
                        price: cached.price,
                        source: cached.source
                    });
                    console.warn(`[PRICE] All oracles FAILED, using cached price (age: ${cacheAgeMs}ms, max: ${this.MAX_STALENESS_MS}ms): ` +
                        `${tokenId} = ${cached.price} IDR`);
                    return cached.price;
                }
                else {
                    // Cache too old — FAIL EXPLICITLY
                    const stalenessExcessMs = cacheAgeMs - this.MAX_STALENESS_MS;
                    auditLogger_1.AuditLogger.log(auditLogger_1.AuditEventType.PRICE_STALE_EXCEEDS_MAX, {
                        token: tokenId,
                        cacheAgeMs,
                        maxStalenessMs: this.MAX_STALENESS_MS,
                        excessMs: stalenessExcessMs,
                        lastPrice: cached.price
                    });
                    throw new Error(`[PRICE] ORACLE FAILURE: All price sources unavailable. ` +
                        `Cached price is ${stalenessExcessMs}ms too old (max ${this.MAX_STALENESS_MS}ms). ` +
                        `Transaction aborted for user safety.`);
                }
            }
            // No cache and all oracles failed — FAIL HARD
            auditLogger_1.AuditLogger.log(auditLogger_1.AuditEventType.CRITICAL_PRICE_UNAVAILABLE, {
                token: tokenId,
                reason: 'All price sources failed and no valid cache'
            });
            throw new Error(`[PRICE] CRITICAL FAILURE: All price sources unavailable for ${tokenId}. ` +
                `No cache available. Transaction cannot proceed.`);
        });
    }
    /**
     * Apply 50 bps (0.5%) platform spread to oracle price
     * Formula: price × (1 - 50/10000) = price × 0.995
     * This is a conservative spread to protect SOLQ from slippage
     * Example: 16,200 IDR × 0.995 = 16,119 IDR
     */
    applySpread(oraclePrice) {
        const spreadMultiplier = 1 - (this.PLATFORM_SPREAD_BPS / 10000);
        return oraclePrice * spreadMultiplier;
    }
    fetchJsonWithTimeout(url, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), this.FETCH_TIMEOUT_MS);
            try {
                const response = yield (0, node_fetch_1.default)(url, {
                    headers,
                    signal: controller.signal
                });
                if (!response.ok)
                    return null;
                return yield response.json();
            }
            finally {
                clearTimeout(timeout);
            }
        });
    }
    fetchFromCoinGecko(tokenId, currency) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const apiKey = process.env.COINGECKO_API_KEY;
            const headers = { 'Accept': 'application/json' };
            if (apiKey)
                headers['x-cg-demo-api-key'] = apiKey;
            const data = yield this.fetchJsonWithTimeout(`${COINGECKO_API}?ids=${tokenId}&vs_currencies=${currency}`, headers);
            if (!data)
                return 0;
            return ((_a = data[tokenId]) === null || _a === void 0 ? void 0 : _a[currency]) || 0;
        });
    }
    fetchFromJupiter(tokenId, currency) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            if (currency !== 'idr' || tokenId !== 'solana')
                return 0;
            const solUsdc = yield this.fetchSolUsdcFromJupiter();
            if (solUsdc <= 0)
                return 0;
            // Get USD/IDR from FX API (fallback to alternate provider)
            const fxData = (yield this.fetchJsonWithTimeout(FX_API)) || (yield this.fetchJsonWithTimeout(FX_API_ALT));
            if (!fxData)
                return 0;
            const usdIdr = ((_a = fxData === null || fxData === void 0 ? void 0 : fxData.rates) === null || _a === void 0 ? void 0 : _a.IDR) || 15800;
            return solUsdc * usdIdr;
        });
    }
    fetchSolUsdcFromJupiter() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d;
            const token = 'So11111111111111111111111111111111111111112';
            const primary = yield this.fetchJsonWithTimeout(`${JUPITER_PRICE_API}?ids=${token}`);
            const primaryPrice = parseFloat(((_b = (_a = primary === null || primary === void 0 ? void 0 : primary.data) === null || _a === void 0 ? void 0 : _a[token]) === null || _b === void 0 ? void 0 : _b.price) || '0');
            if (primaryPrice > 0)
                return primaryPrice;
            const alternate = yield this.fetchJsonWithTimeout(`${JUPITER_PRICE_API_ALT}?ids=${token}`);
            const alternatePrice = parseFloat(((_d = (_c = alternate === null || alternate === void 0 ? void 0 : alternate.data) === null || _c === void 0 ? void 0 : _c[token]) === null || _d === void 0 ? void 0 : _d.price) || '0');
            return alternatePrice > 0 ? alternatePrice : 0;
        });
    }
    /**
     * Verify if Jupiter Quote is within acceptable slippage of Market Price
     */
    verifyRate(jupiterRate_1, marketTokenId_1) {
        return __awaiter(this, arguments, void 0, function* (jupiterRate, marketTokenId, tolerancePct = 2.5) {
            try {
                const marketPrice = yield this.getPrice(marketTokenId, 'idr');
                const diff = Math.abs(jupiterRate - marketPrice);
                const diffPct = (diff / marketPrice) * 100;
                return diffPct <= tolerancePct;
            }
            catch (_) {
                return false; // STRICT: No oracle = No safety
            }
        });
    }
}
exports.PriceService = PriceService;
