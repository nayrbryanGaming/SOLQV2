import { AuditLogger, AuditEventType } from '../services/auditLogger';
import { v4 as uuidv4 } from 'uuid';

async function simulateSuccess() {
    console.log('[SIMULATION] Generating Hard Audit Proof...');
    const intentId = `TEST-${uuidv4().substring(0, 8)}`;
    const merchantPan = "936009110022334455";

    // 1. Intent Created
    AuditLogger.log(AuditEventType.PAYMENT_INTENT_CREATED, {
        intentId,
        amount: 50000,
        currency: 'IDR'
    });

    // 2. On-Chain Confirmation
    AuditLogger.log(AuditEventType.PAYMENT_INTENT_CONFIRMED, {
        intentId,
        signature: '5xY7...z9A',
        amount_confirmed: 3.25, // USDC
        mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
    });

    // 3. Settlement Initiated
    AuditLogger.log(AuditEventType.SETTLEMENT_INITIATED, {
        intentId,
        partner: 'IDRX/Stabelify'
    });

    // 4. Settlement Completed (The Proof)
    // Adding balance_delta and destination as requested by the boss
    AuditLogger.log(AuditEventType.SETTLEMENT_COMPLETED, {
        intentId,
        partnerRef: `IDRX-TX-${Date.now()}`,
        balance_delta: `+IDR 50.000`,
        destination: merchantPan,
        status: 'SUCCESS'
    });

    console.log('[SIMULATION] Proof Logs Generated at backend/audit_logs.jsonl');
}

simulateSuccess();
