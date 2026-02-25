"use strict";
/**
 * Reconciliation Service
 * Periodic worker that checks for stalled or inconsistent transactions.
 */
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
const auditLogger_1 = require("./auditLogger");
class ReconciliationWorker {
    /**
     * Runs a reconciliation job to find stuck transactions
     * @param intents List of active payment intents from DB
     */
    static run(intents) {
        return __awaiter(this, void 0, void 0, function* () {
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
                    auditLogger_1.AuditLogger.log(auditLogger_1.AuditEventType.SETTLEMENT_FAILED, {
                        intentId: id,
                        reason: 'Reconciliation Timeout - Unknown State'
                    });
                }
            }
            console.log('[Reconciliation] Job complete.');
        });
    }
}
exports.ReconciliationWorker = ReconciliationWorker;
// Self-executing if run directly
if (require.main === module) {
    // interval 
    setInterval(() => {
        ReconciliationWorker.run({}); // Pass mock DB or connect to real one
    }, 60000);
}
