import { paymentIntents } from './store';
import { AuditLogger, AuditEventType } from './auditLogger';

export class ReconciliationWorker {

    /**
     * Runs a reconciliation job to find stuck transactions
     */
    public static async run() {
        console.log('[Reconciliation] Starting autonomous audit...');

        const now = Date.now();
        // Authorization must complete within 10 minutes — wallet sign takes seconds
        const AUTH_STUCK_MS = 10 * 60 * 1000;
        // AWAITING_SETTLEMENT is legitimate — IDRX partner can take hours; give 4 hours before alerting
        const SETTLEMENT_ALERT_MS = 4 * 60 * 60 * 1000;

        for (const id in paymentIntents) {
            const intent = paymentIntents[id];
            const lastUpdated = intent.updatedAt
                ? new Date(intent.updatedAt).getTime()
                : new Date(intent.createdAt).getTime();

            if (intent.status === 'AUTHORIZATION_REQUESTED' || intent.status === 'AUTHORIZED') {
                const age = now - lastUpdated;
                if (age > AUTH_STUCK_MS) {
                    console.warn(`[Reconciliation] 🚨 STUCK AUTH: Intent ${id} | State: ${intent.status} | Age: ${Math.round(age / 60000)}m`);
                    intent.status = 'FAILED';
                    intent.updatedAt = new Date().toISOString();
                    AuditLogger.log(AuditEventType.SETTLEMENT_FAILED, {
                        intentId: id,
                        reason: `Auth timeout after ${Math.round(age / 60000)} minutes`
                    });
                }
            } else if (intent.status === 'AWAITING_SETTLEMENT') {
                const age = now - lastUpdated;
                if (age > SETTLEMENT_ALERT_MS) {
                    // Log alert but do NOT auto-fail — IDRX funds are safe in treasury
                    console.warn(`[Reconciliation] ⚠️ SETTLEMENT DELAYED: Intent ${id} | Age: ${Math.round(age / 3600000)}h | Funds secured in treasury`);
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
