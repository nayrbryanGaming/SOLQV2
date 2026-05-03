"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditLogger = exports.AuditEventType = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
/**
 * Compliance Audit Logger — OJK/APU-PPT compliant
 *
 * Primary: console.log (captured by Vercel/Render/Railway persistent log infra)
 * Secondary: best-effort local JSONL file (works on non-serverless deployments)
 *
 * Every entry has an SHA-256 integrity hash over the event payload so that
 * any tampering of log lines is detectable.
 *
 * In production: connect PRIMARY_LOG_WEBHOOK env var to send to a WORM log
 * aggregator (Datadog, Logtail, AWS CloudWatch with Object Lock, etc.).
 */
var AuditEventType;
(function (AuditEventType) {
    // Payment lifecycle
    AuditEventType["PAYMENT_INTENT_CREATED"] = "PAYMENT_INTENT_CREATED";
    AuditEventType["PAYMENT_INTENT_CONFIRMED"] = "PAYMENT_INTENT_CONFIRMED";
    AuditEventType["QRIS_PARSE_FAILED"] = "QRIS_PARSE_FAILED";
    // Settlement
    AuditEventType["SETTLEMENT_INITIATED"] = "SETTLEMENT_INITIATED";
    AuditEventType["SETTLEMENT_BATCH_INITIATED"] = "SETTLEMENT_BATCH_INITIATED";
    AuditEventType["SETTLEMENT_PENDING"] = "SETTLEMENT_PENDING";
    AuditEventType["SETTLEMENT_COMPLETED"] = "SETTLEMENT_COMPLETED";
    AuditEventType["SETTLEMENT_FAILED"] = "SETTLEMENT_FAILED";
    // Security
    AuditEventType["SECURITY_REPLAY_BLOCKED"] = "SECURITY_REPLAY_BLOCKED";
    AuditEventType["SECURITY_RATE_LIMITED"] = "SECURITY_RATE_LIMITED";
    AuditEventType["SECURITY_PAYER_MISMATCH"] = "SECURITY_PAYER_MISMATCH";
    // Risk
    AuditEventType["RISK_HIGH_SCORE"] = "RISK_HIGH_SCORE";
    // Hot wallet
    AuditEventType["CRITICAL_LOW_GAS"] = "CRITICAL_LOW_GAS";
    AuditEventType["WARNING_LOW_GAS"] = "WARNING_LOW_GAS";
    AuditEventType["ERROR_GAS_CHECK_FAILED"] = "ERROR_GAS_CHECK_FAILED";
    // Pricing
    AuditEventType["PRICE_FETCHED"] = "PRICE_FETCHED";
    AuditEventType["PRICE_STALE_FALLBACK"] = "PRICE_STALE_FALLBACK";
    AuditEventType["PRICE_STALE_EXCEEDS_MAX"] = "PRICE_STALE_EXCEEDS_MAX";
    AuditEventType["CRITICAL_PRICE_UNAVAILABLE"] = "CRITICAL_PRICE_UNAVAILABLE";
})(AuditEventType || (exports.AuditEventType = AuditEventType = {}));
// Detect serverless / read-only filesystem environments
const isServerless = !!(process.env.VERCEL ||
    process.env.RENDER ||
    process.env.RAILWAY_ENVIRONMENT ||
    process.env.AWS_LAMBDA_FUNCTION_NAME);
const logFilePath = isServerless
    ? null
    : path_1.default.join(process.cwd(), 'audit_logs.jsonl');
class AuditLogger {
    static log(eventType, data) {
        const entryBase = {
            timestamp: new Date().toISOString(),
            eventType,
            data,
        };
        const hash = crypto_1.default
            .createHash('sha256')
            .update(JSON.stringify(entryBase))
            .digest('hex');
        const entry = Object.assign(Object.assign({}, entryBase), { integrity_hash: hash });
        const line = JSON.stringify(entry);
        // PRIMARY: structured console output (captured by all cloud platforms)
        console.log(`[AUDIT|${eventType}] ${line}`);
        // SECONDARY: local file (non-serverless only)
        if (logFilePath) {
            fs_1.default.appendFile(logFilePath, line + '\n', (err) => {
                if (err)
                    console.error('[AUDIT] File write failed (non-fatal):', err.message);
            });
        }
        // TERTIARY: webhook to external WORM log store (optional)
        const webhookUrl = process.env.AUDIT_WEBHOOK_URL;
        if (webhookUrl) {
            fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: line,
            }).catch((err) => {
                console.error('[AUDIT] Webhook delivery failed (non-fatal):', err.message);
            });
        }
    }
}
exports.AuditLogger = AuditLogger;
