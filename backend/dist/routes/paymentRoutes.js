"use strict";
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
exports.paymentRoutes = void 0;
const express_1 = require("express");
const qrisDecoder_1 = require("../services/qrisDecoder");
const bankPartnerService_1 = require("../services/bankPartnerService");
const auditLogger_1 = require("../services/auditLogger");
const swapService_1 = require("../services/swapService");
const router = (0, express_1.Router)();
// In-memory store for MVP (Typed for better structure)
const store_1 = require("../services/store");
router.post('/payment-intents', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { qris_payload, currency, input_amount } = req.body;
        if (!qris_payload) {
            return res.status(400).json({ error: 'Missing qris_payload' });
        }
        // 1. Decode QRIS
        const decoded = qrisDecoder_1.QRISDecoder.decode(qris_payload);
        // 2. Create Payment Intent ID
        const intentId = `pi_${Date.now()}`;
        // 3. Construct Response Object
        // Calculate Rates
        let transactionAmount = decoded.transactionAmount ? parseFloat(decoded.transactionAmount) : 0;
        if (transactionAmount === 0 && input_amount) {
            transactionAmount = parseFloat(input_amount);
        }
        const quote = yield swapService_1.SwapService.getQuote(transactionAmount, currency || 'IDRX');
        const paymentIntent = {
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
        store_1.paymentIntents[intentId] = paymentIntent;
        // AUDIT LOG
        auditLogger_1.AuditLogger.log(auditLogger_1.AuditEventType.PAYMENT_INTENT_CREATED, {
            intentId,
            merchant: paymentIntent.merchant.name,
            amount: paymentIntent.amount_details.fiat_amount
        });
        res.json(paymentIntent);
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
}));
router.get('/payment-intents/:id', (req, res) => {
    const id = req.params.id;
    const intent = store_1.paymentIntents[id];
    if (!intent) {
        return res.status(404).json({ error: 'Payment Intent not found' });
    }
    res.json(intent);
});
router.post('/payment-intents/:id/confirm', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const id = req.params.id;
    const { tx_hash } = req.body;
    const intent = store_1.paymentIntents[id];
    if (!intent) {
        return res.status(404).json({ error: 'Payment Intent not found' });
    }
    if (intent.status !== 'requires_payment_method') {
        return res.json({ status: intent.status, message: 'Intent already processing' });
    }
    // REAL ON-CHAIN VERIFICATION
    const solanaService = require('../services/solanaService').default;
    // Verify transaction
    const isValid = yield solanaService.verifyTransaction(tx_hash || '');
    if (!isValid) {
        return res.status(400).json({ status: 'failed', message: 'On-chain verification failed or pending' });
    }
    // Update state to processing
    intent.status = 'processing';
    intent.tx_hash = tx_hash;
    // AUDIT LOG
    auditLogger_1.AuditLogger.log(auditLogger_1.AuditEventType.PAYMENT_INTENT_CONFIRMED, {
        intentId: id,
        txHash: intent.tx_hash
    });
    res.json({ status: 'processing', message: 'Transaction verified. Settlement initiated.' });
    // ASYNC PROCESS: Settlement
    setTimeout(() => __awaiter(void 0, void 0, void 0, function* () {
        console.log(`[Worker] Settle TX ${intent.tx_hash} for intent ${id}...`);
        // 1. Trigger Settlement Request
        intent.status = 'settling';
        auditLogger_1.AuditLogger.log(auditLogger_1.AuditEventType.SETTLEMENT_INITIATED, { intentId: id });
        // Request Licensed Partner to settle funds
        const settlementResult = yield bankPartnerService_1.BankPartnerService.requestSettlement({
            amount: intent.amount_details.fiat_amount || 10000,
            currency: 'IDR',
            destinationAccount: {
                bankCode: 'GOPAY',
                accountNumber: intent.merchant_account || 'UNKNOWN'
            },
            referenceId: intent.id
        });
        if (settlementResult.status === 'SUCCESS') {
            intent.status = 'completed';
            intent.settlement_ref = settlementResult.partnerRef;
            auditLogger_1.AuditLogger.log(auditLogger_1.AuditEventType.SETTLEMENT_COMPLETED, {
                intentId: id,
                partnerRef: settlementResult.partnerRef
            });
            console.log(`[Worker] Intent ${id} COMPLETED.`);
        }
        else {
            intent.status = 'failed';
            auditLogger_1.AuditLogger.log(auditLogger_1.AuditEventType.SETTLEMENT_FAILED, { intentId: id, reason: 'Partner Rejected Request' });
            console.error(`[Worker] Intent ${id} FAILED settlement request.`);
        }
    }), 100);
}));
// Webhook Receiver from Off-Ramp Partner
router.post('/webhooks/settlement', (req, res) => {
    const { referenceId, status, partnerRef } = req.body;
    const intent = store_1.paymentIntents[referenceId];
    if (!intent) {
        return res.status(404).json({ error: 'Intent not found' });
    }
    console.log(`[Webhook] Received update for ${referenceId}: ${status}`);
    if (status === 'SUCCESS') {
        intent.status = 'completed';
        intent.settlement_ref = partnerRef;
        auditLogger_1.AuditLogger.log(auditLogger_1.AuditEventType.SETTLEMENT_COMPLETED, { intentId: referenceId, partnerRef });
    }
    else if (status === 'FAILED') {
        intent.status = 'failed';
        auditLogger_1.AuditLogger.log(auditLogger_1.AuditEventType.SETTLEMENT_FAILED, { intentId: referenceId, reason: 'Webhook Reported Failure' });
    }
    res.status(200).send('OK');
});
router.get('/transactions/:id/status', (req, res) => {
    const id = req.params.id;
    const intent = store_1.paymentIntents[id];
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
exports.paymentRoutes = router;
