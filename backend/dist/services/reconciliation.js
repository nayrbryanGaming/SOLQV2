"use strict";
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
exports.ReconciliationWorker = void 0;
const store_1 = require("./store");
const auditLogger_1 = require("./auditLogger");
class ReconciliationWorker {
    /**
     * Runs a reconciliation job to find stuck transactions
     */
    static run() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('[Reconciliation] Starting autonomous audit...');
            const now = Date.now();
            const STUCK_THRESHOLD = 5 * 60 * 1000; // 5 minutes
            for (const id in store_1.paymentIntents) {
                const intent = store_1.paymentIntents[id];
                // Detecting stuck "AUTHORIZATION_REQUESTED", "AUTHORIZED", or "AWAITING_SETTLEMENT" transactions
                if (intent.status === 'AUTHORIZATION_REQUESTED' || intent.status === 'AUTHORIZED' || intent.status === 'AWAITING_SETTLEMENT') {
                    const age = now - (intent.createdAt ? new Date(intent.createdAt).getTime() : now);
                    if (age > STUCK_THRESHOLD) {
                        console.warn(`[Reconciliation] 🚨 STUCK DETECTED: Intent ${id} | State: ${intent.status}`);
                        // Force Fail stuck intents to allow user retry or cleanup
                        intent.status = 'FAILED';
                        auditLogger_1.AuditLogger.log(auditLogger_1.AuditEventType.SETTLEMENT_FAILED, {
                            intentId: id,
                            reason: `Reconciliation Timeout (${STUCK_THRESHOLD}ms)`
                        });
                    }
                }
            }
        });
    }
}
exports.ReconciliationWorker = ReconciliationWorker;
// Self-executing if run directly
if (require.main === module) {
    setInterval(() => {
        ReconciliationWorker.run();
    }, 60000); // Audit every minute
}
