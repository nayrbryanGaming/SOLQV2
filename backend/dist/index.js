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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const body_parser_1 = __importDefault(require("body-parser"));
const paymentRoutes_1 = require("./routes/paymentRoutes");
const solanaService_1 = __importDefault(require("./services/solanaService"));
const reconciliation_1 = require("./services/reconciliation");
// Autonomous Reconciliation (detect stuck TX every 60s)
reconciliation_1.ReconciliationWorker.run();
setInterval(() => reconciliation_1.ReconciliationWorker.run(), 60000);
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
// ── SECURITY ──
app.use(body_parser_1.default.json({ limit: '50kb' }));
app.use((0, cors_1.default)());
app.disable('x-powered-by');
app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
});
// Rate limiter (60 req/min/IP)
const hits = new Map();
app.use((req, res, next) => {
    const ip = req.ip || 'x';
    const now = Date.now();
    const e = hits.get(ip);
    if (!e || now > e.t) {
        hits.set(ip, { n: 1, t: now + 60000 });
        return next();
    }
    if (e.n >= 60)
        return res.status(429).json({ error: 'Rate limit' });
    e.n++;
    next();
});
setInterval(() => { const now = Date.now(); for (const [k, v] of hits)
    if (now > v.t)
        hits.delete(k); }, 300000);
// Main Routes
app.use('/v1', paymentRoutes_1.paymentRoutes);
// Health Check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', service: 'SOLQ Orchestrator' });
});
app.get('/solana-pay/:intentId', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    // Solana Pay Transaction Request - GET (Icon/Label)
    const { intentId } = req.params;
    res.status(200).json({
        label: "SOLQ",
        icon: "https://solq.app/logo.png",
        message: `SOLQ Payment Intent: ${intentId}`
    });
}));
app.post('/solana-pay/:intentId', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
        const inputMint = req.query.mint || undefined;
        const txBase64 = yield solanaService_1.default.createPaymentTransaction(intentId, account, inputMint);
        const { paymentIntents } = require('./services/store');
        if (paymentIntents[intentId]) {
            paymentIntents[intentId].status = 'AUTHORIZATION_REQUESTED';
        }
        res.status(200).json({
            transaction: txBase64,
            message: "Verify Amount & Sign"
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
}));
const server = app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`[SOLQ] Backend running on port ${PORT}`);
});
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        const altPort = Number(PORT) + 1;
        console.warn(`[SOLQ] Port ${PORT} in use, trying ${altPort}...`);
        app.listen(altPort, '0.0.0.0', () => {
            console.log(`[SOLQ] Backend running on fallback port ${altPort}`);
        });
    }
    else {
        console.error('[SOLQ] Server error:', err);
        process.exit(1);
    }
});
