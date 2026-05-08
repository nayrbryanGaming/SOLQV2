import prisma from './prisma';
import { paymentIntents } from './store';
import { encryptField } from './fieldEncryption';

// Status mapping: runtime API status → Prisma TransactionStatus enum
const STATUS_MAP: Record<string, string> = {
    'CREATED':                  'CREATED',
    'AUTHORIZATION_REQUESTED':  'USER_CONFIRMING',
    'AUTHORIZED':               'ON_CHAIN_CONFIRMED',
    'AWAITING_SETTLEMENT':      'SETTLEMENT_PROCESSING',
    'SETTLEMENT_QUEUED':        'SETTLEMENT_QUEUED',
    'SETTLEMENT_FAILED':        'SETTLEMENT_FAILED',
    'COMPLETED':                'SETTLEMENT_COMPLETE',
    'FAILED':                   'FAILED',
    'BLOCKED':                  'BLOCKED',
};

// BUG-NEW-009 FIX: TTL cleanup — expire PENDING intents older than 30 minutes.
// Runs every 15 minutes. Soft-delete only (sets deletedAt) per OJK retention rules.
async function expireStaleIntents(): Promise<void> {
    if (!process.env.DATABASE_URL) return;
    try {
        const cutoff = new Date(Date.now() - 30 * 60 * 1000);
        const result = await (prisma.paymentIntent as any).updateMany({
            where: {
                status: { in: ['CREATED', 'USER_CONFIRMING'] },
                createdAt: { lt: cutoff },
                deletedAt: null,
            },
            data: { status: 'FAILED', deletedAt: new Date() },
        });
        if (result.count > 0) console.log(`[TTL] Expired ${result.count} stale payment intents`);
    } catch (e) {
        console.warn('[TTL] Expire stale intents failed (non-fatal):', e instanceof Error ? e.message : e);
    }
}
setInterval(expireStaleIntents, 15 * 60 * 1000);

// BUG-040/BUG-059 FIX: Sync in-memory payment intent to Prisma after every state change.
// Uses upsert so the first call creates the record; subsequent calls update it.
// Non-fatal: in-memory store remains source of truth while DB migration is transitional.
export class PrismaPaymentStore {
    private static isEnabled(): boolean {
        return !!process.env.DATABASE_URL;
    }

    static async sync(id: string): Promise<void> {
        if (!this.isEnabled()) return;
        const intent = paymentIntents[id];
        if (!intent) return;

        const prismaStatus = STATUS_MAP[intent.status] ?? intent.status;

        try {
            await (prisma.paymentIntent as any).upsert({
                where: { id: intent.id },
                create: {
                    id:                 intent.id,
                    merchantName:       intent.merchant?.name || 'UNKNOWN',
                    merchantCity:       intent.merchant?.city,
                    merchantNMID:       intent.nmid,
                    merchantAccount:    intent.merchant_account ? encryptField(intent.merchant_account) : null,
                    amountIDR:          Math.round(intent.amount_details?.fiat_amount || 0),
                    tokenUsed:          intent.amount_details?.currency_source || 'IDRX',
                    payerPublicKey:     intent.payer_account || 'PENDING',
                    payerWalletType:    'PHANTOM',
                    status:             prismaStatus,
                    solanaTxSignature:  intent.txHash ?? null,
                },
                update: {
                    status:             prismaStatus,
                    solanaTxSignature:  intent.txHash ?? null,
                    payerPublicKey:     intent.payer_account || 'PENDING',
                    ...(intent.status === 'AUTHORIZED'  && { confirmedAt:   new Date() }),
                    ...(intent.status === 'COMPLETED'   && { settlementAt:  new Date() }),
                },
            });
        } catch (e) {
            console.warn('[PrismaStore] sync failed (non-fatal):', e instanceof Error ? e.message : String(e));
        }
    }
}
