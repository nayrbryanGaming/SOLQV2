export interface PaymentIntent {
    id: string;
    status: 'CREATED' | 'AUTHORIZATION_REQUESTED' | 'AUTHORIZED' | 'AWAITING_SETTLEMENT' | 'SETTLEMENT_QUEUED' | 'SETTLEMENT_FAILED' | 'COMPLETED' | 'FAILED';
    merchant: any;
    amount_details: {
        fiat_amount: number;
        currency_source: string;
        crypto_amount: number;
        quote_id: string;
        rate?: number;
    };
    qris_data: any;
    merchant_account?: string;
    bank_code?: string;
    nmid?: string;
    txHash?: string;
    settlement_ref?: string;
    payer_account?: string;
    input_mint?: string;
    expected_output_mint?: string;
    expected_atomic_amount?: number;
    expected_recipient_ata?: string;
    platformFee?: number;
    networkFee?: number;
    slippage?: number;
    maxFee?: number;
    effectiveFeePercent?: number;
    userSavingsVsQris?: number;
    createdAt: string;
    updatedAt: string;
}

export const paymentIntents: Record<string, PaymentIntent> = {};

// MILITARY-GRADE SCALE OPTIMIZATION: Garbage Collector
// Automatically cleans up old intents every 60 minutes to prevent memory leaks in 30k/day traffic
setInterval(() => {
    const now = new Date();
    const oneDayAgo = now.getTime() - (24 * 60 * 60 * 1000);

    let count = 0;
    for (const id in paymentIntents) {
        const createdAt = new Date(paymentIntents[id].createdAt).getTime();
        if (createdAt < oneDayAgo) {
            delete paymentIntents[id];
            count++;
        }
    }
    if (count > 0) {
        console.log(`[GC] Cleaned up ${count} expired payment intents. Memory optimized for high-volume 24h cycle.`);
    }
}, 3600000); // Every hour
