import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { paymentRoutes } from './routes/paymentRoutes';
import { adminRoutes } from './routes/adminRoutes';
import solanaService from './services/solanaService';
import { paymentIntents } from './services/store';
import { ReconciliationWorker } from './services/reconciliation';

// Autonomous Reconciliation (detect stuck TX every 60s)
ReconciliationWorker.run();
setInterval(() => ReconciliationWorker.run(), 60000);

const app = express();
const PORT = process.env.PORT || 3000;

// ── SECURITY ──
app.use(bodyParser.json({ limit: '50kb' }));
app.use(cors());
app.disable('x-powered-by');
app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
});

// Rate limiter (60 req/min/IP)
const hits = new Map<string, { n: number; t: number }>();
const RATE_LIMIT_PER_MIN = Math.max(0, Number(process.env.RATE_LIMIT_PER_MIN || '60'));
const DISABLE_RATE_LIMIT = process.env.DISABLE_RATE_LIMIT === '1';

function isLocalIp(ip: string): boolean {
    return ip.includes('127.0.0.1') || ip.includes('::1') || ip.includes('::ffff:127.0.0.1');
}

app.use((req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || 'x';
    if (DISABLE_RATE_LIMIT || RATE_LIMIT_PER_MIN <= 0 || isLocalIp(ip)) {
        return next();
    }
    const now = Date.now();
    const e = hits.get(ip);
    if (!e || now > e.t) { hits.set(ip, { n: 1, t: now + 60000 }); return next(); }
    if (e.n >= RATE_LIMIT_PER_MIN) return res.status(429).json({ error: 'Rate limit' });
    e.n++;
    next();
});
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (now > v.t) hits.delete(k); }, 300000);

// Main Routes
app.use('/v1', paymentRoutes);
app.use('/v1/admin', adminRoutes);
app.use('/admin', adminRoutes);

// Health Check
app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({ status: 'OK', service: 'SOLQ Orchestrator' });
});

app.get('/solana-pay/:intentId', async (req: Request, res: Response) => {
    // Solana Pay Transaction Request - GET (Icon/Label)
    const { intentId } = req.params;
    res.status(200).json({
        label: "SOLQ",
        icon: "https://solq.app/logo.png",
        message: `SOLQ Payment Intent: ${intentId}`
    });
});

app.post('/solana-pay/:intentId', async (req: Request, res: Response) => {
    // Solana Pay Transaction Request - POST (Transaction)
    try {
        const { intentId } = req.params;
        const { account } = req.body; // Wallet Public Key from Phantom

        if (!account || typeof account !== 'string') {
            return res.status(400).json({ error: "Missing account" });
        }

        // SECURITY: Validate intentId format (must be pi_ prefix)
        if (!intentId.startsWith('pi_') || intentId.length > 50) {
            return res.status(400).json({ error: "Invalid intent ID format" });
        }

        // SECURITY: Validate Solana public key format (base58, 32-44 chars)
        if (account.length < 32 || account.length > 44 || !/^[1-9A-HJ-NP-Za-km-z]+$/.test(account)) {
            return res.status(400).json({ error: "Invalid Solana wallet address" });
        }

        // 1. Get Intent
        // const solanaService = require('./services/solanaService').default; // Removed this line

        // Optional: Support custom input mint via query param (e.g. ?mint=USDC)
        const inputMint = req.query.mint as string || undefined;

        const txBase64 = await solanaService.createPaymentTransaction(intentId, account, inputMint);

        if (paymentIntents[intentId]) {
            paymentIntents[intentId].status = 'AUTHORIZATION_REQUESTED';
            paymentIntents[intentId].payer_account = account;
            paymentIntents[intentId].input_mint = inputMint || paymentIntents[intentId].input_mint || 'SOL';
            paymentIntents[intentId].updatedAt = new Date().toISOString();
        }

        res.status(200).json({
            transaction: txBase64,
            message: "Verify Amount & Sign"
        });

    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

const server = app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`[SOLQ] Backend running on port ${PORT}`);
});

server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
        const altPort = Number(PORT) + 1;
        console.warn(`[SOLQ] Port ${PORT} in use, trying ${altPort}...`);
        app.listen(altPort, '0.0.0.0', () => {
            console.log(`[SOLQ] Backend running on fallback port ${altPort}`);
        });
    } else {
        console.error('[SOLQ] Server error:', err);
        process.exit(1);
    }
});

