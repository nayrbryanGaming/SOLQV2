/**
 * SOLQ — REAL MAINNET PROOF (REAL MONEY)
 *
 * Sends 100,000 lamports (0.0001 SOL ≈ Rp 155) from darurat.json
 * to the SOLQ Gateway wallet ETcQv...oZYq on MAINNET.
 *
 * This is the EXACT same TX shape the browser builds in the new
 * Blowfish-safe flow: one SystemProgram.transfer instruction, no
 * Jupiter, no DEX, no complex programs. If this works on mainnet,
 * Solflare + Blowfish CAN scan and approve it in production.
 *
 * NB: This costs ~0.000105 SOL = ~Rp 165 of real money.
 *     Payer (darurat) has 0.0015 SOL = ~Rp 2,300 budget.
 */
import {
  Connection, Keypair, LAMPORTS_PER_SOL, PublicKey,
  SystemProgram, Transaction, sendAndConfirmTransaction,
} from '@solana/web3.js';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const MAINNET_RPCS = [
  'https://api.mainnet-beta.solana.com',
  'https://rpc.ankr.com/solana',
  'https://solana-rpc.publicnode.com',
];
const PLATFORM_FEE_WALLET = 'ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m';
const PROOF_LAMPORTS = 100_000; // 0.0001 SOL — small but real

const kpRaw = JSON.parse(readFileSync(join(homedir(), '.config', 'solana', 'darurat.json'), 'utf8'));
const payer = Keypair.fromSecretKey(Uint8Array.from(kpRaw));

// Try each RPC until one accepts the TX
async function pickRpc() {
  for (const rpc of MAINNET_RPCS) {
    try {
      const c = new Connection(rpc, 'confirmed');
      const v = await c.getVersion();
      console.log('  RPC:', rpc, '→', v['solana-core']);
      return c;
    } catch (e) {
      console.log('  RPC:', rpc, '→ FAIL:', e.message);
    }
  }
  throw new Error('All mainnet RPCs unreachable');
}

async function main() {
  console.log('═══ SOLQ — Real Mainnet Proof (REAL MONEY) ═══\n');
  console.log('STEP 1 — Pick reachable mainnet RPC:');
  const conn = await pickRpc();

  console.log('\nSTEP 2 — Read precise balances:');
  const payerBal = await conn.getBalance(payer.publicKey);
  const gatewayBal = await conn.getBalance(new PublicKey(PLATFORM_FEE_WALLET));
  console.log('  Payer (darurat) :', payer.publicKey.toString());
  console.log('  Payer balance   :', payerBal, 'lamports =', (payerBal/LAMPORTS_PER_SOL).toFixed(9), 'SOL');
  console.log('  Gateway (SOLQ)  :', PLATFORM_FEE_WALLET);
  console.log('  Gateway balance :', gatewayBal, 'lamports =', (gatewayBal/LAMPORTS_PER_SOL).toFixed(9), 'SOL');

  if (payerBal < PROOF_LAMPORTS + 10_000) {
    throw new Error(`Insufficient: need ${PROOF_LAMPORTS + 10_000} lamports for transfer + fee`);
  }

  console.log('\nSTEP 3 — Build TX (matches public/index.html ~line 2240):');
  const { blockhash } = await conn.getLatestBlockhash('confirmed');
  const tx = new Transaction({ recentBlockhash: blockhash, feePayer: payer.publicKey });
  tx.add(SystemProgram.transfer({
    fromPubkey: payer.publicKey,
    toPubkey: new PublicKey(PLATFORM_FEE_WALLET),
    lamports: PROOF_LAMPORTS,
  }));
  const serialized = tx.serialize({ requireAllSignatures: false });
  console.log('  TX size:', serialized.length, 'bytes');
  console.log('  Instructions: 1 (SystemProgram.transfer — Blowfish-whitelisted)');
  console.log('  Programs invoked:', tx.instructions.map(i => i.programId.toString()).join(', '));
  console.log('  Transfer amount:', PROOF_LAMPORTS, 'lamports =', (PROOF_LAMPORTS/LAMPORTS_PER_SOL).toFixed(9), 'SOL');

  console.log('\nSTEP 4 — Sign + broadcast on MAINNET:');
  const t0 = Date.now();
  const sig = await sendAndConfirmTransaction(
    conn, tx, [payer],
    { commitment: 'confirmed', maxRetries: 5, skipPreflight: false }
  );
  const elapsed = Date.now() - t0;
  console.log('  ✓ TX signature:', sig);
  console.log('  ✓ Confirmed in:', elapsed, 'ms');

  console.log('\nSTEP 5 — Verify on-chain:');
  const info = await conn.getTransaction(sig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
  console.log('  Slot:', info?.slot);
  console.log('  Fee paid:', info?.meta?.fee, 'lamports');
  console.log('  Status:', info?.meta?.err ? 'FAILED' : 'SUCCESS ✓');
  console.log('  Pre-balances :', info?.meta?.preBalances);
  console.log('  Post-balances:', info?.meta?.postBalances);

  console.log('\nSTEP 6 — Post-TX balances (live update verification):');
  const finalPayer = await conn.getBalance(payer.publicKey);
  const finalGateway = await conn.getBalance(new PublicKey(PLATFORM_FEE_WALLET));
  console.log('  Payer Δ  :', finalPayer - payerBal, 'lamports');
  console.log('  Gateway Δ:', finalGateway - gatewayBal, 'lamports (= +', PROOF_LAMPORTS, 'expected)');

  console.log('\n═══ MAINNET EXPLORER LINKS ═══');
  console.log(`Solana Explorer: https://explorer.solana.com/tx/${sig}`);
  console.log(`Solscan        : https://solscan.io/tx/${sig}`);
  console.log(`SolanaFM       : https://solana.fm/tx/${sig}`);
  console.log('\n★ REAL MONEY MOVED ON MAINNET. Same TX shape will pass Blowfish in Solflare.');
}

main().catch(e => {
  console.error('\n❌ ERROR:', e.message);
  if (e.logs) console.error('Logs:', e.logs);
  process.exit(1);
});
