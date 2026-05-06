import { Router, Request, Response } from 'express';
import { QRISDecoder } from '../services/qrisDecoder';
import { BankPartnerService } from '../services/bankPartnerService';
import { AuditLogger, AuditEventType } from '../services/auditLogger';
import { SwapService } from '../services/swapService';
import { RiskEngine } from '../services/riskEngine';
import { SettlementQueueService, SettlementTrack } from '../services/settlementQueue';
import solanaService from '../services/solanaService';
import prisma from '../services/prisma';
import { logFeeSplit, LOCKED_PLATFORM_WALLET, LOCKED_DEV_WALLET } from '../services/feeDistributor';

const router = Router();
const confirmLocks = new Set<string>();

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

        // 1. Decode QRIS — STRICT EMVCo VALIDATION (will throw if invalid)
        let decoded;
        try {
            decoded = QRISDecoder.decode(qris_payload);
        } catch (qrisError: any) {
            // Log for compliance audit
            AuditLogger.log(AuditEventType.QRIS_PARSE_FAILED, {
                error: qrisError.message,
                payload_length: qris_payload.length,
                timestamp: new Date().toISOString(),
            });

            // Return explicit error to user
            return res.status(400).json({
                error: 'INVALID_QRIS',
                message: qrisError.message,
                details: {
                    reason: 'The QR code is not a valid QRIS or is corrupted. Please scan again.',
                    timestamp: new Date().toISOString(),
                },
            });
        }

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

        const extractedAccount = QRISDecoder.extractAccountNumber(decoded);
        const merchant_account = extractedAccount || 'UNKNOWN';
        const nmid = extractedAccount || undefined;
        const bankCode = QRISDecoder.detectBank(decoded);

        // 0.5% platform fee split: 70% → Platform wallet, 30% → Dev wallet
        const platformFee = Math.max(2500, Math.round(quote.targetAmount * 0.005));
        const platformFeeWallet70 = Math.round(platformFee * 0.70);
        const platformFeeWallet30 = platformFee - platformFeeWallet70;
        const estNetworkFee = 0.000005; // Standard Solana gas (sponsored by hot wallet)
        const savingsVsLegacy = quote.targetAmount * 0.025; // User saves vs 3% legacy fee

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
            nmid: nmid,
            bank_code: bankCode,
            platformFee: platformFee,
            platformFeeBreakdown: {
                platformWallet: 'ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m',
                platformWalletShare: platformFeeWallet70,
                devWallet: '35z7X59rtyts557Up1RAwpyYN7x2cFqcDc7RjPuNxFzr',
                devWalletShare: platformFeeWallet30,
                splitPct: '70/30',
            },
            networkFee: estNetworkFee,
            slippage: 0.5,
            maxFee: quote.targetAmount + platformFee,
            effectiveFeePercent: 0.5,
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
    const { tx_hash, payer_account } = req.body;

    if (confirmLocks.has(id)) {
        return res.status(409).json({ status: 'pending', message: 'Confirmation already in progress' });
    }

    // SECURITY: Validate tx_hash format (base58, 87-88 chars for Solana signatures)
    if (!tx_hash || typeof tx_hash !== 'string' || tx_hash.length < 80 || tx_hash.length > 100) {
        return res.status(400).json({ error: 'Invalid transaction hash' });
    }

    // SECURITY: Validate base58 characters only
    if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(tx_hash)) {
        return res.status(400).json({ error: 'Invalid transaction hash format' });
    }

    if (payer_account !== undefined) {
        if (typeof payer_account !== 'string' ||
            payer_account.length < 32 ||
            payer_account.length > 44 ||
            !/^[1-9A-HJ-NP-Za-km-z]+$/.test(payer_account)) {
            return res.status(400).json({ error: 'Invalid payer_account format' });
        }
    }

    const intent = paymentIntents[id];
    if (!intent) {
        return res.status(404).json({ error: 'Payment Intent not found' });
    }

    if (intent.txHash && intent.txHash === tx_hash) {
        return res.json({ status: intent.status, message: 'Idempotent confirm accepted', txHash: intent.txHash });
    }

    if (intent.status !== 'CREATED' && intent.status !== 'AUTHORIZATION_REQUESTED') {
        return res.json({ status: intent.status, message: 'Intent already processing' });
    }

    // SECURITY: Prevent duplicate tx_hash replay attack
    const existingWithSameHash = Object.values(paymentIntents).find(
        i => i.txHash === tx_hash && i.id !== id
    );
    if (existingWithSameHash) {
        AuditLogger.log(AuditEventType.SECURITY_REPLAY_BLOCKED, { intentId: id, tx_hash, conflictingIntent: existingWithSameHash.id });
        return res.status(400).json({ status: 'failed', message: 'REPLAY ATTACK BLOCKED: This tx_hash was already used for another intent.' });
    }

    // AI RISK ENGINE — evaluate before committing on-chain verification resources
    const riskWallet = payer_account || intent.payer_account;
    if (riskWallet) {
        try {
            const risk = await RiskEngine.evaluate({
                walletAddress: riskWallet,
                amountIdr: intent.amount_details.fiat_amount,
                nmid: intent.nmid,
                merchantName: intent.merchant?.name,
                bankCode: intent.bank_code,
                isStaticQr: !intent.qris_data?.transactionAmount,
            });
            if (!risk.allow) {
                return res.status(403).json({
                    status: 'BLOCKED',
                    risk_score: risk.score,
                    risk_level: risk.level,
                    message: risk.message,
                    reasons: risk.reasons,
                });
            }
            // Attach risk metadata to intent for audit trail
            (intent as any).risk_score = risk.score;
            (intent as any).risk_level = risk.level;
        } catch (riskErr: any) {
            // Risk engine failure is non-fatal — log and continue
            console.warn('[RISK] Engine error (non-fatal):', riskErr.message);
        }
    }

    confirmLocks.add(id);

    try {
        // REAL ON-CHAIN VERIFICATION (Multi-RPC Failover)
        // Verify transaction is finalized on Solana Mainnet
        const isValid = await solanaService.verifyTransaction(tx_hash || '', id);

        if (!isValid) {
            return res.status(400).json({ status: 'failed', message: 'On-chain verification failed. TX not finalized or Treasury did not receive funds.' });
        }

        if (payer_account) {
            intent.payer_account = payer_account;
        }

        // Fallback to signer extracted from finalized on-chain transaction.
        const onChainPayer = await solanaService.extractPayerAccount(tx_hash || '');
        if (onChainPayer) {
            if (intent.payer_account && intent.payer_account !== onChainPayer) {
                AuditLogger.log(AuditEventType.SECURITY_PAYER_MISMATCH, {
                    intentId: id,
                    expected: intent.payer_account,
                    onChain: onChainPayer,
                    tx_hash,
                });
                return res.status(400).json({
                    status: 'failed',
                    message: 'Payer mismatch between wallet callback and on-chain signature.'
                });
            }
            intent.payer_account = onChainPayer;
        }

        // State: AUTHORIZED (on-chain verified)
        intent.status = 'AUTHORIZED';
        intent.txHash = tx_hash;
        intent.updatedAt = new Date().toISOString();

        // Log 70/30 fee split to immutable audit trail
        const platformFeeIdr = Math.max(2500, Math.round(intent.amount_details.fiat_amount * 0.005));
        const feeSplit = logFeeSplit(id, tx_hash, platformFeeIdr);
        (intent as any).feeSplit = feeSplit;

        AuditLogger.log(AuditEventType.PAYMENT_INTENT_CONFIRMED, {
            intentId:       id,
            txHash:         intent.txHash,
            payer:          intent.payer_account,
            platformWallet: LOCKED_PLATFORM_WALLET,
            devWallet:      LOCKED_DEV_WALLET,
            feeSplitIdr:    feeSplit,
        });

    // ═══════════════════════════════════════════════════════════
    //  DUAL-TRACK SETTLEMENT QUEUE (Non-blocking)
    //
    //  FAST LANE (>Rp500k):     immediate Xendit disbursement
    //  EFFICIENT LANE (≤Rp500k): batch accumulation per merchant
    //
    //  Enqueue asynchronously. Don't wait for completion before
    //  returning to user — settlement happens in background via BullMQ.
    // ═══════════════════════════════════════════════════════════

        intent.status = 'AWAITING_SETTLEMENT';
        intent.updatedAt = new Date().toISOString();

        try {
            // Get settlement queue instance
            const settlementQueue = SettlementQueueService.getInstance(
                prisma,
                process.env.REDIS_URL || 'redis://localhost:6379'
            );

            // Enqueue settlement (non-blocking, returns immediately)
            await settlementQueue.enqueueSettlement({
                paymentIntentId: id,
                merchantNMID: intent.nmid || 'UNKNOWN',
                merchantName: intent.merchant.name || '',
                amountIDR: intent.amount_details.fiat_amount,
                bankCode: intent.bank_code || 'GOPAY',
                accountNumber: intent.merchant_account || '',
                accountHolderName: intent.merchant.name || '',
                solanaTxSignature: intent.txHash || '',
                track: intent.amount_details.fiat_amount > 500_000 ? SettlementTrack.FAST_LANE : SettlementTrack.EFFICIENT_LANE,
            });

            // Mark as settlement-queued
            intent.status = 'SETTLEMENT_QUEUED';
            intent.updatedAt = new Date().toISOString();

            // Return immediately (settlement happens in background)
            return res.json({
                status: 'SETTLEMENT_QUEUED',
                message: `Pembayaran terverifikasi! Settlement sedang diproses...`,
                txHash: intent.txHash,
                settlement_track: intent.amount_details.fiat_amount > 500_000 ? 'FAST_LANE' : 'EFFICIENT_LANE',
                explorer: `https://explorer.solana.com/tx/${intent.txHash}?cluster=mainnet-beta`,
                payer_account: intent.payer_account,
                treasury: 'ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m',
                statusUrl: `/v1/payment-intents/${id}/status`,
                pollingIntervalMs: 5000,
                estimatedSettlementTime: intent.amount_details.fiat_amount > 500_000
                    ? '< 5 minutes (FAST_LANE)'
                    : '< 60 minutes (EFFICIENT_LANE)',
            });

        } catch (settlementError: any) {
            // Enqueue failed — log error response
            const errorMsg = settlementError instanceof Error 
                ? settlementError.message 
                : String(settlementError);
            
            console.error(`[SETTLEMENT ENQUEUE] Error: ${errorMsg}`);
            AuditLogger.log(AuditEventType.SETTLEMENT_FAILED, {
                intentId: id,
                txHash: intent.txHash,
                error: errorMsg,
                timestamp: new Date().toISOString(),
            });

            intent.status = 'SETTLEMENT_FAILED';
            intent.updatedAt = new Date().toISOString();

            return res.status(500).json({
                status: 'SETTLEMENT_FAILED',
                message: 'Settlement queue error. Payment verified on-chain but settlement failed.',
                txHash: intent.txHash,
                error: errorMsg,
                explorer: `https://explorer.solana.com/tx/${intent.txHash}?cluster=mainnet-beta`,
                payer_account: intent.payer_account,
                support_url: 'https://solq.app/support',
            });
        }
    } catch (err: any) {
        // Total failure during payment confirmation
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[PAYMENT CONFIRM] Error: ${errorMsg}`);
        
        AuditLogger.log(AuditEventType.PAYMENT_INTENT_CONFIRMED, {
            intentId: id,
            error: errorMsg,
            status: 'FAILED',
            timestamp: new Date().toISOString(),
        });

        intent.status = 'FAILED';
        intent.updatedAt = new Date().toISOString();

        return res.status(400).json({
            status: 'FAILED',
            message: 'Payment confirmation failed. Please contact support.',
            intentId: id,
            error: errorMsg,
        });
    } finally {
        confirmLocks.delete(id);
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
    const intents = Object.values(paymentIntents);
    const successCount = intents.filter(intent => intent.status === 'COMPLETED').length;
    const uniqueWalletUsers = new Set(
        intents
            .map(intent => intent.payer_account)
            .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    ).size;

    res.json({
        success_count: successCount,
        total_intents: intents.length,
        unique_wallet_users: uniqueWalletUsers,
    });
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

// AI Risk Engine — pre-transaction evaluation
// Call this before confirming a payment intent to get risk score and decision.
router.post('/risk/evaluate', async (req: Request, res: Response) => {
    try {
        const { wallet_address, amount_idr, nmid, merchant_name, bank_code, is_static_qr } = req.body;

        if (!wallet_address || typeof wallet_address !== 'string') {
            return res.status(400).json({ error: 'Missing wallet_address' });
        }
        if (!wallet_address.match(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)) {
            return res.status(400).json({ error: 'Invalid wallet_address format' });
        }

        const amountIdr = parseFloat(amount_idr) || 0;
        if (amountIdr < 0 || amountIdr > 100_000_000) {
            return res.status(400).json({ error: 'amount_idr must be 0–100,000,000' });
        }

        const result = await RiskEngine.evaluate({
            walletAddress: wallet_address,
            amountIdr,
            nmid: nmid?.toString(),
            merchantName: merchant_name?.toString(),
            bankCode: bank_code?.toString(),
            isStaticQr: is_static_qr === true || is_static_qr === 'true',
        });

        res.json(result);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export const paymentRoutes = router;
