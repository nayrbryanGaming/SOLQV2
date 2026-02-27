import { paymentIntents } from './store';
import { AuditLogger, AuditEventType } from './auditLogger';

export class ReconciliationWorker {

    /**
     * Runs a reconciliation job to find stuck transactions
     */
    public static async run() {
        console.log('[Reconciliation] Starting autonomous audit...');

        const now = Date.now();
        const STUCK_THRESHOLD = 5 * 60 * 1000; // 5 minutes

        for (const id in paymentIntents) {
            const intent = paymentIntents[id];

            // Detecting stuck "AUTHORIZATION_REQUESTED", "AUTHORIZED", or "AWAITING_SETTLEMENT" transactions
            if (intent.status === 'AUTHORIZATION_REQUESTED' || intent.status === 'AUTHORIZED' || intent.status === 'AWAITING_SETTLEMENT') {
                const age = now - (intent.createdAt ? new Date(intent.createdAt).getTime() : now);

                if (age > STUCK_THRESHOLD) {
                    console.warn(`[Reconciliation] 🚨 STUCK DETECTED: Intent ${id} | State: ${intent.status}`);

                    // Force Fail stuck intents to allow user retry or cleanup
                    intent.status = 'FAILED';

                    AuditLogger.log(AuditEventType.SETTLEMENT_FAILED, {
                        intentId: id,
                        reason: `Reconciliation Timeout (${STUCK_THRESHOLD}ms)`
                    });
                }
            }
        }
    }
}

// Self-executing if run directly
if (require.main === module) {
    setInterval(() => {
        ReconciliationWorker.run();
    }, 60000); // Audit every minute
}
