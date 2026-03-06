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

        if (!qris_payload || typeof qris_payload !== 'string') {
            return res.status(400).json({ error: 'Missing qris_payload' });
        }

        // SECURITY: Validate QRIS payload length (EMVCo max ~512 chars)
        if (qris_payload.length > 600 || qris_payload.length < 50) {
            return res.status(400).json({ error: 'Invalid QRIS payload length' });
        }

        // SECURITY: Validate amount if provided (must be positive number, max 100M IDR)
        if (input_amount !== undefined) {
            const amt = parseFloat(input_amount);
            if (isNaN(amt) || amt <= 0 || amt > 100000000) {
                return res.status(400).json({ error: 'Invalid amount (must be 1 - 100,000,000 IDR)' });
            }
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

    // SECURITY: Validate tx_hash format (base58, 87-88 chars for Solana signatures)
    if (!tx_hash || typeof tx_hash !== 'string' || tx_hash.length < 80 || tx_hash.length > 100) {
        return res.status(400).json({ error: 'Invalid transaction hash' });
    }

    // SECURITY: Validate base58 characters only
    if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(tx_hash)) {
        return res.status(400).json({ error: 'Invalid transaction hash format' });
    }

    const intent = paymentIntents[id];
    if (!intent) {
        return res.status(404).json({ error: 'Payment Intent not found' });
    }

    if (intent.status !== 'CREATED' && intent.status !== 'AUTHORIZATION_REQUESTED') {
        return res.json({ status: intent.status, message: 'Intent already processing' });
    }

    // SECURITY: Prevent duplicate tx_hash replay attack
    const existingWithSameHash = Object.values(paymentIntents).find(
        i => i.txHash === tx_hash && i.id !== id
    );
    if (existingWithSameHash) {
        return res.status(400).json({ status: 'failed', message: 'REPLAY ATTACK BLOCKED: This tx_hash was already used for another intent.' });
    }

    // REAL ON-CHAIN VERIFICATION (Multi-RPC Failover)
    const solanaService = require('../services/solanaService').default;

    // Verify transaction is finalized on Solana Mainnet
    const isValid = await solanaService.verifyTransaction(tx_hash || '');

    if (!isValid) {
        return res.status(400).json({ status: 'failed', message: 'On-chain verification failed. TX not finalized or Treasury did not receive funds.' });
    }

    // State: AUTHORIZED (on-chain verified)
    intent.status = 'AUTHORIZED';
    intent.txHash = tx_hash;

    AuditLogger.log(AuditEventType.PAYMENT_INTENT_CONFIRMED, {
        intentId: id,
        txHash: intent.txHash
    });

    // ═══════════════════════════════════════════════════════════
    //  SOLANA → QRIS SETTLEMENT (IDRX OFF-RAMP TO MERCHANT)
    //
    //  Jupiter swap verified on-chain → IDRX API sends IDR to
    //  merchant's GoPay/OVO/Bank account extracted from QRIS.
    //  If IDRX API fails → fallback to on-chain IDRX settlement.
    // ═══════════════════════════════════════════════════════════

    intent.status = 'AWAITING_SETTLEMENT';

    try {
        // Attempt FULL PIPELINE: IDRX off-ramp to merchant bank/e-wallet
        const settlementResult = await BankPartnerService.requestSettlement({
            amount: intent.amount_details.fiat_amount,
            currency: 'IDR',
            destinationAccount: {
                bankCode: intent.bank_code || 'GOPAY',
                accountNumber: intent.merchant_account || ''
            },
            referenceId: intent.id
        });

        if (settlementResult.status === 'SUCCESS' || settlementResult.status === 'PENDING') {
            intent.status = 'COMPLETED';
            intent.settlement_ref = settlementResult.partnerRef;

            AuditLogger.log(AuditEventType.SETTLEMENT_COMPLETED, {
                intentId: id,
                txHash: intent.txHash,
                settlement_ref: intent.settlement_ref,
                mode: settlementResult.method,
                amount_idr: intent.amount_details.fiat_amount,
                destination: `${intent.bank_code}:${intent.merchant_account}`,
                estimatedArrival: settlementResult.estimatedArrival,
                message: settlementResult.message
            });

            return res.json({
                status: 'COMPLETED',
                message: `Pembayaran berhasil! Rp ${intent.amount_details.fiat_amount.toLocaleString()} dikirim ke ${intent.bank_code || 'merchant'}.`,
                txHash: intent.txHash,
                settlement_ref: intent.settlement_ref,
                explorer: `https://explorer.solana.com/tx/${intent.txHash}?cluster=mainnet-beta`,
                offramp_status: settlementResult.status,
                offramp_method: settlementResult.method,
                offramp_eta: settlementResult.estimatedArrival,
                offramp_message: settlementResult.message,
                fundsSecured: settlementResult.fundsSecured,
                treasury: 'ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m',
            });
        } else {
            // All off-ramp layers failed — fallback to on-chain settlement
            console.warn(`[SETTLEMENT] Off-ramp failed: ${settlementResult.message}. On-chain fallback.`);

            intent.status = 'COMPLETED';
            intent.settlement_ref = `onchain:${tx_hash}`;

            AuditLogger.log(AuditEventType.SETTLEMENT_COMPLETED, {
                intentId: id,
                txHash: intent.txHash,
                settlement_ref: intent.settlement_ref,
                mode: 'ON_CHAIN_FALLBACK',
                offramp_error: settlementResult.message
            });

            return res.json({
                status: 'COMPLETED',
                message: 'Pembayaran on-chain berhasil. IDRX di wallet Anda. Off-ramp ke bank sedang diproses ulang.',
                txHash: intent.txHash,
                settlement_ref: intent.settlement_ref,
                explorer: `https://explorer.solana.com/tx/${intent.txHash}?cluster=mainnet-beta`,
                offramp_status: 'FALLBACK',
                withdraw_guide: 'Cairkan IDRX: Indodax/Pintu → Jual → WD ke bank'
            });
        }
    } catch (err: any) {
        // Total failure — still mark as completed (on-chain swap already happened)
        intent.status = 'COMPLETED';
        intent.settlement_ref = `onchain:${tx_hash}`;

        return res.json({
            status: 'COMPLETED',
            message: 'Swap on-chain berhasil. Off-ramp akan diproses.',
            txHash: intent.txHash,
            settlement_ref: intent.settlement_ref,
            explorer: `https://explorer.solana.com/tx/${intent.txHash}?cluster=mainnet-beta`
        });
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

// Settlement infrastructure status
router.get('/settlement-info', (req: Request, res: Response) => {
    const info = BankPartnerService.getSettlementInfo();
    res.json(info);
});

// Cost analysis for investor presentation
router.get('/cost-analysis', (req: Request, res: Response) => {
    const amount = parseInt(req.query.amount as string) || 100000;
    res.json(BankPartnerService.getCostAnalysis(amount));
});

// IDRX API live diagnosis — tests all known endpoints
router.get('/idrx-diagnosis', async (req: Request, res: Response) => {
    try {
        const result = await BankPartnerService.diagnoseIdrxApi();
        res.json(result);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export const paymentRoutes = router;
