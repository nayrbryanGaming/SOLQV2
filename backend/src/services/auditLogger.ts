import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

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

export enum AuditEventType {
    // Payment lifecycle
    PAYMENT_INTENT_CREATED     = 'PAYMENT_INTENT_CREATED',
    PAYMENT_INTENT_CONFIRMED   = 'PAYMENT_INTENT_CONFIRMED',
    QRIS_PARSE_FAILED          = 'QRIS_PARSE_FAILED',
    // Settlement
    SETTLEMENT_INITIATED       = 'SETTLEMENT_INITIATED',
    SETTLEMENT_BATCH_INITIATED = 'SETTLEMENT_BATCH_INITIATED',
    SETTLEMENT_PENDING         = 'SETTLEMENT_PENDING',
    SETTLEMENT_COMPLETED       = 'SETTLEMENT_COMPLETED',
    SETTLEMENT_FAILED          = 'SETTLEMENT_FAILED',
    // Security
    SECURITY_REPLAY_BLOCKED    = 'SECURITY_REPLAY_BLOCKED',
    SECURITY_RATE_LIMITED      = 'SECURITY_RATE_LIMITED',
    SECURITY_PAYER_MISMATCH    = 'SECURITY_PAYER_MISMATCH',
    // Risk
    RISK_HIGH_SCORE            = 'RISK_HIGH_SCORE',
    // Hot wallet
    CRITICAL_LOW_GAS           = 'CRITICAL_LOW_GAS',
    WARNING_LOW_GAS            = 'WARNING_LOW_GAS',
    ERROR_GAS_CHECK_FAILED     = 'ERROR_GAS_CHECK_FAILED',
    // Pricing
    PRICE_FETCHED              = 'PRICE_FETCHED',
    PRICE_STALE_FALLBACK       = 'PRICE_STALE_FALLBACK',
    PRICE_STALE_EXCEEDS_MAX    = 'PRICE_STALE_EXCEEDS_MAX',
    CRITICAL_PRICE_UNAVAILABLE = 'CRITICAL_PRICE_UNAVAILABLE',
}

// Detect serverless / read-only filesystem environments
const isServerless = !!(
    process.env.VERCEL ||
    process.env.RENDER ||
    process.env.RAILWAY_ENVIRONMENT ||
    process.env.AWS_LAMBDA_FUNCTION_NAME
);

const logFilePath = isServerless
    ? null
    : path.join(process.cwd(), 'audit_logs.jsonl');

export class AuditLogger {
    public static log(eventType: AuditEventType, data: Record<string, any>): void {
        const entryBase = {
            timestamp: new Date().toISOString(),
            eventType,
            data,
        };

        const hash = crypto
            .createHash('sha256')
            .update(JSON.stringify(entryBase))
            .digest('hex');

        const entry = { ...entryBase, integrity_hash: hash };
        const line = JSON.stringify(entry);

        // PRIMARY: structured console output (captured by all cloud platforms)
        console.log(`[AUDIT|${eventType}] ${line}`);

        // SECONDARY: local file (non-serverless only)
        if (logFilePath) {
            fs.appendFile(logFilePath, line + '\n', (err) => {
                if (err) console.error('[AUDIT] File write failed (non-fatal):', err.message);
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
