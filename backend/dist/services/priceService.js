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
const JUPITER_PRICE_API = 'https://lite-api.jup.ag/price/v2';
const FX_API = 'https://api.exchangerate-api.com/v4/latest/USD';
class PriceService {
    constructor() {
        // Cache to prevent rate limits
        this.cache = {};
        this.CACHE_DURATION = 45 * 1000; // 45 seconds (aggressive cache)
    }
    static getInstance() {
        if (!PriceService.instance) {
            PriceService.instance = new PriceService();
        }
        return PriceService.instance;
    }
    /**
     * Get Real-Time Price of Token in IDR (Multi-Oracle)
     */
    getPrice() {
        return __awaiter(this, arguments, void 0, function* (tokenId = 'solana', currency = 'idr') {
            const cacheKey = `${tokenId}-${currency}`;
            const cached = this.cache[cacheKey];
            if (cached && (Date.now() - cached.timestamp < this.CACHE_DURATION)) {
                return cached.price;
            }
            // ORACLE 1: CoinGecko
            try {
                const price = yield this.fetchFromCoinGecko(tokenId, currency);
                if (price > 0) {
                    this.cache[cacheKey] = { price, timestamp: Date.now() };
                    return price;
                }
            }
            catch (_) { }
            // ORACLE 2: Jupiter + FX API
            try {
                const price = yield this.fetchFromJupiter(tokenId, currency);
                if (price > 0) {
                    this.cache[cacheKey] = { price, timestamp: Date.now() };
                    return price;
                }
            }
            catch (_) { }
            // Return cached if still valid (5 min window)
            if (cached && (Date.now() - cached.timestamp < 5 * 60 * 1000)) {
                return cached.price;
            }
            throw new Error('ORACLE FAILURE: All price sources unavailable');
        });
    }
    fetchFromCoinGecko(tokenId, currency) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const apiKey = process.env.COINGECKO_API_KEY;
            const headers = { 'Accept': 'application/json' };
            if (apiKey)
                headers['x-cg-demo-api-key'] = apiKey;
            const response = yield (0, node_fetch_1.default)(`${COINGECKO_API}?ids=${tokenId}&vs_currencies=${currency}`, { headers });
            if (!response.ok)
                return 0;
            const data = yield response.json();
            return ((_a = data[tokenId]) === null || _a === void 0 ? void 0 : _a[currency]) || 0;
        });
    }
    fetchFromJupiter(tokenId, currency) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            if (currency !== 'idr' || tokenId !== 'solana')
                return 0;
            // Get SOL price in USDC from Jupiter
            const jupRes = yield (0, node_fetch_1.default)(`${JUPITER_PRICE_API}?ids=So11111111111111111111111111111111111111112`);
            if (!jupRes.ok)
                return 0;
            const jupData = yield jupRes.json();
            const solUsdc = parseFloat(((_b = (_a = jupData === null || jupData === void 0 ? void 0 : jupData.data) === null || _a === void 0 ? void 0 : _a['So11111111111111111111111111111111111111112']) === null || _b === void 0 ? void 0 : _b.price) || '0');
            if (solUsdc <= 0)
                return 0;
            // Get USD/IDR from FX API
            const fxRes = yield (0, node_fetch_1.default)(FX_API);
            if (!fxRes.ok)
                return 0;
            const fxData = yield fxRes.json();
            const usdIdr = ((_c = fxData === null || fxData === void 0 ? void 0 : fxData.rates) === null || _c === void 0 ? void 0 : _c.IDR) || 15800;
            return solUsdc * usdIdr;
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
