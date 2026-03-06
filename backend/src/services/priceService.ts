import fetch from 'node-fetch';

const COINGECKO_API = 'https://api.coingecko.com/api/v3/simple/price';
const JUPITER_PRICE_API = 'https://lite-api.jup.ag/price/v2';
const FX_API = 'https://api.exchangerate-api.com/v4/latest/USD';

export class PriceService {
    private static instance: PriceService;

    // Cache to prevent rate limits
    private cache: { [key: string]: { price: number; timestamp: number } } = {};
    private CACHE_DURATION = 45 * 1000; // 45 seconds (aggressive cache)

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

        // ORACLE 1: CoinGecko
        try {
            const price = await this.fetchFromCoinGecko(tokenId, currency);
            if (price > 0) {
                this.cache[cacheKey] = { price, timestamp: Date.now() };
                return price;
            }
        } catch (_) {}

        // ORACLE 2: Jupiter + FX API
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

    private async fetchFromCoinGecko(tokenId: string, currency: string): Promise<number> {
        const apiKey = process.env.COINGECKO_API_KEY;
        const headers: any = { 'Accept': 'application/json' };
        if (apiKey) headers['x-cg-demo-api-key'] = apiKey;

        const response = await fetch(`${COINGECKO_API}?ids=${tokenId}&vs_currencies=${currency}`, { headers });
        if (!response.ok) return 0;

        const data: any = await response.json();
        return data[tokenId]?.[currency] || 0;
    }

    private async fetchFromJupiter(tokenId: string, currency: string): Promise<number> {
        if (currency !== 'idr' || tokenId !== 'solana') return 0;

        // Get SOL price in USDC from Jupiter
        const jupRes = await fetch(`${JUPITER_PRICE_API}?ids=So11111111111111111111111111111111111111112`);
        if (!jupRes.ok) return 0;

        const jupData: any = await jupRes.json();
        const solUsdc = parseFloat(jupData?.data?.['So11111111111111111111111111111111111111112']?.price || '0');
        if (solUsdc <= 0) return 0;

        // Get USD/IDR from FX API
        const fxRes = await fetch(FX_API);
        if (!fxRes.ok) return 0;

        const fxData: any = await fxRes.json();
        const usdIdr = fxData?.rates?.IDR || 15800;

        return solUsdc * usdIdr;
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
