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

// In-memory GC: evict intents older than 24h from the runtime map.
// BUG-064: This only removes from memory — persistent records live in Prisma (DB).
// OJK APU/PPT requires 5-year retention; NEVER delete from DB. Prisma.sync() wrote them already.
setInterval(() => {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    let count = 0;
    for (const id in paymentIntents) {
        if (new Date(paymentIntents[id].createdAt).getTime() < oneDayAgo) {
            delete paymentIntents[id];
            count++;
        }
    }
    if (count > 0) {
        console.log(`[GC] Evicted ${count} intents from memory (persisted in DB per OJK 5-year retention).`);
    }
}, 3600000);
