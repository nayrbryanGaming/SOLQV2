"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditLogger = exports.AuditEventType = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
/**
 * Compliance Audit Logger
 * Records immutable logs of all financial transactions and state changes.
 * In production, this should write to a WORM (Write Once Read Many) storage.
 */
var AuditEventType;
(function (AuditEventType) {
    AuditEventType["PAYMENT_INTENT_CREATED"] = "PAYMENT_INTENT_CREATED";
    AuditEventType["PAYMENT_INTENT_CONFIRMED"] = "PAYMENT_INTENT_CONFIRMED";
    AuditEventType["SETTLEMENT_INITIATED"] = "SETTLEMENT_INITIATED";
    AuditEventType["SETTLEMENT_COMPLETED"] = "SETTLEMENT_COMPLETED";
    AuditEventType["SETTLEMENT_FAILED"] = "SETTLEMENT_FAILED";
})(AuditEventType || (exports.AuditEventType = AuditEventType = {}));
class AuditLogger {
    static log(eventType, data) {
        const entry = {
            timestamp: new Date().toISOString(),
            eventType,
            data,
            hash: 'SHA256_PLACEHOLDER' // In prod, hash previous log for chain of custody
        };
        const logLine = JSON.stringify(entry) + '\n';
        // Append to local file (simulating secure storage)
        fs_1.default.appendFile(this.logFile, logLine, (err) => {
            if (err)
                console.error('FAILED TO WRITE AUDIT LOG', err);
        });
        console.log(`[AUDIT] ${eventType}`, JSON.stringify(data));
    }
}
exports.AuditLogger = AuditLogger;
AuditLogger.logFile = path_1.default.join(__dirname, '../../audit_logs.jsonl');
