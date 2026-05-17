/**
 * Probe IDRX API for Solana support — discover the right networkChainId.
 * Reads credentials from .env.local.
 */
import { createHmac } from 'crypto';
import { readFileSync } from 'fs';

function loadEnv() {
  for (const fname of ['../.env.production', '../.env.local']) {
    try {
      const txt = readFileSync(new URL(fname, import.meta.url), 'utf8');
      const env = {};
      for (const line of txt.split('\n')) {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)="?(.*?)"?$/);
        if (m) env[m[1]] = m[2];
      }
      if (env.IDRX_API_KEY) return env;
    } catch {}
  }
  return {};
}

const local = loadEnv();
const API_KEY = process.env.IDRX_API_KEY || local.IDRX_API_KEY || '';
const SECRET = process.env.IDRX_SECRET_KEY || local.IDRX_SECRET_KEY || '';
const BASE = 'https://idrx.co';

if (!API_KEY || !SECRET) {
  console.error('No IDRX creds found. They are on Vercel, not local.');
  console.error('Pulling from Vercel...');
  process.exit(1);
}

function sign(timestamp, method, urlPath, bodyStr) {
  const secretBytes = Buffer.from(SECRET, 'hex');
  const message = `${timestamp}${method.toUpperCase()}${urlPath}${bodyStr}`;
  return createHmac('sha256', secretBytes).update(message).digest('base64url');
}

async function request(method, urlPath, body) {
  const timestamp = String(Date.now());
  const bodyStr = body ? JSON.stringify(body) : '';
  const signature = sign(timestamp, method, urlPath, bodyStr);
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'idrx-api-key': API_KEY,
      'idrx-api-sig': signature,
      'idrx-api-ts': timestamp,
    },
    body: bodyStr || undefined,
  });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, text, json };
}

console.log('═══ IDRX Solana chainId probe ═══\n');

console.log('STEP 1 — Connectivity check (GET /api/auth/get-bank-accounts):');
const conn = await request('GET', '/api/auth/get-bank-accounts');
console.log('  status:', conn.status);
console.log('  data:', JSON.stringify(conn.json, null, 2).slice(0, 400));

console.log('\nSTEP 2 — Discover supported endpoints:');
const probeEndpoints = [
  '/api/transaction/get-supported-chains',
  '/api/transaction/get-supported-networks',
  '/api/transaction/networks',
  '/api/networks',
  '/api/chains',
  '/api/auth/networks',
];
for (const ep of probeEndpoints) {
  const r = await request('GET', ep);
  console.log(`  GET ${ep} → ${r.status}`);
  if (r.status !== 404 && r.json) console.log('    →', JSON.stringify(r.json).slice(0, 300));
}

console.log('\nSTEP 3 — Try redeem-request with various Solana chainId values:');
const fakeBurn = '5H5ZRGG5QnC5QLAQPGFaBjMSNtbxJUydn2Dv8VNuamJ1RT8pHP2PVUJRC1psvN6RDNL3UzziEvkNxVcqtjzzUUkM';
const candidates = ['137', '8453', '56', '11155111', '1', '1135', '8217', '100', '1751']; // Polygon, Base, BSC, Sepolia, Eth, Lisk, Kaia, Gnosis, Etherlink
for (const cid of candidates) {
  const body = {
    txHash: fakeBurn,
    networkChainId: cid,
    amountTransfer: '20000',
    bankAccount: '1234567890',
    bankCode: 'BCA',
    bankName: 'BCA',
    bankAccountName: 'Test',
    walletAddress: '',
  };
  const r = await request('POST', '/api/transaction/redeem-request', body);
  const errMsg = r.json?.message || r.json?.error || r.text.slice(0, 200);
  console.log(`  networkChainId='${cid}' → ${r.status}: ${errMsg.slice(0, 180)}`);
  await new Promise(r => setTimeout(r, 200));
}

console.log('\nDONE');
