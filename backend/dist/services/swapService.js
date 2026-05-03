"use strict";
/**
 * Swap Service
 * Gets accurate crypto-to-IDR quotes from Jupiter ExactOut before intent creation.
 */
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
exports.SwapService = void 0;
const priceService_1 = require("./priceService");
const node_fetch_1 = __importDefault(require("node-fetch"));
const JUPITER_QUOTE_API = 'https://lite-api.jup.ag/swap/v1/quote';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const IDRX_MINT = 'idrxZcP8xiKkYk6XGD4uz1dxEYCWSgKDHqgjsBbwDur';
class SwapService {
    /**
     * Get a quote for a specific IDR amount via Jupiter ExactOut.
     * Falls back to oracle price math if Jupiter is unreachable or amount is 0.
     */
    static getQuote(amountIDR, sourceCurrency) {
        return __awaiter(this, void 0, void 0, function* () {
            const priceService = priceService_1.PriceService.getInstance();
            // Static QR: amount not yet known — return oracle estimate only
            if (amountIDR <= 0) {
                const marketPrice = yield priceService.getPrice('solana', 'idr');
                return {
                    sourceCurrency,
                    sourceAmount: 0,
                    targetCurrency: 'IDR',
                    targetAmount: 0,
                    rate: marketPrice,
                    expiresAt: Date.now() + 5 * 60 * 1000,
                };
            }
            // IDRX has 2 decimals on mainnet: 1 IDR = 100 atomic units
            const amountAtomic = Math.floor(amountIDR * 100);
            try {
                const params = new URLSearchParams({
                    inputMint: SOL_MINT,
                    outputMint: IDRX_MINT,
                    amount: amountAtomic.toString(),
                    swapMode: 'ExactOut',
                    slippageBps: '100',
                    platformFeeBps: '150',
                });
                const res = yield (0, node_fetch_1.default)(`${JUPITER_QUOTE_API}?${params}`, { timeout: 8000 });
                const data = yield res.json();
                if (!data.error && data.inAmount && data.outAmount) {
                    const inLamports = Number(data.inAmount);
                    const solAmount = inLamports / 1000000000;
                    const impliedRate = amountIDR / solAmount; // IDR per 1 SOL
                    return {
                        sourceCurrency,
                        sourceAmount: parseFloat(solAmount.toFixed(9)),
                        targetCurrency: 'IDR',
                        targetAmount: amountIDR,
                        rate: impliedRate,
                        expiresAt: Date.now() + 2 * 60 * 1000, // Jupiter quotes are valid ~2 min
                        jupiterQuote: data,
                    };
                }
                console.warn('[SWAP] Jupiter quote error, falling back to oracle:', data.error);
            }
            catch (err) {
                console.warn('[SWAP] Jupiter unreachable, falling back to oracle:', err);
            }
            // Oracle fallback
            const marketPrice = yield priceService.getPrice('solana', 'idr');
            const solNeeded = (amountIDR / marketPrice) * 1.015; // 1.5% buffer
            return {
                sourceCurrency,
                sourceAmount: parseFloat(solNeeded.toFixed(9)),
                targetCurrency: 'IDR',
                targetAmount: amountIDR,
                rate: marketPrice,
                expiresAt: Date.now() + 5 * 60 * 1000,
            };
        });
    }
}
exports.SwapService = SwapService;
