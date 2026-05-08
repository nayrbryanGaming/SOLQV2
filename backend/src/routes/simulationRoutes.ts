/**
 * SOLQ Simulation Mode — Backend Routes
 *
 * FULL SIMULATION: Real QRIS parsing, simulated Solana TX, simulated IDRX settlement.
 * No real money moves. Designed for demos, testing, and UX validation.
 *
 * These endpoints are clearly marked SIMULATION in all responses.
 * Per HUKUM 2: simulation mode is explicitly flagged, not a silent mock.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { QRISDecoder } from '../services/qrisDecoder';
import { AuditLogger, AuditEventType } from '../services/auditLogger';
import { calculateFeeSplit, LOCKED_PLATFORM_WALLET, LOCKED_DEV_WALLET } from '../services/feeDistributor';

const router = Router();

// BUG-042 FIX: Tighter rate limits for simulation endpoints (10 req/min for /pay, 30 for others).
// Simulation routes are public and must not be abusable as a free computation source.
const simHits = new Map<string, { n: number; t: number }>();

function simRateLimit(maxPerMin: number) {
    return (req: Request, res: Response, next: NextFunction) => {
        if (process.env.DISABLE_RATE_LIMIT === '1') return next();
        const ip = (req.ip || 'x') + ':' + req.path;
        const now = Date.now();
        const e = simHits.get(ip);
        if (!e || now > e.t) { simHits.set(ip, { n: 1, t: now + 60000 }); return next(); }
        if (e.n >= maxPerMin) {
            return res.status(429).json({ simulation: true, error: `Rate limit: max ${maxPerMin} requests/minute for this endpoint` });
        }
        e.n++;
        next();
    };
}
setInterval(() => { const now = Date.now(); for (const [k, v] of simHits) if (now > v.t) simHits.delete(k); }, 300000);

// Simulated token prices (updated on each request to look live)
function getSimulatedPrices() {
    const base = { SOL: 2850000, USDC: 16350, IDRX: 1 };
    // ±0.3% random jitter to look live
    const jitter = () => 1 + (Math.random() - 0.5) * 0.006;
    return {
        SOL:  Math.round(base.SOL  * jitter()),
        USDC: Math.round(base.USDC * jitter()),
        IDRX: 1,
    };
}

// Simulated Solana tx signature (visually realistic)
function fakeSignature(): string {
    const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let sig = '';
    for (let i = 0; i < 88; i++) sig += chars[Math.floor(Math.random() * chars.length)];
    return sig;
}

// POST /v1/simulation/parse-qris
// Parses a real QRIS payload and returns merchant info.
// Input: { qris_payload: string }
router.post('/parse-qris', simRateLimit(30), async (req: Request, res: Response) => {
    try {
        const { qris_payload } = req.body;
        if (!qris_payload || typeof qris_payload !== 'string') {
            return res.status(400).json({ error: 'Missing qris_payload' });
        }
        if (qris_payload.length < 50 || qris_payload.length > 700) {
            return res.status(400).json({ error: 'Invalid QRIS payload length (50-700 chars)' });
        }

        let decoded;
        try {
            decoded = QRISDecoder.decode(qris_payload);
        } catch (err: any) {
            return res.status(400).json({
                simulation: true,
                error:      'INVALID_QRIS',
                message:    err.message,
            });
        }

        const account  = QRISDecoder.extractAccountNumber(decoded);
        const bankCode = QRISDecoder.detectBank(decoded);

        AuditLogger.log(AuditEventType.QRIS_PARSE_FAILED, {
            event:      'SIMULATION_QRIS_PARSED',
            merchant:   decoded.merchantName,
            nmid:       decoded.merchantNMID,
            simulation: true,
        });

        return res.json({
            simulation:   true,
            qris_valid:   true,
            merchant: {
                name:    decoded.merchantName   || 'UNKNOWN',
                city:    decoded.merchantCity   || '-',
                nmid:    decoded.merchantNMID   || account || '-',
                account: account                || '-',
                bank:    bankCode               || 'UNKNOWN',
                mcc:     decoded.merchantMCC    || '-',
                country: decoded.countryCode    || 'ID',
            },
            qr_type:      decoded.isStaticQr ? 'STATIC' : 'DYNAMIC',
            amount_locked: decoded.transactionAmount
                ? Number(decoded.transactionAmount)
                : null,
        });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// POST /v1/simulation/quote
// Returns a simulated Jupiter swap quote (no real API call).
// Input: { amount_idr, token (SOL|USDC|IDRX) }
router.post('/quote', simRateLimit(30), (req: Request, res: Response) => {
    const { amount_idr, token = 'SOL' } = req.body;
    const amountIdr = Number(amount_idr);
    if (!amountIdr || amountIdr <= 0 || amountIdr > 100_000_000) {
        return res.status(400).json({ error: 'amount_idr must be 1–100,000,000' });
    }

    const prices = getSimulatedPrices();
    const tok    = String(token).toUpperCase();
    const rate   = (prices as any)[tok] || prices.SOL;

    // Apply 0.5% spread (ExactOut: user pays slightly more)
    const spread        = 0.005;
    const tokenAmount   = amountIdr / (rate * (1 - spread));
    const platformFee   = Math.max(2500, Math.round(amountIdr * spread));
    const feeSplit      = calculateFeeSplit(platformFee);

    return res.json({
        simulation:     true,
        token,
        amount_idr:     amountIdr,
        token_needed:   parseFloat(tokenAmount.toFixed(tok === 'IDRX' ? 0 : 6)),
        rate_idr:       rate,
        platform_fee_idr: platformFee,
        fee_split: {
            platform_wallet: LOCKED_PLATFORM_WALLET,
            platform_share:  feeSplit.platformShareIdr,
            dev_wallet:      LOCKED_DEV_WALLET,
            dev_share:       feeSplit.devShareIdr,
            split:           '70/30',
        },
        network_fee_idr: 2,
        total_idr:       amountIdr + platformFee,
        quote_valid_for_seconds: 30,
        expires_at:      new Date(Date.now() + 30_000).toISOString(),
    });
});

// POST /v1/simulation/pay
// Simulates a complete payment: fake TX build → fake sign → fake confirm → fake IDRX settle.
// Input: { amount_idr, token, merchant, nmid }
router.post('/pay', simRateLimit(10), async (req: Request, res: Response) => {
    const { amount_idr, token = 'SOL', merchant, nmid } = req.body;
    const amountIdr = Number(amount_idr);
    if (!amountIdr || amountIdr < 1000) {
        return res.status(400).json({ error: 'amount_idr must be at least 1000 (Rp 1.000)' });
    }
    if (amountIdr > 100_000_000) {
        return res.status(400).json({ error: 'amount_idr must not exceed 100,000,000 (Rp 100 juta)' });
    }
    if (token && !['SOL', 'USDC', 'IDRX'].includes(String(token).toUpperCase())) {
        return res.status(400).json({ error: 'token must be SOL, USDC, or IDRX' });
    }

    const prices      = getSimulatedPrices();
    const tok         = String(token).toUpperCase();
    const rate        = (prices as any)[tok] || prices.SOL;
    const spread      = 0.005;
    const tokenAmount = amountIdr / (rate * (1 - spread));
    const platformFee = Math.max(2500, Math.round(amountIdr * spread));
    const feeSplit    = calculateFeeSplit(platformFee);
    const fakeSig     = fakeSignature();
    const simIntentId = `sim_${Date.now()}`;

    // Simulate processing delay stages
    const steps = [
        { step: 1, label: 'QUOTE_READY',           ms: 0    },
        { step: 2, label: 'TX_BUILT',              ms: 800  },
        { step: 3, label: 'SIGNATURE_RECEIVED',    ms: 1600 },
        { step: 4, label: 'BROADCASTING',          ms: 2400 },
        { step: 5, label: 'ON_CHAIN_CONFIRMED',    ms: 3200 },
        { step: 6, label: 'SETTLEMENT_PROCESSING', ms: 4000 },
        { step: 7, label: 'SETTLEMENT_COMPLETE',   ms: 4800 },
    ];

    AuditLogger.log(AuditEventType.SETTLEMENT_INITIATED, {
        event:      'SIMULATION_PAYMENT',
        intentId:   simIntentId,
        amountIdr,
        token,
        merchant:   merchant || 'UNKNOWN',
        nmid:       nmid     || '-',
        simulation: true,
    });

    return res.json({
        simulation:       true,
        intent_id:        simIntentId,
        status:           'SETTLEMENT_COMPLETE',
        merchant,
        nmid,
        amount_idr:       amountIdr,
        token,
        token_amount:     parseFloat(tokenAmount.toFixed(tok === 'IDRX' ? 0 : 6)),
        rate_idr:         rate,
        platform_fee_idr: platformFee,
        fee_split: {
            platform_wallet: LOCKED_PLATFORM_WALLET,
            platform_share:  feeSplit.platformShareIdr,
            dev_wallet:      LOCKED_DEV_WALLET,
            dev_share:       feeSplit.devShareIdr,
        },
        simulated_tx_signature: fakeSig,
        simulated_explorer_url: `https://explorer.solana.com/tx/${fakeSig}?cluster=mainnet-beta`,
        idrx_settlement: {
            method:    'IDRX_OFFRAMP_SIMULATED',
            status:    'COMPLETED',
            amount:    amountIdr - platformFee,
            currency:  'IDR',
            recipient: merchant || 'Merchant',
        },
        steps,
        completed_at:   new Date().toISOString(),
    });
});

// GET /v1/simulation/status
router.get('/status', (_req: Request, res: Response) => {
    const prices = getSimulatedPrices();
    return res.json({
        simulation:          true,
        mode:                'FULL_SIMULATION',
        description:         'Real QRIS parsing. Simulated Solana TX. Simulated IDRX settlement.',
        qris_parsing:        'REAL (EMVCo CRC-16/CCITT validated)',
        solana_network:      'SIMULATED (no real TX)',
        idrx_settlement:     'SIMULATED (no real funds moved)',
        live_prices:         prices,
        platform_wallet:     LOCKED_PLATFORM_WALLET,
        dev_wallet:          LOCKED_DEV_WALLET,
        fee_split:           '70% platform / 30% dev',
        platform_spread_bps: 50,
        timestamp:           new Date().toISOString(),
    });
});

export const simulationRoutes = router;
