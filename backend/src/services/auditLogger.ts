import fs from 'fs';
import path from 'path';

/**
 * Compliance Audit Logger
 * Records immutable logs of all financial transactions and state changes.
 * In production, this should write to a WORM (Write Once Read Many) storage.
 */

export enum AuditEventType {
    PAYMENT_INTENT_CREATED = 'PAYMENT_INTENT_CREATED',
    PAYMENT_INTENT_CONFIRMED = 'PAYMENT_INTENT_CONFIRMED',
    SETTLEMENT_INITIATED = 'SETTLEMENT_INITIATED',
    SETTLEMENT_COMPLETED = 'SETTLEMENT_COMPLETED',
    SETTLEMENT_FAILED = 'SETTLEMENT_FAILED',
}

export class AuditLogger {
    private static logFile = path.join(__dirname, '../../audit_logs.jsonl');

    public static log(eventType: AuditEventType, data: any) {
        const entry = {
            timestamp: new Date().toISOString(),
            eventType,
            data,
            hash: 'SHA256_PLACEHOLDER' // In prod, hash previous log for chain of custody
        };

        const logLine = JSON.stringify(entry) + '\n';

        // Append to local file (simulating secure storage)
        fs.appendFile(this.logFile, logLine, (err) => {
            if (err) console.error('FAILED TO WRITE AUDIT LOG', err);
        });

        console.log(`[AUDIT] ${eventType}`, JSON.stringify(data));
    }
}
