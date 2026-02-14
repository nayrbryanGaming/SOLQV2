/**
 * Reconciliation Service
 * Periodic worker that checks for stalled or inconsistent transactions.
 */

import { AuditLogger, AuditEventType } from './auditLogger';

// Mock database access (In prod, this would be TypeORM/Prisma)
interface PaymentIntent {
    id: string;
    status: string;
    created_at: number;
}

export class ReconciliationWorker {

    /**
     * Runs a reconciliation job to find stuck transactions
     * @param intents List of active payment intents from DB
     */
    public static async run(intents: Record<string, any>) {
        console.log('[Reconciliation] Starting job...');

        const now = Date.now();
        const STUCK_THRESHOLD = 5 * 60 * 1000; // 5 minutes

        for (const id in intents) {
            const intent = intents[id];

            // detecting stuck "processing" transactions
            if (intent.status === 'processing') {
                // In a real DB, we'd check `updated_at`
                // For MVP, we assume if it's processing for too long without settlement, it's stuck.
                console.warn(`[Reconciliation] Flagging potentially stuck intent: ${id}`);

                // Log anomaly
                AuditLogger.log(AuditEventType.SETTLEMENT_FAILED, {
                    intentId: id,
                    reason: 'Reconciliation Timeout - Unknown State'
                });
            }
        }

        console.log('[Reconciliation] Job complete.');
    }
}

// Self-executing if run directly
if (require.main === module) {
    // interval 
    setInterval(() => {
        ReconciliationWorker.run({}); // Pass mock DB or connect to real one
    }, 60000);
}
