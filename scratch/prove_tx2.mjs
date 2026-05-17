/**
 * SOLQ — Proof-of-Transaction v2
 * Uses existing local keypair. Tries airdrop, then sends real TX.
 */
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const RPC_DEVNET  = 'https://api.devnet.solana.com';
const RPC_MAINNET = 'https://api.mainnet-beta.solana.com';
const PLATFORM_FEE_WALLET = 'ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m';

async function readKeypair(path) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

async function tryAirdrop(conn, pubkey, times = 3) {
  for (let i = 0; i < times; i++) {
    try {
      console.log(`   Airdrop attempt ${i+1}/${times}...`);
      const sig = await conn.requestAirdrop(pubkey, 0.5 * LAMPORTS_PER_SOL);
      await conn.confirmTransaction(sig, 'confirmed');
      return sig;
    } catch(e) {
      if (i < times - 1) await new Promise(r => setTimeout(r, 3000));
      else throw e;
    }
  }
}

async function probeBalance(label, conn, address) {
  const lamports = await conn.getBalance(new PublicKey(address));
  console.log(`   ${label}: ${lamports} lamports = ${(lamports/LAMPORTS_PER_SOL).toFixed(9)} SOL  [PRECISE READ OK]`);
  return lamports;
}

async function main() {
  const ts = new Date().toISOString();
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║    SOLQ — COURT PROOF: REAL ON-CHAIN TRANSACTION     ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('  Timestamp:', ts, '\n');

  // Load existing local keypair
  const kpPath = join(homedir(), '.config', 'solana', 'id.json');
  const payer  = await readKeypair(kpPath);
  console.log('1. Payer public key:', payer.publicKey.toString());

  // ── DEVNET ─────────────────────────────────────────────────────
  const devConn = new Connection(RPC_DEVNET, 'confirmed');
  let devBal = await devConn.getBalance(payer.publicKey);
  console.log('\n[DEVNET]');
  console.log('2. Devnet balance (initial):', devBal, 'lamports =', devBal / LAMPORTS_PER_SOL, 'SOL');

  if (devBal < 0.01 * LAMPORTS_PER_SOL) {
    console.log('3. Balance low — requesting devnet airdrop...');
    try {
      const airdropSig = await tryAirdrop(devConn, payer.publicKey);
      devBal = await devConn.getBalance(payer.publicKey);
      console.log('   Airdrop TX:', `https://explorer.solana.com/tx/${airdropSig}?cluster=devnet`);
      console.log('   Balance after airdrop:', devBal / LAMPORTS_PER_SOL, 'SOL');
    } catch(e) {
      console.log('   Devnet faucet rate-limited:', e.message);
      console.log('   Trying alternative: web3 faucet...');
      // Alternative: use the web faucet endpoint
      try {
        const resp = await fetch('https://faucet.solana.com/api/request_airdrop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pubkey: payer.publicKey.toString(), lamports: 500000000 }),
          signal: AbortSignal.timeout(15000),
        });
        const body = await resp.json().catch(() => ({}));
        console.log('   Faucet response:', body);
        await new Promise(r => setTimeout(r, 5000));
        devBal = await devConn.getBalance(payer.publicKey);
        console.log('   Balance after faucet:', devBal / LAMPORTS_PER_SOL, 'SOL');
      } catch(e2) {
        console.log('   Faucet also failed:', e2.message);
      }
    }
  }

  // ── PRECISE BALANCE READS (both clusters) ──────────────────────
  console.log('\n3. PRECISION BALANCE AUDIT:');
  await probeBalance('DEVNET  payer', devConn, payer.publicKey.toString());
  await probeBalance('DEVNET  fee wallet', devConn, PLATFORM_FEE_WALLET);
  const mainConn = new Connection(RPC_MAINNET, 'confirmed');
  await probeBalance('MAINNET payer', mainConn, payer.publicKey.toString());
  await probeBalance('MAINNET fee wallet', mainConn, PLATFORM_FEE_WALLET);

  // ── BUILD + SIGN + SEND TX ─────────────────────────────────────
  const sendConn = devBal >= 5000 ? devConn : mainConn;
  const cluster  = devBal >= 5000 ? 'devnet' : 'mainnet-beta';

  if (devBal < 5000) {
    console.log('\n⚠ Devnet balance insufficient for TX. Checking mainnet...');
    const mainBal = await mainConn.getBalance(payer.publicKey);
    if (mainBal < 5000) {
      console.log('  Both devnet and mainnet balances too low to send TX.');
      console.log('  PROOF: The balance read mechanism IS working (showed', mainBal, 'lamports precisely).');
      console.log('  Fund the wallet at:', payer.publicKey.toString(), 'then re-run this script.');
      return;
    }
    console.log('  Mainnet balance ok:', mainBal / LAMPORTS_PER_SOL, 'SOL — using mainnet');
  }

  console.log('\n4. Building transaction...');
  const recipient = new PublicKey(PLATFORM_FEE_WALLET);
  const { blockhash, lastValidBlockHeight } = await sendConn.getLatestBlockhash();
  const lamports = 5000; // 0.000005 SOL dust proof
  const tx = new Transaction({ recentBlockhash: blockhash, feePayer: payer.publicKey });
  tx.add(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: recipient, lamports }));
  tx.sign(payer);
  const serialized = tx.serialize();
  console.log('   TX serialized bytes:', serialized.length);
  console.log('   Instruction count:', tx.instructions.length);
  console.log('   Blockhash:', blockhash);

  console.log('\n5. Broadcasting to', cluster, '...');
  const t0 = Date.now();
  const signature = await sendAndConfirmTransaction(
    sendConn, tx, [payer],
    { commitment: 'confirmed', maxRetries: 5, skipPreflight: false }
  );
  const elapsed = Date.now() - t0;

  // ── VERIFY ────────────────────────────────────────────────────
  const info = await sendConn.getTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });

  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║         ✓ TRANSACTION CONFIRMED ON-CHAIN             ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('  Signature :', signature);
  console.log('  Cluster   :', cluster);
  console.log('  Slot      :', info?.slot ?? 'N/A');
  console.log('  Fee paid  :', info?.meta?.fee ?? 'N/A', 'lamports');
  console.log('  Time      :', elapsed, 'ms to confirm');
  console.log('  Status    :', info?.meta?.err ? 'FAILED' : 'SUCCESS');
  console.log('');
  console.log('  ► EXPLORER LINK (PUBLIC, VERIFIABLE):');
  console.log(`  https://explorer.solana.com/tx/${signature}?cluster=${cluster}`);
  console.log('');
  console.log('  ► SOLSCAN LINK:');
  console.log(`  https://solscan.io/tx/${signature}?cluster=${cluster}`);
  console.log('');
  console.log('  ► SolanaFM:');
  console.log(`  https://solana.fm/tx/${signature}?cluster=${cluster}-solana`);
  console.log('╚══════════════════════════════════════════════════════╝\n');

  // Final balance check
  const finalBal = await sendConn.getBalance(payer.publicKey);
  console.log('6. Final balance (post-TX):', finalBal, 'lamports =', finalBal / LAMPORTS_PER_SOL, 'SOL');
  console.log('   Deducted (transfer + fee):', (devBal >= 5000 ? devBal : await mainConn.getBalance(payer.publicKey)) - finalBal, 'lamports (approx)');
  console.log('\n★ PROOF COMPLETE — Transaction is real, signed, confirmed, and publicly verifiable.');
}

main().catch(e => {
  console.error('\nFATAL ERROR:', e.message);
  if (e.message?.includes('airdrop')) {
    console.log('TIP: Devnet faucet is rate-limited. Visit https://faucet.solana.com manually.');
  }
  process.exit(1);
});
