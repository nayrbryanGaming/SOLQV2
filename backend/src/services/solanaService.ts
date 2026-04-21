import { paymentIntents } from './store';
import { Connection, PublicKey } from '@solana/web3.js';
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

        // Persist expected verification context for deterministic confirmation.
        intent.payer_account = userAccount;
        intent.input_mint = resolvedMint;
        intent.expected_output_mint = IDRX_MINT.toBase58();
        intent.expected_atomic_amount = amountAtomic;
        intent.expected_recipient_ata = treasuryIdrxAta?.toBase58();
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

    async verifyTransaction(txHash: string, intentId?: string): Promise<boolean> {
        const intent = intentId ? paymentIntents[intentId] : undefined;
        const expectedMint = intent?.expected_output_mint || IDRX_MINT.toBase58();
        const expectedAtomic = Math.max(0, Number(intent?.expected_atomic_amount || 0));
        const expectedRecipientAta = intent?.expected_recipient_ata || treasuryIdrxAta?.toBase58();

        for (let attempt = 0; attempt < this.connections.length; attempt++) {
            try {
                const tx = await this.connection.getParsedTransaction(txHash, {
                    commitment: 'finalized',
                    maxSupportedTransactionVersion: 0
                });

                if (!tx) { this.rotateRpc(); continue; }
                if (tx.meta?.err) return false;

                const preBalances = tx.meta?.preTokenBalances || [];
                const postBalances = tx.meta?.postTokenBalances || [];
                const treasuryOwner = TREASURY_WALLET.toBase58();

                const accountKeys = tx.transaction.message.accountKeys.map((k: any) => {
                    if (typeof k === 'string') return k;
                    if (k?.pubkey) return k.pubkey.toString();
                    return String(k);
                });

                const getAtomic = (raw: string | undefined) => {
                    const parsed = Number(raw || '0');
                    return Number.isFinite(parsed) ? parsed : 0;
                };

                const preByAccountIndex = new Map<number, number>();
                for (const b of preBalances) {
                    const ataAtIndex = accountKeys[b.accountIndex] || '';
                    const ataOk = expectedRecipientAta ? ataAtIndex === expectedRecipientAta : true;
                    if (b.mint === expectedMint && b.owner === treasuryOwner && ataOk) {
                        preByAccountIndex.set(b.accountIndex, getAtomic(b.uiTokenAmount?.amount));
                    }
                }

                let receivedAtomic = 0;
                for (const b of postBalances) {
                    const ataAtIndex = accountKeys[b.accountIndex] || '';
                    const ataOk = expectedRecipientAta ? ataAtIndex === expectedRecipientAta : true;
                    if (b.mint !== expectedMint || b.owner !== treasuryOwner || !ataOk) continue;
                    const postAtomic = getAtomic(b.uiTokenAmount?.amount);
                    const preAtomic = preByAccountIndex.get(b.accountIndex) || 0;
                    const delta = postAtomic - preAtomic;
                    if (delta > 0) receivedAtomic += delta;
                }

                if (expectedAtomic > 0 && receivedAtomic < expectedAtomic) {
                    console.warn(`[VERIFY] ❌ Atomic amount mismatch: expected >= ${expectedAtomic}, got ${receivedAtomic}`);
                    return false;
                }

                if (receivedAtomic > 0) {
                    console.log(`[VERIFY] ✅ Treasury ATA ${expectedRecipientAta || 'N/A'} received ${receivedAtomic} atomic ${expectedMint} for ${txHash.slice(0,8)}...`);
                    return true;
                }

                console.warn('[VERIFY] ❌ No valid treasury token inflow detected');
                return false;
            } catch (e) {
                this.rotateRpc();
            }
        }
        return false;
    }

    async extractPayerAccount(txHash: string): Promise<string | null> {
        for (let attempt = 0; attempt < this.connections.length; attempt++) {
            try {
                const tx = await this.connection.getParsedTransaction(txHash, {
                    commitment: 'finalized',
                    maxSupportedTransactionVersion: 0
                });

                if (!tx || tx.meta?.err) {
                    this.rotateRpc();
                    continue;
                }

                const keys: any[] = (tx.transaction.message as any).accountKeys || [];
                for (const key of keys) {
                    // Parsed transaction account key shape: { pubkey, signer, writable }
                    if (typeof key === 'object' && key?.signer === true && key?.pubkey) {
                        return key.pubkey.toString();
                    }
                }

                // Fallback: first account key if signer metadata isn't present.
                if (keys.length > 0) {
                    const first = keys[0];
                    if (typeof first === 'string') return first;
                    if (first?.pubkey) return first.pubkey.toString();
                    return String(first);
                }
            } catch (_) {
                this.rotateRpc();
            }
        }
        return null;
    }
}

export default new SolanaService();
