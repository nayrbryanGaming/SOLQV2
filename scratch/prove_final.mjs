/**
 * SOLQ — FINAL COURT PROOF
 * Uses darurat.json which has 0.076 SOL devnet.
 * Sends REAL transaction on devnet: payer → self (new keypair) or nusa_harvest
 * to avoid rent-exemption issue with zero-balance destination.
 */
import {
  Connection, Keypair, LAMPORTS_PER_SOL, PublicKey,
  SystemProgram, Transaction, sendAndConfirmTransaction,
} from '@solana/web3.js';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const RPC     = 'https://api.devnet.solana.com';
const CLUSTER = 'devnet';
const PLATFORM_FEE_WALLET = 'ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m';

const conn  = new Connection(RPC, 'confirmed');
const kpRaw = JSON.parse(readFileSync(join(homedir(), '.config', 'solana', 'darurat.json'), 'utf8'));
const payer = Keypair.fromSecretKey(Uint8Array.from(kpRaw));

// Use nusa_harvest as recipient (already has devnet SOL, so above rent exemption)
const recipientRaw = JSON.parse(readFileSync(join(homedir(), '.config', 'solana', 'nusa_harvest-keypair.json'), 'utf8'));
const recipient    = Keypair.fromSecretKey(Uint8Array.from(recipientRaw));

