import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { paymentRoutes } from './routes/paymentRoutes';
import solanaService from './services/solanaService';
import { ReconciliationWorker } from './services/reconciliation';

// Start Autonomous Reconciliation Worker
ReconciliationWorker.run();
setInterval(() => {
    ReconciliationWorker.run();
}, 60000);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// Main Routes
app.use('/v1', paymentRoutes);

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

        if (!account) {
            return res.status(400).json({ error: "Missing account" });
        }

        // 1. Get Intent
        // const solanaService = require('./services/solanaService').default; // Removed this line

        // Optional: Support custom input mint via query param (e.g. ?mint=USDC)
        const inputMint = req.query.mint as string || undefined;

        const txBase64 = await solanaService.createPaymentTransaction(intentId, account, inputMint);

        res.status(200).json({
            transaction: txBase64,
            message: "Verify Amount & Sign"
        });

    } catch (error: any) {
        console.error("Solana Pay Error:", error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SOLQ] Orchestrator running on http://0.0.0.0:${PORT}`);
    console.log(`[SOLQ] Solana Pay Endpoint: http://0.0.0.0:${PORT}/solana-pay/:id`);
});

