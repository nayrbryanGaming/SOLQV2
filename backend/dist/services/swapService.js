"use strict";
/**
 * Swap Service
 * Handles crypto-to-fiat conversion rates and slippage.
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SwapService = void 0;
const priceService_1 = require("./priceService");
class SwapService {
    /**
     * Get a quote for a specific amount of IDR
     * @param amountIDR The amount in Rupiah to settle
     * @param sourceCurrency The crypto asset user wants to pay with
     */
    static getQuote(amountIDR, sourceCurrency) {
        return __awaiter(this, void 0, void 0, function* () {
            // REAL PRICE DISCOVERY
            const priceService = priceService_1.PriceService.getInstance();
            // 1. Get Market Price (e.g. 1 SOL = 2,500,000 IDR)
            // We need the RATE: 1 IDR = X SOL
            // PriceService returns: 1 SOL = Y IDR.
            // So Rate = 1 / Y.
            const marketPriceIdr = yield priceService.getPrice('solana', 'idr'); // Returns ~2500000
            const rate = 1 / marketPriceIdr;
            // Calculate crypto amount needed
            // Add 1% spread for slippage/fees/buffer
            const baseAmount = amountIDR * rate;
            const totalAmount = baseAmount * 1.01;
            return {
                sourceCurrency,
                sourceAmount: parseFloat(totalAmount.toFixed(9)), // Sol has 9 decimals
                targetCurrency: 'IDR',
                targetAmount: amountIDR,
                rate,
                expiresAt: Date.now() + (5 * 60 * 1000) // 5 minutes expiry
            };
        });
    }
}
exports.SwapService = SwapService;
