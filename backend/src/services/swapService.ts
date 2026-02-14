/**
 * Swap Service (Mock)
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

export class SwapService {
    // Mock Exchange Rates (1 IDR = X Source)
    private static rates: Record<string, number> = {
        'USDC': 0.000065, // 1 IDR = 0.000065 USDC (~15,384 IDR/USDC)
        'SOL': 0.0000025, // 1 IDR = 0.0000025 SOL (~400,000 IDR/SOL)
        'IDRX': 1.0       // 1 IDR = 1 IDRX (Stable)
    };

    /**
     * Get a quote for a specific amount of IDR
     * @param amountIDR The amount in Rupiah to settle
     * @param sourceCurrency The crypto asset user wants to pay with
     */
    public static getQuote(amountIDR: number, sourceCurrency: string): Quote {
        const rate = this.rates[sourceCurrency] || 0;

        // Calculate crypto amount needed
        // Add 1% spread for slippage/fees
        const baseAmount = amountIDR * rate;
        const totalAmount = baseAmount * 1.01;

        return {
            sourceCurrency,
            sourceAmount: parseFloat(totalAmount.toFixed(6)),
            targetCurrency: 'IDR',
            targetAmount: amountIDR,
            rate,
            expiresAt: Date.now() + (5 * 60 * 1000) // 5 minutes expiry
        };
    }
}
