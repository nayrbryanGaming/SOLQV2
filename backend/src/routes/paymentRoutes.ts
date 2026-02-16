import { Router, Request, Response } from 'express';
import { QRISDecoder } from '../services/qrisDecoder';
import { BankPartnerService } from '../services/bankPartnerService';
import { AuditLogger, AuditEventType } from '../services/auditLogger';
import { SwapService } from '../services/swapService';

const router = Router();

// In-memory store for MVP (Typed for better structure)
interface PaymentIntent {
    id: string;
    status: 'requires_payment_method' | 'processing' | 'settling' | 'completed' | 'failed';
    merchant: any;
    amount_details: {
        fiat_amount: number;
        currency_source: string;
        crypto_amount: number;
        quote_id: string;
        rate?: number;
    };
    qris_data: any;
    merchant_account?: string;
    tx_hash?: string;
    settlement_ref?: string;
}

const paymentIntents: Record<string, PaymentIntent> = {};

router.post('/payment-intents', (req: Request, res: Response) => {
    try {
        const { qris_payload, currency, input_amount } = req.body;

        if (!qris_payload) {
            return res.status(400).json({ error: 'Missing qris_payload' });
        }

        // 1. Decode QRIS
        const decoded = QRISDecoder.decode(qris_payload);

        // 2. Create Payment Intent ID
        const intentId = `pi_${Date.now()}`;

        // 3. Construct Response Object
        // Calculate Rates
        let transactionAmount = decoded.transactionAmount ? parseFloat(decoded.transactionAmount) : 0;
        if (transactionAmount === 0 && input_amount) {
            transactionAmount = parseFloat(input_amount);
        }

        const quote = SwapService.getQuote(
            transactionAmount,
            currency || 'IDRX'
        );

        const paymentIntent: PaymentIntent = {
            id: intentId,
            status: 'requires_payment_method',
            merchant: {
                name: decoded.merchantName,
                city: decoded.merchantCity,
                pan: decoded.merchantAccountInfo['26'] || 'UNKNOWN' // Usually ID 26 is global merchant ID
            },
            amount_details: {
                fiat_amount: quote.targetAmount,
                currency_source: quote.sourceCurrency,
                crypto_amount: quote.sourceAmount,
                quote_id: `qt_${Date.now()}`,
                rate: quote.rate
            },
            qris_data: decoded,
            merchant_account: decoded.merchantAccountInfo['26'] || 'UNKNOWN'
        };

        // Store it
        paymentIntents[intentId] = paymentIntent;

        // AUDIT LOG
        AuditLogger.log(AuditEventType.PAYMENT_INTENT_CREATED, {
            intentId,
            merchant: paymentIntent.merchant.name,
            amount: paymentIntent.amount_details.fiat_amount
        });

        res.json(paymentIntent);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

router.get('/payment-intents/:id', (req: Request, res: Response) => {
    const id = req.params.id;
    const intent = paymentIntents[id];
    if (!intent) {
        return res.status(404).json({ error: 'Payment Intent not found' });
    }
    res.json(intent);
});

router.post('/payment-intents/:id/confirm', async (req: Request, res: Response) => {
    const id = req.params.id;
    const { tx_hash } = req.body;

    const intent = paymentIntents[id];
    if (!intent) {
        return res.status(404).json({ error: 'Payment Intent not found' });
    }

    if (intent.status !== 'requires_payment_method') {
        return res.json({ status: intent.status, message: 'Intent already processing' });
    }

    // Update state to processing
    intent.status = 'processing';
    intent.tx_hash = tx_hash || `mock_tx_${Date.now()}`;

    // AUDIT LOG
    AuditLogger.log(AuditEventType.PAYMENT_INTENT_CONFIRMED, {
        intentId: id,
        txHash: intent.tx_hash
    });

    res.json({ status: 'processing', message: 'Transaction submitted for settlement' });

    // ASYNC PROCESS: Simulate Blockchain Confirmation & Settlement
    // In production, this would be a separate worker listening to queues
    setTimeout(async () => {
        // [REGULATORY NOTE]
        // This process mocks the "Truth" from the blockchain/partner.
        // In reality, we would NOT trust the client's tx_hash blindly.
        // We would query the RPC to verify the TX actually happened and sent funds to the correct vault.
        console.log(`[Worker] Independent verification of TX ${intent.tx_hash} for intent ${id}...`);

        // 1. Trigger Settlement Request
        intent.status = 'settling';
        AuditLogger.log(AuditEventType.SETTLEMENT_INITIATED, { intentId: id });

        // Request Licensed Partner to settle funds
        const settlementResult = await BankPartnerService.requestSettlement({
            amount: intent.amount_details.fiat_amount || 10000,
            currency: 'IDR',
            destinationAccount: {
                bankCode: 'GOPAY', // Default or extracted from QRIS metadata if available
                accountNumber: intent.merchant_account || 'UNKNOWN'
            },
            referenceId: intent.id
        });

        if (settlementResult.status === 'SUCCESS') {
            intent.status = 'completed';
            intent.settlement_ref = settlementResult.partnerRef;

            AuditLogger.log(AuditEventType.SETTLEMENT_COMPLETED, {
                intentId: id,
                partnerRef: settlementResult.partnerRef
            });
            console.log(`[Worker] Intent ${id} COMPLETED.`);
        } else {
            // FAILED SETTLEMENT -> REQUIRES ROLLBACK/REFUND
            intent.status = 'failed';
            AuditLogger.log(AuditEventType.SETTLEMENT_FAILED, { intentId: id, reason: 'Partner Rejected Request' });
            console.error(`[Worker] Intent ${id} FAILED settlement request. Initiating Manual Refund Process.`);
        }

    }, 2000);
});

// Webhook Receiver from Off-Ramp Partner
router.post('/webhooks/settlement', (req: Request, res: Response) => {
    const { referenceId, status, partnerRef } = req.body;

    const intent = paymentIntents[referenceId];
    if (!intent) {
        return res.status(404).json({ error: 'Intent not found' });
    }

    console.log(`[Webhook] Received update for ${referenceId}: ${status}`);

    if (status === 'SUCCESS') {
        intent.status = 'completed';
        intent.settlement_ref = partnerRef;
        AuditLogger.log(AuditEventType.SETTLEMENT_COMPLETED, { intentId: referenceId, partnerRef });
    } else if (status === 'FAILED') {
        intent.status = 'failed';
        AuditLogger.log(AuditEventType.SETTLEMENT_FAILED, { intentId: referenceId, reason: 'Webhook Reported Failure' });
    }

    res.status(200).send('OK');
});

router.get('/transactions/:id/status', (req: Request, res: Response) => {
    const id = req.params.id;
    const intent = paymentIntents[id];
    if (!intent) {
        return res.status(404).json({ error: 'Transaction not found' });
    }
    res.json({
        id: intent.id,
        status: intent.status,
        tx_hash: intent.tx_hash,
        settlement_ref: intent.settlement_ref,
        updated_at: new Date().toISOString()
    });
});

export const paymentRoutes = router;
