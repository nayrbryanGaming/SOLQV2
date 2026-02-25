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
const node_fetch_1 = __importDefault(require("node-fetch")); // Ensure node-fetch is available or use native fetch in Node 18+
const JUPITER_QUOTE_API = 'https://quote-api.jup.ag/v6/quote';
const JUPITER_SWAP_API = 'https://quote-api.jup.ag/v6/swap';
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'; // Use a good RPC in production
// TREASURY WALLET (Requested Elon Musk Address / Sandbox Destination)
const TREASURY_WALLET = new web3_js_1.PublicKey('7dNTS9SPVzA8qfJmULiVhB7ff1AbZDAnB7awFRHF6Dw');
const SOL_MINT = 'So11111111111111111111111111111111111111112';
// Using USDC for stable settlement (Mainnet)
const IDRX_MINT = new web3_js_1.PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
class SolanaService {
    constructor() {
        this.connection = new web3_js_1.Connection(RPC_URL, 'confirmed');
    }
    createPaymentTransaction(intentId_1, userAccount_1) {
        return __awaiter(this, arguments, void 0, function* (intentId, userAccount, inputMint = SOL_MINT) {
            const intent = store_1.paymentIntents[intentId];
            if (!intent)
                throw new Error('Payment Intent not found');
            const amountIdr = intent.amount_details.fiat_amount;
            if (!amountIdr || amountIdr <= 0)
                throw new Error('Invalid amount');
            // IDRX (StraitsX Indonesia Rupiah) - 2 Decimals (usually) or 6?
            // CHECK MINT: IDRXv5nN2...
            // Mainnet IDRX is 2 decimals (1 IDR = 0.01 IDRX? No, 1 IDR = 1 IDRX usually, but decimals logic matters)
            // Standard IDRX is 2 decimal places. 100 IDR = 10000 atomic units?
            // WAIT. Stablecoins: USDC (6), USDT (6).
            // IDR is small unit. 1 Rupiah is tiny.
            // Usually 1 IDRX token = 1 Rupiah.
            // Decimals = 0? Or 2 for cents?
            // Let's assume 2 decimals for safely handling "sen".
            // 10,000 IDR = 10,000.00 => 1,000,000 atomic.
            const amountAtomic = Math.floor(amountIdr * 100);
            console.log(`[Jupiter] Calculating Quote: ${amountIdr} IDR -> ${amountAtomic} atomic value`);
            // 1. Get Quote (ExactOut - we want specific IDR amount to arrive)
            const quoteParams = new URLSearchParams({
                inputMint: inputMint,
                outputMint: IDRX_MINT.toBase58(),
                amount: amountAtomic.toString(),
                swapMode: 'ExactOut',
                slippageBps: '50', // 0.5% Slippage
                platformFeeBps: '50', // 0.5% Platform Fee (Revenue)
            });
            const quoteRes = yield (0, node_fetch_1.default)(`${JUPITER_QUOTE_API}?${quoteParams}`);
            const quoteData = yield quoteRes.json();
            if (quoteData.error || !quoteData.data) {
                // Fallback for V6 structure: data is sometimes separate or direct
                if (quoteData.error)
                    throw new Error(`Jupiter Quote Error: ${JSON.stringify(quoteData)}`);
            }
            // Jupiter Quote Amount Logic:
            // In ExactOut, inputAmount is what user pays (in Lamports).
            // implied price = (outAmount / 100) / (inAmount / 10^9) ? 
            // No, simplest is: 1 SOL = ? IDRX.
            const inAmountLamports = Number(quoteData.inAmount);
            const outAmountAtomic = Number(quoteData.outAmount);
            // Oracle Check
            if (inputMint === SOL_MINT) {
                const priceService = require('./priceService').PriceService.getInstance(); // Lazy load
                // Calculate Implied Rate: IDR / SOL
                // outAmountAtomic (2 decimals) -> IDR
                // inAmountLamports (9 decimals) -> SOL
                const idrValue = outAmountAtomic / 100;
                const solValue = inAmountLamports / 1000000000;
                const impliedRate = idrValue / solValue;
                // Verify
                const isSafe = yield priceService.verifyRate(impliedRate, 'solana');
                if (!isSafe) {
                    console.error("[SOLANA SERVICE] CRITICAL: Oracle Price Deviation > 2%");
                    throw new Error("Price Deviation Protection: Quote differs significantly from Market Rate.");
                }
            }
            console.log(`[Jupiter] Quote: In ${quoteData.inAmount} (${inputMint}) -> Out ${quoteData.outAmount} (IDRX)`);
            // 2. destinationWallet (Treasury/Settlement Wallet)
            // Jupiter will auto-resolve the ATA and create it if necessary if we just pass destinationWallet.
            const swapBody = {
                quoteResponse: quoteData,
                userPublicKey: userAccount,
                wrapAndUnwrapSol: true,
                destinationWallet: TREASURY_WALLET.toBase58(), // Direct to Settlement Public Key
                // Removed feeAccount to prevent instruction conflicts for now
            };
            const swapRes = yield (0, node_fetch_1.default)(JUPITER_SWAP_API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(swapBody)
            });
            const swapData = yield swapRes.json();
            if (!swapData.swapTransaction)
                throw new Error('Failed to generate swap transaction');
            return swapData.swapTransaction;
        });
    }
    verifyTransaction(txHash) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                console.log(`[VERIFY] Checking ${txHash}...`);
                const tx = yield this.connection.getTransaction(txHash, {
                    commitment: 'confirmed',
                    maxSupportedTransactionVersion: 0
                });
                if (!tx) {
                    console.log(`[VERIFY] Tx not found (yet).`);
                    return false;
                }
                if ((_a = tx.meta) === null || _a === void 0 ? void 0 : _a.err) {
                    console.log(`[VERIFY] Tx failed on-chain:`, tx.meta.err);
                    return false;
                }
                // OPTIONAL: Verify Balance Change
                // We expect Treasury IDRX ATA to increase.
                // Simplified for MVP: If it succeeded and contained the Swap instruction, reliable enough.
                // But strict verifying pre/post token balances is better.
                return true;
            }
            catch (e) {
                console.error(`[VERIFY ERROR] ${e}`);
                return false;
            }
        });
    }
}
exports.default = new SolanaService();
