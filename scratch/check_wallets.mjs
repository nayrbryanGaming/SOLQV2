import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { readFileSync, readdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const DEVNET  = new Connection('https://api.devnet.solana.com', 'confirmed');
const MAINNET = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

const solDir = join(homedir(), '.config', 'solana');
const files = readdirSync(solDir).filter(f => f.endsWith('.json') && f !== 'cli');

console.log('Scanning keypairs in', solDir, '\n');

for (const f of files) {
  try {
    const raw = JSON.parse(readFileSync(join(solDir, f), 'utf8'));
    if (!Array.isArray(raw)) continue;
    const kp = Keypair.fromSecretKey(Uint8Array.from(raw));
    const [devBal, mainBal] = await Promise.all([
      DEVNET.getBalance(kp.publicKey),
      MAINNET.getBalance(kp.publicKey),
    ]);
    const marker = (devBal > 5000 || mainBal > 5000) ? ' ← HAS FUNDS' : '';
    console.log(`${f.padEnd(30)} ${kp.publicKey.toString()}`);
    console.log(`  devnet : ${devBal.toString().padStart(12)} lamports = ${(devBal/LAMPORTS_PER_SOL).toFixed(6)} SOL${marker}`);
    console.log(`  mainnet: ${mainBal.toString().padStart(12)} lamports = ${(mainBal/LAMPORTS_PER_SOL).toFixed(6)} SOL${marker}`);
    console.log();
  } catch {}
}
