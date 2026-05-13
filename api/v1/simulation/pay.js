import { getRealTimePricing } from '../../utils/pricing.js';
import { testConnectivity as idrxTestConnectivity } from '../../utils/idrx.js';
import { createPrivateKey, sign as nodeSign } from 'node:crypto';

const PLATFORM_WALLET = 'ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m';
const DEV_WALLET = '35z7X59rtyts557Up1RAwpyYN7x2cFqcDc7RjPuNxFzr';
const SPREAD_BPS = 50; // 0.5%
const MIN_FEE_IDR = 2500;

const SOLANA_RPCS = [
  'https://api.mainnet-beta.solana.com',
  'https://solana-mainnet.g.alchemy.com/v2/demo',
];

// ── helpers ────────────────────────────────────────────────────────────────────
function fakeSignature() {
  const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let sig = '';
  for (let i = 0; i < 88; i++) sig += chars[Math.floor(Math.random() * chars.length)];
  return sig;
}

function jitter(base) {
  return Math.round(base * (1 + (Math.random() - 0.5) * 0.006));
}

// ── base58 ─────────────────────────────────────────────────────────────────────
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58enc(bytes) {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let s = '';
  while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  let z = 0; for (const b of bytes) { if (b !== 0) break; z++; }
  return '1'.repeat(z) + s;
}
function b58dec(s) {
  let n = 0n;
  for (const c of s) { const i = B58.indexOf(c); if (i < 0) throw new Error('Bad b58'); n = n * 58n + BigInt(i); }
  const out = []; while (n > 0n) { out.unshift(Number(n & 0xffn)); n >>= 8n; }
  let z = 0; for (const c of s) { if (c !== '1') break; z++; }
  return new Uint8Array([...new Array(z).fill(0), ...out]);
}
function cu16(n) {
  if (n <= 0x7f) return [n];
  if (n <= 0x3fff) return [0x80|(n&0x7f), n>>7];
  return [0x80|(n&0x7f), 0x80|((n>>7)&0x7f), n>>14];
}
function u64le(n) {
  const b = new Uint8Array(8); let v = BigInt(Math.round(n));
  for (let i = 0; i < 8; i++) { b[i] = Number(v & 0xffn); v >>= 8n; } return b;
}

// ── Solana RPC ──────────────────────────────────────────────────────────────────
async function rpc(method, params = []) {
  let last;
  for (const url of SOLANA_RPCS) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(9000),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
      if (j.result !== undefined && j.result !== null) return j.result;
    } catch (e) { last = e; }
  }
  throw last || new Error('RPC failed');
}

// ── Ed25519 sign (PKCS8 DER header + seed) ─────────────────────────────────────
function signEd25519(seed32, msg) {
  const hdr = Buffer.from('302e020100300506032b657004220420', 'hex');
  const key = createPrivateKey({ key: Buffer.concat([hdr, Buffer.from(seed32)]), format: 'der', type: 'pkcs8' });
  return new Uint8Array(nodeSign(null, Buffer.from(msg), key));
}

// ── Build + sign + broadcast SOL transfer ──────────────────────────────────────
async function realSolTx(seed32, pubBytes32, toB58, lamports) {
  const bhr = await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }]);
  const blockhash = b58dec(bhr.value.blockhash);
  const to = b58dec(toB58);
  const sys = new Uint8Array(32);
  const instrData = new Uint8Array([2, 0, 0, 0, ...u64le(lamports)]);
  const message = new Uint8Array([
    1, 0, 1,
    ...cu16(3),
    ...pubBytes32, ...to, ...sys,
    ...blockhash,
    ...cu16(1),
    2, ...cu16(2), 0, 1,
    ...cu16(instrData.length), ...instrData,
  ]);
  const sig = signEd25519(seed32, message);
  const txB64 = Buffer.from(new Uint8Array([...cu16(1), ...sig, ...message])).toString('base64');
  return await rpc('sendTransaction', [txB64, { encoding: 'base64', preflightCommitment: 'confirmed', maxRetries: 3 }]);
}

// ── SOL/IDR price ──────────────────────────────────────────────────────────────
async function getSolIdr() {
  try {
    const [j, f] = await Promise.all([
      fetch('https://lite-api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112', { signal: AbortSignal.timeout(5000) }).then(r => r.json()),
      fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(5000) }).then(r => r.json()),
    ]);
    const p = j?.data?.So11111111111111111111111111111111111111112?.price;
    const x = f?.rates?.IDR;
    if (p > 0 && x > 0) return p * x;
  } catch (_) {}
  const [b, f] = await Promise.all([
    fetch('https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT', { signal: AbortSignal.timeout(5000) }).then(r => r.json()),
    fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(5000) }).then(r => r.json()),
  ]);
  const solUsd = Number(b?.price); const usdIdr = f?.rates?.IDR;
  if (solUsd > 0 && usdIdr > 0) return solUsd * usdIdr;
  throw new Error('SOL/IDR rate unavailable');
}