async function main() {
  const ts = new Date().toISOString();
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║      SOLQ — LIVE COURT PROOF (DEVNET)                    ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║  Timestamp :', ts.padEnd(45), '║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // ── 1. PRECISE BALANCE READ ────────────────────────────────────
  console.log('STEP 1 — PRECISE BALANCE READ (proves RPC reads exact lamports)');
  const payerBal     = await conn.getBalance(payer.publicKey);
  const recipientBal = await conn.getBalance(recipient.publicKey);
  const feeWalletMainnet = await new Connection('https://api.mainnet-beta.solana.com', 'confirmed')
    .getBalance(new PublicKey(PLATFORM_FEE_WALLET));

  console.log('  Payer (darurat)  :', payer.publicKey.toString());
  console.log('  Balance DEVNET   :', payerBal, 'lamports =', (payerBal/LAMPORTS_PER_SOL).toFixed(9), 'SOL  ✓ PRECISE');
  console.log('  Recipient        :', recipient.publicKey.toString());
  console.log('  Balance DEVNET   :', recipientBal, 'lamports =', (recipientBal/LAMPORTS_PER_SOL).toFixed(9), 'SOL  ✓ PRECISE');
  console.log('  Fee wallet (MAINNET):', PLATFORM_FEE_WALLET);
  console.log('  Balance MAINNET  :', feeWalletMainnet, 'lamports =', (feeWalletMainnet/LAMPORTS_PER_SOL).toFixed(9), 'SOL  ✓ PRECISE');

  // ── 2. BUILD TX ────────────────────────────────────────────────
  console.log('\nSTEP 2 — BUILDING TRANSACTION (mirrors SOLQ payment flow)');
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
  const PROOF_LAMPORTS = 10000; // 0.00001 SOL
  const tx = new Transaction({
    recentBlockhash: blockhash,
    feePayer: payer.publicKey,
  });
  tx.add(SystemProgram.transfer({
    fromPubkey: payer.publicKey,
    toPubkey: recipient.publicKey,
    lamports: PROOF_LAMPORTS,
  }));
  const rawSize = tx.serialize({ requireAllSignatures: false }).length;
  console.log('  From     :', payer.publicKey.toString());
  console.log('  To       :', recipient.publicKey.toString());
  console.log('  Amount   :', PROOF_LAMPORTS, 'lamports =', (PROOF_LAMPORTS/LAMPORTS_PER_SOL).toFixed(9), 'SOL');
  console.log('  Blockhash:', blockhash);
  console.log('  TX size  :', rawSize, 'bytes');

  // ── 3. SIGN ────────────────────────────────────────────────────
  console.log('\nSTEP 3 — SIGNING TRANSACTION (wallet signs locally, key never leaves device)');
  tx.sign(payer);
  const sigBytes = tx.signatures[0].signature;
  console.log('  Pre-broadcast sig   :', Buffer.from(sigBytes).toString('hex').slice(0,44) + '...');
  console.log('  Signatures count    :', tx.signatures.length);
  console.log('  All required signed :', tx.signatures.every(s => s.signature !== null), '← WALLET SIGNED ✓');

  // ── 4. BROADCAST ──────────────────────────────────────────────
  console.log('\nSTEP 4 — BROADCASTING TO', CLUSTER.toUpperCase());
  const t0 = Date.now();
  const sig = await sendAndConfirmTransaction(
    conn, tx, [payer],
    { commitment: 'confirmed', maxRetries: 5, skipPreflight: false }
  );
  const elapsed = Date.now() - t0;

  // ── 5. VERIFY ON-CHAIN ────────────────────────────────────────
  const info = await conn.getTransaction(sig, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });
  const success   = !info?.meta?.err;
  const slot      = info?.slot ?? 'N/A';
  const fee       = info?.meta?.fee ?? 'N/A';
  const preBals   = info?.meta?.preBalances ?? [];
  const postBals  = info?.meta?.postBalances ?? [];

  // ── FINAL REPORT ──────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║    ✅  TRANSACTION CONFIRMED ON-CHAIN                    ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('  Cluster   :', CLUSTER);
  console.log('  Status    :', success ? 'SUCCESS ✓' : 'FAILED ✗');
  console.log('  Slot      :', slot);
  console.log('  Fee paid  :', fee, 'lamports');
  console.log('  Confirmed :', elapsed, 'ms');
  console.log('  Pre-bals  :', preBals.join(' / '), 'lamports');
  console.log('  Post-bals :', postBals.join(' / '), 'lamports');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('  TX SIGNATURE:');
  console.log('  ', sig);
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('  EXPLORER LINKS — COPY THESE FOR COURT:');
  console.log('');
  console.log('  Solana Explorer:');
  console.log(`  https://explorer.solana.com/tx/${sig}?cluster=${CLUSTER}`);
  console.log('');
  console.log('  Solscan:');
  console.log(`  https://solscan.io/tx/${sig}?cluster=${CLUSTER}`);
  console.log('');
  console.log('  SolanaFM:');
  console.log(`  https://solana.fm/tx/${sig}?cluster=${CLUSTER}-solana`);
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // ── BALANCE AFTER ─────────────────────────────────────────────
  console.log('STEP 5 — POST-TX BALANCE READ (proves live balance update)');
  const finalPayer = await conn.getBalance(payer.publicKey);
  const finalRecip = await conn.getBalance(recipient.publicKey);
  console.log('  Payer final    :', finalPayer, 'lamports =', (finalPayer/LAMPORTS_PER_SOL).toFixed(9), 'SOL');
  console.log('  Recipient final:', finalRecip, 'lamports =', (finalRecip/LAMPORTS_PER_SOL).toFixed(9), 'SOL');
  console.log('  Payer Δ        :', finalPayer - payerBal, 'lamports (transfer + fee)');
  console.log('  Recipient Δ    :', finalRecip - recipientBal, 'lamports received');

  console.log('\n★ ALL 5 STEPS COMPLETE:');
  console.log('  [1] Balance read  — WORKING, precision: 1 lamport = 0.000000001 SOL');
  console.log('  [2] TX build      — WORKING, valid serialized transaction');
  console.log('  [3] TX sign       — WORKING, wallet signed locally without key exposure');
  console.log('  [4] Broadcast     — WORKING, confirmed on-chain in', elapsed, 'ms');
  console.log('  [5] Explorer link — PUBLIC and PERMANENT, verifiable by any party');
}

main().catch(e => {
  console.error('\nERROR:', e.message, e.logs ?? '');
  process.exit(1);
});
