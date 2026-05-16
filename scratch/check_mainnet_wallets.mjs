/**
 * Check mainnet balance of all local keypairs.
 * If any has > 0.005 SOL on mainnet, we can run a real-money TX test.
 */
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { readFileSync, readdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const MAINNET = 'https://api.mainnet-beta.solana.com';
const PUBLIC_RPCS = [
  'https://api.mainnet-beta.solana.com',
  'https://rpc.ankr.com/solana',
  'https://solana-rpc.publicnode.com',
];

async function getBalance(addr) {
  for (const rpc of PUBLIC_RPCS) {
    try {
      const c = new Connection(rpc, 'confirmed');
      const bal = await c.getBalance(new PublicKey(addr));
      return { lamports: bal, rpc };
    } catch (_) {}
  }
  return { lamports: -1, rpc: null };
}

const dir = join(homedir(), '.config', 'solana');
const files = readdirSync(dir).filter(f => f.endsWith('.json'));

console.log('═══ Mainnet balance check ═══\n');
for (const file of files) {
  try {
    const raw = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    if (!Array.isArray(raw) || raw.length < 32) continue;
    const kp = Keypair.fromSecretKey(Uint8Array.from(raw));
    const addr = kp.publicKey.toString();
    const { lamports } = await getBalance(addr);
    const sol = lamports >= 0 ? (lamports / LAMPORTS_PER_SOL).toFixed(9) : 'ERROR';
    const flag = lamports > 5_000_000 ? '  ← USABLE for mainnet test (>0.005 SOL)' : '';
    console.log(`  ${file.padEnd(35)} ${addr}`);
    console.log(`  ${' '.repeat(35)} ${sol} SOL${flag}\n`);
  } catch (e) {
    console.log(`  ${file.padEnd(35)} SKIP (${e.message})\n`);
  }
}