// ── Main handler ───────────────────────────────────────────────────────────────
export default async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const { amount_idr, token = 'SOL', merchant, nmid, wallet_address, cluster: rawCluster, real_tx } = req.body || {};
  const cluster = String(rawCluster || 'mainnet-beta').toLowerCase() === 'devnet' ? 'devnet' : 'mainnet-beta';
  const amountIdr = Number(amount_idr);
  if (!amountIdr || amountIdr < 100) {
    return res.status(400).json({ simulation: true, error: 'amount_idr must be >= 100' });
  }

  // ── REAL TX mode: server signs + broadcasts using DEMO_KEYPAIR_B64 ────────────
  if (real_tx && process.env.DEMO_KEYPAIR_B64) {
    try {
      const kpBytes = Buffer.from(process.env.DEMO_KEYPAIR_B64, 'base64');
      if (kpBytes.length < 64) throw new Error('Keypair must be 64 bytes');
      const seed32   = kpBytes.slice(0, 32);
      const pubBytes = kpBytes.slice(32, 64);
      const fromB58  = b58enc(pubBytes);

      const solIdr   = await getSolIdr();
      const lamports = Math.ceil((amountIdr * 1.005 / solIdr) * 1e9);

      const signature = await realSolTx(seed32, pubBytes, PLATFORM_WALLET, lamports);

      return res.status(200).json({
        ok: true,
        real_tx: true,
        signature,
        explorer_url: `https://explorer.solana.com/tx/${signature}?cluster=mainnet-beta`,
        solscan_url:  `https://solscan.io/tx/${signature}`,
        from:         fromB58,
        to:           PLATFORM_WALLET,
        lamports,
        sol_amount:   (lamports / 1e9).toFixed(8),
        amount_idr:   amountIdr,
        mode:         'SERVER_SIGNED_REAL_TX',
      });
    } catch (err) {
      return res.status(500).json({ ok: false, real_tx: true, error: err.message });
    }
  }

  // ── SIMULATION mode (default) ─────────────────────────────────────────────────
  const tok = String(token).toUpperCase();
  let solIdr = 2850000;
  let usdcIdr = 16350;

  try {
    const pricing = await getRealTimePricing();
    if (pricing.sol_idr) solIdr = pricing.sol_idr;
    if (pricing.usdc_idr) usdcIdr = pricing.usdc_idr;
  } catch (_) { /* use fallback */ }

  const prices = { SOL: jitter(solIdr), USDC: jitter(usdcIdr), IDRX: 1 };
  const rate = prices[tok] || prices.SOL;
  const spread = SPREAD_BPS / 10000;
  const effectiveRate = rate * (1 - spread);
  const tokenAmount = tok === 'IDRX' ? amountIdr : amountIdr / effectiveRate;
  const platformFee = Math.max(MIN_FEE_IDR, Math.round(amountIdr * spread));
  const platformShare = Math.round(platformFee * 0.70);
  const devShare = platformFee - platformShare;
  const fakeSig = fakeSignature();
  const intentId = `sim_${Date.now()}`;
  const clusterParam = cluster === 'devnet' ? '?cluster=devnet' : '?cluster=mainnet-beta';
  const explorerUrl = `https://explorer.solana.com/tx/${fakeSig}${clusterParam}`;
  const solscanUrl = `https://solscan.io/tx/${fakeSig}${cluster === 'devnet' ? '?cluster=devnet' : ''}`;

  let idrxApiTest = null;
  try {
    idrxApiTest = await idrxTestConnectivity();
  } catch (_) {
    idrxApiTest = { ok: false, error: 'connectivity test failed' };
  }

  return res.status(200).json({
    simulation: true,
    simulation_note: 'SIMULASI PENUH — Tidak ada dana nyata yang berpindah. QRIS parsing NYATA, Solana TX SIMULASI.',
    intent_id: intentId,
    status: 'SETTLEMENT_COMPLETE',
    cluster,
    merchant: merchant || 'Unknown Merchant',
    nmid: nmid || 'N/A',
    wallet_address: wallet_address || 'NOT_PROVIDED',
    amount_idr: amountIdr,
    token: tok,
    token_amount: parseFloat(tokenAmount.toFixed(tok === 'IDRX' ? 0 : 6)),
    rate_idr: rate,
    effective_rate_idr: Math.round(effectiveRate),
    platform_fee_idr: platformFee,
    platform_fee_pct: '0.5%',
    fee_split: {
      platform_wallet: PLATFORM_WALLET,
      platform_share_idr: platformShare,
      dev_wallet: DEV_WALLET,
      dev_share_idr: devShare,
      split: '70% platform / 30% dev',
    },
    simulated_tx_signature: fakeSig,
    simulated_explorer_url: explorerUrl,
    simulated_solscan_url: solscanUrl,
    solana_network: `${cluster} (SIMULATED)`,
    xendit_settlement: {
      method: 'XENDIT_DISBURSEMENT_SIMULATED',
      status: 'COMPLETED',
      amount_idr: amountIdr - platformFee,
      merchant_receives: `Rp ${(amountIdr - platformFee).toLocaleString('id-ID')}`,
      note: 'Real: POST /api/disbursements → Xendit BI-FAST transfer to merchant bank',
    },
    idrx_api_test: {
      endpoint: 'GET /api/auth/get-bank-accounts',
      ...idrxApiTest,
      note: 'IDRX supports EVM chains only (Polygon/Base/BNB). Solana path uses Xendit.',
    },
    processing_steps: [
      { step: 1, label: 'QRIS_VALIDATED',       completed_at: new Date(Date.now()).toISOString() },
      { step: 2, label: 'QUOTE_READY',           completed_at: new Date(Date.now() + 200).toISOString() },
      { step: 3, label: 'TX_BUILT',              completed_at: new Date(Date.now() + 800).toISOString() },
      { step: 4, label: 'SIGNATURE_RECEIVED',    completed_at: new Date(Date.now() + 1600).toISOString() },
      { step: 5, label: 'ON_CHAIN_CONFIRMED',    completed_at: new Date(Date.now() + 3000).toISOString() },
      { step: 6, label: 'XENDIT_DISBURSED',      completed_at: new Date(Date.now() + 4500).toISOString() },
      { step: 7, label: 'SETTLEMENT_COMPLETE',   completed_at: new Date(Date.now() + 5000).toISOString() },
    ],
    completed_at: new Date(Date.now() + 5000).toISOString(),
  });
};
