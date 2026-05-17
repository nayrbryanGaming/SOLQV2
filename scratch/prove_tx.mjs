/**
 * SOLQ — Proof-of-Transaction Script
 * Sends a real Solana devnet transaction and prints the explorer link.
 * This proves: keypair generation, RPC balance read, airdrop, TX build/sign/broadcast.
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

const RPC = 'https://api.devnet.solana.com';
const PLATFORM_FEE_WALLET = 'ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m';
const PROOF_LAMPORTS = 5000; // 0.000005 SOL — minimal dust transfer

const conn = new Connection(RPC, 'confirmed');

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  SOLQ — COURT PROOF: REAL DEVNET TRANSACTION');
  console.log('  Date:', new Date().toISOString());
  console.log('═══════════════════════════════════════════════════════\n');

  // 1. Generate ephemeral test keypair (no private key stored)
  const payer = Keypair.generate();
  console.log('1. Payer address (ephemeral):', payer.publicKey.toString());

  // 2. Read balance before airdrop
  const balBefore = await conn.getBalance(payer.publicKey);
  console.log('2. Balance before airdrop:', balBefore / LAMPORTS_PER_SOL, 'SOL');

  // 3. Airdrop 0.1 SOL on devnet
  console.log('3. Requesting devnet airdrop (0.1 SOL)...');
  const airdropSig = await conn.requestAirdrop(payer.publicKey, 0.1 * LAMPORTS_PER_SOL);
  await conn.confirmTransaction(airdropSig, 'confirmed');
  const balAfter = await conn.getBalance(payer.publicKey);
  console.log('   Airdrop confirmed. Balance now:', balAfter / LAMPORTS_PER_SOL, 'SOL');
  console.log('   Airdrop TX:', `https://explorer.solana.com/tx/${airdropSig}?cluster=devnet`);

  // 4. Read balance — proves RPC balance read works precisely
  const lamports = await conn.getBalance(payer.publicKey);
  console.log('\n4. PRECISE BALANCE READ (lamports):', lamports);
  console.log('   PRECISE BALANCE READ (SOL):', lamports / LAMPORTS_PER_SOL);

  // 5. Build transaction: transfer dust to PLATFORM_FEE_WALLET
  const recipient = new PublicKey(PLATFORM_FEE_WALLET);
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  const tx = new Transaction({
    recentBlockhash: blockhash,
    feePayer: payer.publicKey,
  });
  tx.add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: recipient,
      lamports: PROOF_LAMPORTS,
    })
  );
  console.log('\n5. Transaction built:');
  console.log('   From:', payer.publicKey.toString());
  console.log('   To (SOLQ fee wallet):', PLATFORM_FEE_WALLET);
  console.log('   Amount:', PROOF_LAMPORTS, 'lamports =', PROOF_LAMPORTS / LAMPORTS_PER_SOL, 'SOL');

  // 6. Sign & broadcast
  console.log('\n6. Signing and broadcasting...');
  const signature = await sendAndConfirmTransaction(
    conn,
    tx,
    [payer],
    { commitment: 'confirmed', maxRetries: 5 }
  );

  // 7. Verify on-chain
  const txInfo = await conn.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
  const slot = txInfo?.slot ?? '(slot not fetched)';
  const fee = txInfo?.meta?.fee ?? '?';

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  ✓ TRANSACTION CONFIRMED ON-CHAIN');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Signature :', signature);
  console.log('  Slot      :', slot);
  console.log('  Fee paid  :', fee, 'lamports');
  console.log('\n  EXPLORER LINK (click to verify):');
  console.log(`  https://explorer.solana.com/tx/${signature}?cluster=devnet`);
  console.log('\n  SHORT LINK (Solscan devnet):');
  console.log(`  https://solscan.io/tx/${signature}?cluster=devnet`);
  console.log('═══════════════════════════════════════════════════════\n');

  // 8. Final balance read proof
  const finalBal = await conn.getBalance(payer.publicKey);
  console.log('8. Final payer balance (precise):', finalBal, 'lamports =', finalBal / LAMPORTS_PER_SOL, 'SOL');
  console.log('   Deducted:', (balAfter - finalBal), 'lamports (transfer + fee)');
  console.log('\nPROOF COMPLETE — transaction is real, signed, on-chain, verifiable.');
}

main().catch(e => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
