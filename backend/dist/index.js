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
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
app.use((0, cors_1.default)());
app.use(body_parser_1.default.json());
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
        if (!account) {
            return res.status(400).json({ error: "Missing account" });
        }
        // 1. Get Intent
        // const solanaService = require('./services/solanaService').default; // Removed this line
        // Optional: Support custom input mint via query param (e.g. ?mint=USDC)
        const inputMint = req.query.mint || undefined;
        const txBase64 = yield solanaService_1.default.createPaymentTransaction(intentId, account, inputMint);
        res.status(200).json({
            transaction: txBase64,
            message: "Verify Amount & Sign"
        });
    }
    catch (error) {
        console.error("Solana Pay Error:", error);
        res.status(500).json({ error: error.message });
    }
}));
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Solana Pay Endpoint: http://localhost:${PORT}/solana-pay/:id`);
});
