import fetch from 'node-fetch';

const COINGECKO_API = 'https://api.coingecko.com/api/v3/simple/price';

export class PriceService {
    private static instance: PriceService;

    // Cache to prevent rate limits
    private cache: { [key: string]: { price: number; timestamp: number } } = {};
    private CACHE_DURATION = 60 * 1000; // 60 seconds

    private constructor() { }

    public static getInstance(): PriceService {
        if (!PriceService.instance) {
            PriceService.instance = new PriceService();
        }
        return PriceService.instance;
    }

    /**
     * Get Real-Time Price of Token in IDR
     * @param tokenId 'solana' or 'usd-coin'
     */
    public async getPrice(tokenId: string = 'solana', currency: string = 'idr'): Promise<number> {
        const cacheKey = `${tokenId}-${currency}`;
        const cached = this.cache[cacheKey];

        if (cached && (Date.now() - cached.timestamp < this.CACHE_DURATION)) {
            console.log(`[PriceService] Returning cached ${tokenId} price: ${cached.price}`);
            return cached.price;
        }

        try {
            const apiKey = process.env.COINGECKO_API_KEY;

            // Production API follows the standard domain. 
            // Recommending the user to use the 'x-cg-demo-api-key' or 'x-cg-pro-api-key' header.
            let url = `${COINGECKO_API}?ids=${tokenId}&vs_currencies=${currency}`;
            const headers: any = { 'Accept': 'application/json' };

            if (apiKey) {
                console.log(`[PriceService] Fetching ${tokenId} price with SECURE KEY...`);
                // For Demo/Pro keys, CoinGecko recommends using the 'x-cg-demo-api-key' or 'x-cg-pro-api-key' header
                // and sometimes the 'pro-api' domain for pro users.
                // We'll stick to the standard domain but include the header.
                headers['x-cg-demo-api-key'] = apiKey;
            } else {
                console.warn(`[PriceService] No COINGECKO_API_KEY found. Using standard endpoint.`);
            }

            const response = await fetch(url, { headers });

            if (!response.ok) {
                throw new Error(`CoinGecko API Error: ${response.statusText}`);
            }

            const data: any = await response.json();
            const price = data[tokenId]?.[currency];

            // ZERO-TRUST VALIDATION: Force Hard Fail if price is stale or missing
            if (!price || price <= 0) {
                throw new Error('FATAL: Price Oracle Unreliable - Transaction Blocked');
            }

            // SPREAD MANAGEMENT: Deterministic 1% Platform Revenue
            // Route to: ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m
            const platformSpread = price * 0.01;
            const finalPrice = price - platformSpread;

            // Update Cache
            this.cache[cacheKey] = {
                price: price,
                timestamp: Date.now()
            };

            return finalPrice;
        } catch (error) {
            console.error('[PriceService] ORACLE FAILURE:', error);
            throw new Error('Price Oracle Unavailable - System Locked for Safety');
        }
    }

    /**
     * Verify if Jupiter Quote is within acceptable slippage of Market Price
     * @param jupiterRate Rate from Jupiter (IDR per Token)
     * @param marketTokenId 'solana' or 'usd-coin'
     * @param tolerancePct Percentage difference allowed (e.g. 2%)
     */
    public async verifyRate(jupiterRate: number, marketTokenId: string, tolerancePct: number = 2.0): Promise<boolean> {
        try {
            const marketPrice = await this.getPrice(marketTokenId, 'idr');
            const diff = Math.abs(jupiterRate - marketPrice);
            const diffPct = (diff / marketPrice) * 100;

            console.log(`[Oracle Check] Jupiter: ${jupiterRate}, Market: ${marketPrice}, Diff: ${diffPct.toFixed(2)}%`);

            if (diffPct > tolerancePct) {
                console.warn(`[Oracle Alert] Price deviation too high! (> ${tolerancePct}%)`);
                return false;
            }
            return true;
        } catch (e) {
            console.error("[Oracle Check] FATAL ERROR: ", e);
            // STICT SAFETY: If Oracle is down, we CANNOT guarantee price.
            // Requirement from User: "If CoinGecko fails -> HARD FAIL"
            return false;
        }
    }
}
