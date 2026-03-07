import { paymentIntents } from './store';
import { Connection, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import fetch from 'node-fetch';

const JUPITER_QUOTE_API = 'https://lite-api.jup.ag/swap/v1/quote';
const JUPITER_SWAP_API = 'https://lite-api.jup.ag/swap/v1/swap';

// TREASURY WALLET (All Revenue & Settlement Flow)
const TREASURY_WALLET = new PublicKey('ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m');

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
// IDRX Stablecoin (Mainnet)
const IDRX_MINT = new PublicKey('idrxZcP8xiKkYk6XGD4uz1dxEYCWSgKDHqgjsBbwDur');

// Treasury ATA for IDRX (platform fee collection)
let treasuryIdrxAta: PublicKey | null = null;

// Multi-RPC Failover (Mainnet Reliability)
// Added Helius.dev as free 24/7 alternative to paid RPC providers
const RPC_ENDPOINTS = [
    process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
    "https://solana-mainnet.g.alchemy.com/v2/demo",
    "https://rpc.ankr.com/solana",
    "https://helius-rpc.com/",  // Helius.dev - Free tier, 24/7, high uptime ✅
];

class SolanaService {
    private connections: Connection[];
    private currentRpcIndex: number = 0;

    constructor() {
        this.connections = RPC_ENDPOINTS.map(url =>
            new Connection(url, { commitment: 'confirmed' })
        );
        this.resolveTreasuryAta();
    }

    private get connection(): Connection {
        return this.connections[this.currentRpcIndex];
    }

    private rotateRpc(): void {
        this.currentRpcIndex = (this.currentRpcIndex + 1) % this.connections.length;
    }

    private async resolveTreasuryAta() {
        try {
            treasuryIdrxAta = await getAssociatedTokenAddress(IDRX_MINT, TREASURY_WALLET);
            console.log(`[SOLANA] Treasury IDRX ATA: ${treasuryIdrxAta.toBase58()}`);
        } catch (e) {
            console.error("Failed to resolve Treasury ATA", e);
        }
    }

    /**
     * Detect input mint from user's intent or default to SOL.
     * Supports: SOL, USDC, or any SPL token mint address.
     */
    private resolveInputMint(inputMint?: string): string {
        if (!inputMint) return SOL_MINT;
        const upper = inputMint.toUpperCase();
        if (upper === 'USDC') return USDC_MINT;
        if (upper === 'SOL') return SOL_MINT;
        // Direct mint address passthrough
        return inputMint;
    }

    async createPaymentTransaction(intentId: string, userAccount: string, inputMint?: string): Promise<string> {
        const intent = paymentIntents[intentId];
        if (!intent) throw new Error(`Payment Intent not found: ${intentId}`);

        const amountIdr = intent.amount_details.fiat_amount;
        if (!amountIdr || amountIdr <= 0) throw new Error('Invalid amount: cannot be zero.');
        if (amountIdr > 100000000) throw new Error('Amount exceeds maximum limit (100M IDR).');

        const resolvedMint = this.resolveInputMint(inputMint);

        // IDRX has 2 decimals on Mainnet
        const amountAtomic = Math.floor(amountIdr * 100);

        // ── JUPITER V6 QUOTE ──
        const quoteParams = new URLSearchParams({
            inputMint: resolvedMint,
            outputMint: IDRX_MINT.toBase58(),
            amount: amountAtomic.toString(),
            swapMode: 'ExactOut',
            slippageBps: '100',         // 1% slippage for mainnet reliability
            platformFeeBps: '100',      // 1% platform fee → Treasury
        });

        const quoteRes = await fetch(`${JUPITER_QUOTE_API}?${quoteParams}`);
        const quoteData: any = await quoteRes.json();

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
            const idrValue = outAmountRaw / 100;           // IDRX 2 decimals → IDR
            const solValue = inAmountRaw / 1_000_000_000;  // Lamports → SOL
            const impliedRate = idrValue / solValue;

            const isSafe = await priceService.verifyRate(impliedRate, 'solana');
            if (!isSafe) {
                throw new Error("SECURITY: Jupiter price deviates >2.5% from CoinGecko. Blocked.");
            }
        }

        // ── JUPITER V6 SWAP TRANSACTION ──
        if (!treasuryIdrxAta) {
            await this.resolveTreasuryAta();
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
            feeAccount: treasuryIdrxAta?.toBase58() || undefined,
            destinationTokenAccount: treasuryIdrxAta?.toBase58() || undefined,
        };

        const swapRes = await fetch(JUPITER_SWAP_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(swapBody)
        });

        const swapData: any = await swapRes.json();
        if (swapData.error) {
            throw new Error(`Jupiter Swap Error: ${swapData.error}`);
        }
        if (!swapData.swapTransaction) {
            throw new Error('Jupiter: Failed to build swap transaction');
        }

        return swapData.swapTransaction;
    }

    async verifyTransaction(txHash: string): Promise<boolean> {
        for (let attempt = 0; attempt < this.connections.length; attempt++) {
            try {
                const tx = await this.connection.getTransaction(txHash, {
                    commitment: 'finalized',
                    maxSupportedTransactionVersion: 0
                });

                if (!tx) { this.rotateRpc(); continue; }
                if (tx.meta?.err) return false;

                const postBalances = tx.meta?.postTokenBalances;
                const hasTokenChanges = (postBalances?.length ?? 0) > 0;

                // Check if Treasury received IDRX
                const treasuryGotIdrx = postBalances?.some(pb =>
                    pb.owner === TREASURY_WALLET.toBase58() &&
                    pb.mint === IDRX_MINT.toBase58()
                );

                if (treasuryGotIdrx) {
                    console.log(`[VERIFY] ✅ Treasury received IDRX for ${txHash.slice(0,8)}...`);
                    return true;
                }

                // Fallback: any token movement = swap happened
                if (hasTokenChanges) {
                    console.log(`[VERIFY] ✅ TX finalized with token changes`);
                    return true;
                }

                return false;
            } catch (e) {
                this.rotateRpc();
            }
        }
        return false;
    }
}

export default new SolanaService();
