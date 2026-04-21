import fetch from 'node-fetch';

const COINGECKO_API = 'https://api.coingecko.com/api/v3/simple/price';
const JUPITER_PRICE_API = 'https://lite-api.jup.ag/price/v2';
const JUPITER_PRICE_API_ALT = 'https://api.jup.ag/price/v2';
const FX_API = 'https://api.exchangerate-api.com/v4/latest/USD';
const FX_API_ALT = 'https://open.er-api.com/v6/latest/USD';

export class PriceService {
    private static instance: PriceService;

    // Cache to prevent rate limits
    private cache: { [key: string]: { price: number; timestamp: number } } = {};
    private inflight: { [key: string]: Promise<number> | undefined } = {};
    private CACHE_DURATION = 45 * 1000; // 45 seconds (aggressive cache)
    private FETCH_TIMEOUT_MS = 2500;

    private constructor() { }

    public static getInstance(): PriceService {
        if (!PriceService.instance) {
            PriceService.instance = new PriceService();
        }
        return PriceService.instance;
    }

    /**
     * Get Real-Time Price of Token in IDR (Multi-Oracle)
     */
    public async getPrice(tokenId: string = 'solana', currency: string = 'idr'): Promise<number> {
        const cacheKey = `${tokenId}-${currency}`;
        const cached = this.cache[cacheKey];

        if (cached && (Date.now() - cached.timestamp < this.CACHE_DURATION)) {
            return cached.price;
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
        cached?: { price: number; timestamp: number }
    ): Promise<number> {

        // ORACLE 1: CoinGecko
        try {
            const price = await this.fetchFromCoinGecko(tokenId, currency);
            if (price > 0) {
                this.cache[cacheKey] = { price, timestamp: Date.now() };
                return price;
            }
        } catch (_) {}

        // ORACLE 2: Jupiter + FX API (with alternate endpoints)
        try {
            const price = await this.fetchFromJupiter(tokenId, currency);
            if (price > 0) {
                this.cache[cacheKey] = { price, timestamp: Date.now() };
                return price;
            }
        } catch (_) {}

        // Return cached if still valid (5 min window)
        if (cached && (Date.now() - cached.timestamp < 5 * 60 * 1000)) {
            return cached.price;
        }

        throw new Error('ORACLE FAILURE: All price sources unavailable');
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
