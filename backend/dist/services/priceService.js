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
const JUPITER_PRICE_API_ALT = 'https://api.jup.ag/price/v2';
const FX_API = 'https://api.exchangerate-api.com/v4/latest/USD';
const FX_API_ALT = 'https://open.er-api.com/v6/latest/USD';
class PriceService {
    constructor() {
        // Cache to prevent rate limits
        this.cache = {};
        this.inflight = {};
        this.CACHE_DURATION = 45 * 1000; // 45 seconds (aggressive cache)
        this.FETCH_TIMEOUT_MS = 2500;
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
            // ORACLE 1: CoinGecko
            try {
                const price = yield this.fetchFromCoinGecko(tokenId, currency);
                if (price > 0) {
                    this.cache[cacheKey] = { price, timestamp: Date.now() };
                    return price;
                }
            }
            catch (_) { }
            // ORACLE 2: Jupiter + FX API (with alternate endpoints)
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
