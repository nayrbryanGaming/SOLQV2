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
exports.SOLANA_CLUSTER = void 0;
const store_1 = require("./store");
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const node_fetch_1 = __importDefault(require("node-fetch"));
// Cluster: 'devnet' for testing, 'mainnet-beta' for production
exports.SOLANA_CLUSTER = process.env.SOLANA_CLUSTER || 'mainnet-beta';
const IS_DEVNET = exports.SOLANA_CLUSTER === 'devnet';
// Jupiter API — devnet uses v6 public, mainnet uses lite-api
const JUPITER_QUOTE_API = IS_DEVNET
    ? 'https://quote-api.jup.ag/v6/quote'
    : 'https://lite-api.jup.ag/swap/v1/quote';
const JUPITER_SWAP_API = IS_DEVNET
    ? 'https://quote-api.jup.ag/v6/swap'
    : 'https://lite-api.jup.ag/swap/v1/swap';
// TREASURY WALLET (All Revenue & Settlement Flow)
const TREASURY_WALLET = new web3_js_1.PublicKey('ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m');
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
// IDRX Stablecoin — mainnet mint; devnet uses USDC as substitute
const IDRX_MINT = new web3_js_1.PublicKey(IS_DEVNET
    ? (process.env.DEVNET_OUTPUT_MINT || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') // USDC devnet
    : (process.env.IDRX_MINT_ADDRESS || 'idrxZcP8xiKkYk6XGD4uz1dxEYCWSgKDHqgjsBbwDur'));
// Treasury ATA for IDRX (platform fee collection)
let treasuryIdrxAta = null;
// Multi-RPC Failover — Helius primary (set HELIUS_RPC_URL env), public fallbacks
const RPC_ENDPOINTS = IS_DEVNET
    ? [
        process.env.HELIUS_DEVNET_RPC_URL || 'https://api.devnet.solana.com',
        'https://rpc.ankr.com/solana_devnet',
    ]
    : [
        process.env.HELIUS_RPC_URL || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
        process.env.QUICKNODE_RPC_URL || 'https://solana-mainnet.g.alchemy.com/v2/demo',
        'https://rpc.ankr.com/solana',
        'https://mainnet.helius-rpc.com/?api-key=public',
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
            // Persist expected verification context for deterministic confirmation.
            intent.payer_account = userAccount;
            intent.input_mint = resolvedMint;
            intent.expected_output_mint = IDRX_MINT.toBase58();
            intent.expected_atomic_amount = amountAtomic;
            intent.expected_recipient_ata = treasuryIdrxAta === null || treasuryIdrxAta === void 0 ? void 0 : treasuryIdrxAta.toBase58();
            intent.updatedAt = new Date().toISOString();
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
    verifyTransaction(txHash, intentId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e;
            const intent = intentId ? store_1.paymentIntents[intentId] : undefined;
            const expectedMint = (intent === null || intent === void 0 ? void 0 : intent.expected_output_mint) || IDRX_MINT.toBase58();
            const expectedAtomic = Math.max(0, Number((intent === null || intent === void 0 ? void 0 : intent.expected_atomic_amount) || 0));
            const expectedRecipientAta = (intent === null || intent === void 0 ? void 0 : intent.expected_recipient_ata) || (treasuryIdrxAta === null || treasuryIdrxAta === void 0 ? void 0 : treasuryIdrxAta.toBase58());
            for (let attempt = 0; attempt < this.connections.length; attempt++) {
                try {
                    const tx = yield this.connection.getParsedTransaction(txHash, {
                        commitment: 'finalized',
                        maxSupportedTransactionVersion: 0
                    });
                    if (!tx) {
                        this.rotateRpc();
                        continue;
                    }
                    if ((_a = tx.meta) === null || _a === void 0 ? void 0 : _a.err)
                        return false;
                    const preBalances = ((_b = tx.meta) === null || _b === void 0 ? void 0 : _b.preTokenBalances) || [];
                    const postBalances = ((_c = tx.meta) === null || _c === void 0 ? void 0 : _c.postTokenBalances) || [];
                    const treasuryOwner = TREASURY_WALLET.toBase58();
                    const accountKeys = tx.transaction.message.accountKeys.map((k) => {
                        if (typeof k === 'string')
                            return k;
                        if (k === null || k === void 0 ? void 0 : k.pubkey)
                            return k.pubkey.toString();
                        return String(k);
                    });
                    const getAtomic = (raw) => {
                        const parsed = Number(raw || '0');
                        return Number.isFinite(parsed) ? parsed : 0;
                    };
                    const preByAccountIndex = new Map();
                    for (const b of preBalances) {
                        const ataAtIndex = accountKeys[b.accountIndex] || '';
                        const ataOk = expectedRecipientAta ? ataAtIndex === expectedRecipientAta : true;
                        if (b.mint === expectedMint && b.owner === treasuryOwner && ataOk) {
                            preByAccountIndex.set(b.accountIndex, getAtomic((_d = b.uiTokenAmount) === null || _d === void 0 ? void 0 : _d.amount));
                        }
                    }
                    let receivedAtomic = 0;
                    for (const b of postBalances) {
                        const ataAtIndex = accountKeys[b.accountIndex] || '';
                        const ataOk = expectedRecipientAta ? ataAtIndex === expectedRecipientAta : true;
                        if (b.mint !== expectedMint || b.owner !== treasuryOwner || !ataOk)
                            continue;
                        const postAtomic = getAtomic((_e = b.uiTokenAmount) === null || _e === void 0 ? void 0 : _e.amount);
                        const preAtomic = preByAccountIndex.get(b.accountIndex) || 0;
                        const delta = postAtomic - preAtomic;
                        if (delta > 0)
                            receivedAtomic += delta;
                    }
                    if (expectedAtomic > 0 && receivedAtomic < expectedAtomic) {
                        console.warn(`[VERIFY] ❌ Atomic amount mismatch: expected >= ${expectedAtomic}, got ${receivedAtomic}`);
                        return false;
                    }
                    if (receivedAtomic > 0) {
                        console.log(`[VERIFY] ✅ Treasury ATA ${expectedRecipientAta || 'N/A'} received ${receivedAtomic} atomic ${expectedMint} for ${txHash.slice(0, 8)}...`);
                        return true;
                    }
                    console.warn('[VERIFY] ❌ No valid treasury token inflow detected');
                    return false;
                }
                catch (e) {
                    this.rotateRpc();
                }
            }
            return false;
        });
    }
    extractPayerAccount(txHash) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            for (let attempt = 0; attempt < this.connections.length; attempt++) {
                try {
                    const tx = yield this.connection.getParsedTransaction(txHash, {
                        commitment: 'finalized',
                        maxSupportedTransactionVersion: 0
                    });
                    if (!tx || ((_a = tx.meta) === null || _a === void 0 ? void 0 : _a.err)) {
                        this.rotateRpc();
                        continue;
                    }
                    const keys = tx.transaction.message.accountKeys || [];
                    for (const key of keys) {
                        // Parsed transaction account key shape: { pubkey, signer, writable }
                        if (typeof key === 'object' && (key === null || key === void 0 ? void 0 : key.signer) === true && (key === null || key === void 0 ? void 0 : key.pubkey)) {
                            return key.pubkey.toString();
                        }
                    }
                    // Fallback: first account key if signer metadata isn't present.
                    if (keys.length > 0) {
                        const first = keys[0];
                        if (typeof first === 'string')
                            return first;
                        if (first === null || first === void 0 ? void 0 : first.pubkey)
                            return first.pubkey.toString();
                        return String(first);
                    }
                }
                catch (_) {
                    this.rotateRpc();
                }
            }
            return null;
        });
    }
}
exports.default = new SolanaService();
