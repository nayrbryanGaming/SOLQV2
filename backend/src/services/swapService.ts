/**
 * Swap Service
 * Gets accurate crypto-to-IDR quotes from Jupiter ExactOut before intent creation.
 */

import { PriceService } from './priceService';
import fetch from 'node-fetch';

const JUPITER_QUOTE_API = 'https://lite-api.jup.ag/swap/v1/quote';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const IDRX_MINT = 'idrxZcP8xiKkYk6XGD4uz1dxEYCWSgKDHqgjsBbwDur';

export interface Quote {
    sourceCurrency: string;
    sourceAmount: number;    // Human-readable (e.g. 0.00123 SOL)
    targetCurrency: 'IDR';
    targetAmount: number;    // IDR
    rate: number;            // IDR per 1 SOL (implied from Jupiter route)
    expiresAt: number;
    jupiterQuote?: any;      // Raw quote for downstream swap building
}

export class SwapService {
    /**
     * Get a quote for a specific IDR amount via Jupiter ExactOut.
     * Falls back to oracle price math if Jupiter is unreachable or amount is 0.
     */
    public static async getQuote(amountIDR: number, sourceCurrency: string): Promise<Quote> {
        const priceService = PriceService.getInstance();

        // Static QR: amount not yet known — return oracle estimate only
        if (amountIDR <= 0) {
            const marketPrice = await priceService.getPrice('solana', 'idr');
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

            const res = await fetch(`${JUPITER_QUOTE_API}?${params}`, { timeout: 8000 } as any);
            const data: any = await res.json();

            if (!data.error && data.inAmount && data.outAmount) {
                const inLamports = Number(data.inAmount);
                const solAmount = inLamports / 1_000_000_000;
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
        } catch (err) {
            console.warn('[SWAP] Jupiter unreachable, falling back to oracle:', err);
        }

        // Oracle fallback
        const marketPrice = await priceService.getPrice('solana', 'idr');
        const solNeeded = (amountIDR / marketPrice) * 1.015; // 1.5% buffer
        return {
            sourceCurrency,
            sourceAmount: parseFloat(solNeeded.toFixed(9)),
            targetCurrency: 'IDR',
            targetAmount: amountIDR,
            rate: marketPrice,
            expiresAt: Date.now() + 5 * 60 * 1000,
        };
    }
}
