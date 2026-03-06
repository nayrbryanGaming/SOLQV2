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
const store_1 = require("./store");
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const node_fetch_1 = __importDefault(require("node-fetch"));
const JUPITER_QUOTE_API = 'https://lite-api.jup.ag/swap/v1/quote';
const JUPITER_SWAP_API = 'https://lite-api.jup.ag/swap/v1/swap';
// TREASURY WALLET (All Revenue & Settlement Flow)
const TREASURY_WALLET = new web3_js_1.PublicKey('ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m');
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
// IDRX Stablecoin (Mainnet)
const IDRX_MINT = new web3_js_1.PublicKey('idrxZcP8xiKkYk6XGD4uz1dxEYCWSgKDHqgjsBbwDur');
// Treasury ATA for IDRX (platform fee collection)
let treasuryIdrxAta = null;
// Multi-RPC Failover (Mainnet Reliability)
const RPC_ENDPOINTS = [
    process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
    "https://solana-mainnet.g.alchemy.com/v2/demo",
    "https://rpc.ankr.com/solana",
];
class SolanaService {
    constructor() {
        this.currentRpcIndex = 0;
        this.connections = RPC_ENDPOINTS.map(url => new web3_js_1.Connection(url, { commitment: 'confirmed' }));
        this.resolveTreasuryAta();
    }
    get connection() {
        return this.connections[this.currentRpcIndex];
    }
    rotateRpc() {
        this.currentRpcIndex = (this.currentRpcIndex + 1) % this.connections.length;
    }
    resolveTreasuryAta() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                treasuryIdrxAta = yield (0, spl_token_1.getAssociatedTokenAddress)(IDRX_MINT, TREASURY_WALLET);
                console.log(`[SOLANA] Treasury IDRX ATA: ${treasuryIdrxAta.toBase58()}`);
            }
            catch (e) {
                console.error("Failed to resolve Treasury ATA", e);
            }
        });
    }
    /**
     * Detect input mint from user's intent or default to SOL.
     * Supports: SOL, USDC, or any SPL token mint address.
     */
    resolveInputMint(inputMint) {
        if (!inputMint)
            return SOL_MINT;
        const upper = inputMint.toUpperCase();
        if (upper === 'USDC')
            return USDC_MINT;
        if (upper === 'SOL')
            return SOL_MINT;
        // Direct mint address passthrough
        return inputMint;
    }
    createPaymentTransaction(intentId, userAccount, inputMint) {
        return __awaiter(this, void 0, void 0, function* () {
            const intent = store_1.paymentIntents[intentId];
            if (!intent)
                throw new Error(`Payment Intent not found: ${intentId}`);
            const amountIdr = intent.amount_details.fiat_amount;
            if (!amountIdr || amountIdr <= 0)
                throw new Error('Invalid amount: cannot be zero.');
            if (amountIdr > 100000000)
                throw new Error('Amount exceeds maximum limit (100M IDR).');
            const resolvedMint = this.resolveInputMint(inputMint);
            // IDRX has 2 decimals on Mainnet
            const amountAtomic = Math.floor(amountIdr * 100);
            // ── JUPITER V6 QUOTE ──
            const quoteParams = new URLSearchParams({
                inputMint: resolvedMint,
                outputMint: IDRX_MINT.toBase58(),
                amount: amountAtomic.toString(),
                swapMode: 'ExactOut',
                slippageBps: '100', // 1% slippage for mainnet reliability
                platformFeeBps: '100', // 1% platform fee → Treasury
            });
            const quoteRes = yield (0, node_fetch_1.default)(`${JUPITER_QUOTE_API}?${quoteParams}`);
            const quoteData = yield quoteRes.json();
            // Jupiter V6 returns data at root level (not nested under .data)
            if (quoteData.error) {
                throw new Error(`Jupiter Quote Error: ${quoteData.error}`);
            }
            if (!quoteData.inAmount || !quoteData.outAmount) {
                throw new Error(`Jupiter: No route found for ${resolvedMint} → IDRX`);
            }
            const inAmountRaw = Number(quoteData.inAmount);
            const outAmountRaw = Number(quoteData.outAmount);
            // ── ORACLE PRICE CHECK (SOL only — USDC is stable) ──
            if (resolvedMint === SOL_MINT) {
                const priceService = require('./priceService').PriceService.getInstance();
                const idrValue = outAmountRaw / 100; // IDRX 2 decimals → IDR
                const solValue = inAmountRaw / 1000000000; // Lamports → SOL
                const impliedRate = idrValue / solValue;
                const isSafe = yield priceService.verifyRate(impliedRate, 'solana');
                if (!isSafe) {
                    throw new Error("SECURITY: Jupiter price deviates >2.5% from CoinGecko. Blocked.");
                }
            }
            // ── JUPITER V6 SWAP TRANSACTION ──
            if (!treasuryIdrxAta) {
                yield this.resolveTreasuryAta();
            }
            // Jupiter lite-api swap fields (PROVEN WORKING from test_swap.js):
            // - feeAccount: Treasury IDRX ATA → receives platformFeeBps portion
            // - destinationTokenAccount: Treasury IDRX ATA → IDRX output goes here for off-ramp
            const swapBody = {
                quoteResponse: quoteData,
                userPublicKey: userAccount,
                wrapAndUnwrapSol: true,
                dynamicComputeUnitLimit: true,
                computeUnitPriceMicroLamports: 'auto',
                feeAccount: (treasuryIdrxAta === null || treasuryIdrxAta === void 0 ? void 0 : treasuryIdrxAta.toBase58()) || undefined,
                destinationTokenAccount: (treasuryIdrxAta === null || treasuryIdrxAta === void 0 ? void 0 : treasuryIdrxAta.toBase58()) || undefined,
            };
            const swapRes = yield (0, node_fetch_1.default)(JUPITER_SWAP_API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(swapBody)
            });
            const swapData = yield swapRes.json();
            if (swapData.error) {
                throw new Error(`Jupiter Swap Error: ${swapData.error}`);
            }
            if (!swapData.swapTransaction) {
                throw new Error('Jupiter: Failed to build swap transaction');
            }
            return swapData.swapTransaction;
        });
    }
    verifyTransaction(txHash) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            for (let attempt = 0; attempt < this.connections.length; attempt++) {
                try {
                    const tx = yield this.connection.getTransaction(txHash, {
                        commitment: 'finalized',
                        maxSupportedTransactionVersion: 0
                    });
                    if (!tx) {
                        this.rotateRpc();
                        continue;
                    }
                    if ((_a = tx.meta) === null || _a === void 0 ? void 0 : _a.err)
                        return false;
                    const postBalances = (_b = tx.meta) === null || _b === void 0 ? void 0 : _b.postTokenBalances;
                    const hasTokenChanges = ((_c = postBalances === null || postBalances === void 0 ? void 0 : postBalances.length) !== null && _c !== void 0 ? _c : 0) > 0;
                    // Check if Treasury received IDRX
                    const treasuryGotIdrx = postBalances === null || postBalances === void 0 ? void 0 : postBalances.some(pb => pb.owner === TREASURY_WALLET.toBase58() &&
                        pb.mint === IDRX_MINT.toBase58());
                    if (treasuryGotIdrx) {
                        console.log(`[VERIFY] ✅ Treasury received IDRX for ${txHash.slice(0, 8)}...`);
                        return true;
                    }
                    // Fallback: any token movement = swap happened
                    if (hasTokenChanges) {
                        console.log(`[VERIFY] ✅ TX finalized with token changes`);
                        return true;
                    }
                    return false;
                }
                catch (e) {
                    this.rotateRpc();
                }
            }
            return false;
        });
    }
}
exports.default = new SolanaService();
