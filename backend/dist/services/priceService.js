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
const COINGECKO_API = 'https://api.coingecko.com/api/v3/simple/price';
class PriceService {
    constructor() {
        // Cache to prevent rate limits
        this.cache = {};
        this.CACHE_DURATION = 60 * 1000; // 60 seconds
    }
    static getInstance() {
        if (!PriceService.instance) {
            PriceService.instance = new PriceService();
        }
        return PriceService.instance;
    }
    /**
     * Get Real-Time Price of Token in IDR
     * @param tokenId 'solana' or 'usd-coin'
     */
    getPrice() {
        return __awaiter(this, arguments, void 0, function* (tokenId = 'solana', currency = 'idr') {
            var _a;
            const cacheKey = `${tokenId}-${currency}`;
            const cached = this.cache[cacheKey];
            if (cached && (Date.now() - cached.timestamp < this.CACHE_DURATION)) {
                console.log(`[PriceService] Returning cached ${tokenId} price: ${cached.price}`);
                return cached.price;
            }
            try {
                console.log(`[PriceService] Fetching real-time price for ${tokenId}...`);
                const url = `${COINGECKO_API}?ids=${tokenId}&vs_currencies=${currency}`;
                const response = yield (0, node_fetch_1.default)(url);
                if (!response.ok) {
                    throw new Error(`CoinGecko API Error: ${response.statusText}`);
                }
                const data = yield response.json();
                const price = (_a = data[tokenId]) === null || _a === void 0 ? void 0 : _a[currency];
                if (!price)
                    throw new Error('Price data missing');
                // Update Cache
                this.cache[cacheKey] = {
                    price: price,
                    timestamp: Date.now()
                };
                return price;
            }
            catch (error) {
                console.error('[PriceService] Failed to fetch price:', error);
                // Fallback: If cache exists (even expired), return it in emergency
                if (cached) {
                    console.warn('[PriceService] Using EXPIRED cache due to API failure');
                    return cached.price;
                }
                throw new Error('Price Oracle Unavailable');
            }
        });
    }
    /**
     * Verify if Jupiter Quote is within acceptable slippage of Market Price
     * @param jupiterRate Rate from Jupiter (IDR per Token)
     * @param marketTokenId 'solana' or 'usd-coin'
     * @param tolerancePct Percentage difference allowed (e.g. 2%)
     */
    verifyRate(jupiterRate_1, marketTokenId_1) {
        return __awaiter(this, arguments, void 0, function* (jupiterRate, marketTokenId, tolerancePct = 2.0) {
            try {
                const marketPrice = yield this.getPrice(marketTokenId, 'idr');
                const diff = Math.abs(jupiterRate - marketPrice);
                const diffPct = (diff / marketPrice) * 100;
                console.log(`[Oracle Check] Jupiter: ${jupiterRate}, Market: ${marketPrice}, Diff: ${diffPct.toFixed(2)}%`);
                if (diffPct > tolerancePct) {
                    console.warn(`[Oracle Alert] Price deviation too high! (> ${tolerancePct}%)`);
                    return false;
                }
                return true;
            }
            catch (e) {
                console.error("[Oracle Check] FATAL ERROR: ", e);
                // STICT SAFETY: If Oracle is down, we CANNOT guarantee price.
                // Requirement from User: "If CoinGecko fails -> HARD FAIL"
                return false;
            }
        });
    }
}
exports.PriceService = PriceService;
