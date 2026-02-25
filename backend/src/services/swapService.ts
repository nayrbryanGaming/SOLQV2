/**
 * Swap Service
 * Handles crypto-to-fiat conversion rates and slippage.
 */

interface Quote {
    sourceCurrency: string;
    sourceAmount: number;
    targetCurrency: 'IDR';
    targetAmount: number;
    rate: number;
    expiresAt: number;
}

import { PriceService } from './priceService';

export class SwapService {
    /**
     * Get a quote for a specific amount of IDR
     * @param amountIDR The amount in Rupiah to settle
     * @param sourceCurrency The crypto asset user wants to pay with
     */
    public static async getQuote(amountIDR: number, sourceCurrency: string): Promise<Quote> {
        // REAL PRICE DISCOVERY
        const priceService = PriceService.getInstance();

        // 1. Get Market Price (e.g. 1 SOL = 2,500,000 IDR)
        // We need the RATE: 1 IDR = X SOL
        // PriceService returns: 1 SOL = Y IDR.
        // So Rate = 1 / Y.

        const marketPriceIdr = await priceService.getPrice('solana', 'idr'); // Returns ~2500000
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
    }
}
