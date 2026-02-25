import { paymentIntents } from './store';
import { Connection, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import fetch from 'node-fetch';

const JUPITER_QUOTE_API = 'https://quote-api.jup.ag/v6/quote';
const JUPITER_SWAP_API = 'https://quote-api.jup.ag/v6/swap';

// TREASURY WALLET (All Revenue & Settlement Flow)
const TREASURY_WALLET = new PublicKey('ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m');

const SOL_MINT = 'So11111111111111111111111111111111111111112';
// Using IDRX for stable IDR settlement (Mainnet)
const IDRX_MINT = new PublicKey('IDRXv5nN2uX7PpgasFp6QfFh5ZpK78C30');

class SolanaService {
    connection: Connection;

    constructor() {
        const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
        const wssUrl = process.env.SOLANA_WSS_URL || rpcUrl.replace('https', 'wss');

        this.connection = new Connection(rpcUrl, {
            commitment: 'confirmed',
            wsEndpoint: wssUrl
        });
        console.log(`[INFRA] Solana RPC Initialized: ${rpcUrl} `);
    }

    async createPaymentTransaction(intentId: string, userAccount: string, inputMint: string = SOL_MINT): Promise<string> {
        const intent = paymentIntents[intentId];
        if (!intent) throw new Error('Payment Intent not found');

        const amountIdr = intent.amount_details.fiat_amount;
        if (!amountIdr || amountIdr <= 0) throw new Error('Invalid amount');

        // IDRX (Stabelify) has 2 decimals on Mainnet
        const amountAtomic = Math.floor(amountIdr * 100);

        console.log(`[Jupiter] Orchestrating IDRX Swap: ${amountIdr} IDR -> ${amountAtomic} atomic units`);

        // 1. Get Quote (ExactOut - we want specific IDR amount to arrive)
        const quoteParams = new URLSearchParams({
            inputMint: inputMint,
            outputMint: IDRX_MINT.toBase58(),
            amount: amountAtomic.toString(),
            swapMode: 'ExactOut',
            slippageBps: '50', // 0.5% Slippage
            platformFeeBps: '100', // 1% Platform Fee (Revenue Optimized)
        });

        const quoteRes = await fetch(`${JUPITER_QUOTE_API}?${quoteParams}`);
        const quoteData: any = await quoteRes.json();

        if (quoteData.error || !quoteData.data) {
            // Fallback for V6 structure: data is sometimes separate or direct
            if (quoteData.error) throw new Error(`Jupiter Quote Error: ${JSON.stringify(quoteData)} `);
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
            const isSafe = await priceService.verifyRate(impliedRate, 'solana');
            if (!isSafe) {
                console.error("[SOLANA SERVICE] CRITICAL: Oracle Price Deviation > 2%");
                // ABSOLUTE RULE: If pricing is not deterministic -> STOP.
                throw new Error("SECURITY ALERT: Jupiter price deviates too much from Market (CoinGecko). Transaction BLOCKED.");
            }
        }

        console.log(`[Jupiter] Quote: In ${quoteData.inAmount} (${inputMint}) -> Out ${quoteData.outAmount} (IDRX)`);

        // 2. destinationWallet (Treasury/Settlement Wallet)
        // Jupiter will auto-resolve the ATA and create it if necessary if we just pass destinationWallet.
        const swapBody = {
            quoteResponse: quoteData,
            userPublicKey: userAccount,
            wrapAndUnwrapSol: true,
            destinationWallet: TREASURY_WALLET.toBase58(),
            feeAccount: TREASURY_WALLET.toBase58(),
        };

        const swapRes = await fetch(JUPITER_SWAP_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(swapBody)
        });

        const swapData: any = await swapRes.json();
        if (!swapData.swapTransaction) throw new Error('Failed to generate swap transaction');

        return swapData.swapTransaction;
    }

    async verifyTransaction(txHash: string): Promise<boolean> {
        try {
            console.log(`[VERIFY] Checking ${txHash} for Finalization...`);
            const tx = await this.connection.getTransaction(txHash, {
                commitment: 'finalized', // Sam Altman Standard: No fake success.
                maxSupportedTransactionVersion: 0
            });

            if (!tx) {
                console.log(`[VERIFY] Transaction not found or not finalized yet.`);
                return false;
            }

            if (tx.meta?.err) {
                console.log(`[VERIFY] On-chain transaction error: ${JSON.stringify(tx.meta.err)}`);
                return false;
            }

            // TRUTH CHECK: Ensure the Treasury Wallet actually received the funds
            const isSettlementTarget = tx.transaction.message.staticAccountKeys.some(
                k => k.equals(TREASURY_WALLET)
            );

            if (!isSettlementTarget) {
                console.error(`[SECURITY ALERT] Transaction ${txHash} does not involve Treasury Wallet!`);
                return false;
            }

            // SUCCESS: Finalized on-chain.
            console.log(`[VERIFY] ✅ Transaction PROVEN on Mainnet: ${txHash}`);
            return true;
        } catch (e) {
            console.error(`[VERIFY ERROR] Oracle Failure or RPC Lag: ${e}`);
            return false;
        }
    }
}

export default new SolanaService();
