import { Router, Request, Response } from 'express';
import { QRISDecoder } from '../services/qrisDecoder';
import { BankPartnerService } from '../services/bankPartnerService';
import { AuditLogger, AuditEventType } from '../services/auditLogger';
import { SwapService } from '../services/swapService';

const router = Router();

// In-memory store for MVP (Typed for better structure)
import { paymentIntents, PaymentIntent } from '../services/store';


router.post('/payment-intents', async (req: Request, res: Response) => {
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

        const quote = await SwapService.getQuote(
            transactionAmount,
            currency || 'IDRX'
        );

        const merchant_account = QRISDecoder.extractAccountNumber(decoded) || 'UNKNOWN';
        const nmid = QRISDecoder.extractAccountNumber(decoded); // Re-using robust extraction for NMID-like fields
        const bankCode = QRISDecoder.detectBank(decoded);

        const platformFee = quote.targetAmount * 0.01;
        const estNetworkFee = 0.000005; // Standard Solana gas
        const savingsVsLegacy = quote.targetAmount * 0.02; // Assuming legacy is 3% and we are 1%

        const paymentIntent: PaymentIntent = {
            id: intentId,
            status: 'CREATED',
            merchant: {
                name: decoded.merchantName,
                city: decoded.merchantCity,
                pan: merchant_account
            },
            amount_details: {
                fiat_amount: quote.targetAmount,
                currency_source: quote.sourceCurrency,
                crypto_amount: quote.sourceAmount,
                quote_id: `qt_${Date.now()}`,
                rate: quote.rate
            },
            qris_data: decoded,
            merchant_account: merchant_account,
            bank_code: bankCode,
            platformFee: platformFee,
            networkFee: estNetworkFee,
            slippage: 0.5, // 0.5% default
            maxFee: quote.targetAmount + platformFee,
            effectiveFeePercent: 1.0,
            userSavingsVsQris: savingsVsLegacy,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
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

    if (intent.status !== 'CREATED' && intent.status !== 'AUTHORIZATION_REQUESTED') {
        return res.json({ status: intent.status, message: 'Intent already processing' });
    }

    // REAL ON-CHAIN VERIFICATION
    const solanaService = require('../services/solanaService').default;

    // Verify transaction
    const isValid = await solanaService.verifyTransaction(tx_hash || '');

    if (!isValid) {
        return res.status(400).json({ status: 'failed', message: 'On-chain verification failed or pending' });
    }

    // Update state to authorized
    intent.status = 'AUTHORIZED';
    intent.txHash = tx_hash;

    // AUDIT LOG
    AuditLogger.log(AuditEventType.PAYMENT_INTENT_CONFIRMED, {
        intentId: id,
        txHash: intent.txHash
    });

    // IMMEDIATE EXECUTION: Settlement Bridge (No fake delays)
    // IMMEDIATE EXECUTION: Settlement Bridge (No fake delays)

    intent.status = 'AWAITING_SETTLEMENT';

    try {
        const settlementResult = await BankPartnerService.requestSettlement({
            amount: intent.amount_details.fiat_amount,
            currency: 'IDR',
            destinationAccount: {
                bankCode: intent.bank_code || 'GOPAY',
                accountNumber: intent.merchant_account || ''
            },
            referenceId: intent.id
        });

        if (settlementResult.status === 'SUCCESS') {
            intent.status = 'COMPLETED';
            intent.settlement_ref = settlementResult.partnerRef;
            AuditLogger.log(AuditEventType.SETTLEMENT_COMPLETED, {
                intentId: id,
                partnerRef: settlementResult.partnerRef,
                balance_delta: `+IDR ${intent.amount_details.fiat_amount.toLocaleString()}`,
                destination: intent.merchant.pan
            });
            return res.json({ status: 'COMPLETED', message: 'Payment finalized. Funds sent to merchant.', txHash: intent.txHash, settlement_ref: intent.settlement_ref });
        } else {
            intent.status = 'FAILED';
            return res.status(500).json({ status: 'FAILED', message: 'Settlement Bridge Failure' });
        }
    } catch (err) {
        intent.status = 'FAILED';
        return res.status(500).json({ status: 'FAILED', message: 'Internal Orchestration Error' });
    }
});

// Webhook Receiver from Off-Ramp Partner
router.post('/webhooks/settlement', (req: Request, res: Response) => {
    const { referenceId, status, partnerRef } = req.body;

    const intent = paymentIntents[referenceId];
    if (!intent) {
        return res.status(404).json({ error: 'Intent not found' });
    }

    if (status === 'SUCCESS') {
        intent.status = 'COMPLETED';
        intent.settlement_ref = partnerRef;
        AuditLogger.log(AuditEventType.SETTLEMENT_COMPLETED, { intentId: referenceId, partnerRef });
    } else if (status === 'FAILED') {
        intent.status = 'FAILED';
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
        txHash: intent.txHash,
        settlement_ref: intent.settlement_ref,
        updated_at: new Date().toISOString()
    });
});

router.get('/stats', (req: Request, res: Response) => {
    const successCount = Object.values(paymentIntents).filter(intent => intent.status === 'COMPLETED').length;
    res.json({ success_count: successCount });
});

export const paymentRoutes = router;
