// Server-signed real Solana TX for judge demo — no wallet popup, no Solflare security warning
// Requires env var: DEMO_KEYPAIR_B64 (base64 of 64-byte Solana keypair secret)
import { createPrivateKey, sign as nodeSign } from 'node:crypto';

const TREASURY_WALLET = 'ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m';

const SOLANA_RPCS = [
  'https://api.mainnet-beta.solana.com',
  'https://solana-mainnet.g.alchemy.com/v2/demo',
];

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Encode(bytes) {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let s = '';
  while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  let z = 0; for (const b of bytes) { if (b !== 0) break; z++; }
  return '1'.repeat(z) + s;
}

function base58Decode(s) {
  let n = 0n;
  for (const c of s) {
    const i = B58.indexOf(c);
    if (i < 0) throw new Error(`Bad base58 char: ${c}`);
    n = n * 58n + BigInt(i);
  }
  const bytes = [];
  while (n > 0n) { bytes.unshift(Number(n & 0xffn)); n >>= 8n; }
  let z = 0; for (const c of s) { if (c !== '1') break; z++; }
  return new Uint8Array([...new Array(z).fill(0), ...bytes]);
}

function cu16(n) {
  if (n <= 0x7f) return [n];
  if (n <= 0x3fff) return [0x80 | (n & 0x7f), n >> 7];
  return [0x80 | (n & 0x7f), 0x80 | ((n >> 7) & 0x7f), n >> 14];
}

function u64le(n) {
  const b = new Uint8Array(8);
  let v = BigInt(Math.round(n));
  for (let i = 0; i < 8; i++) { b[i] = Number(v & 0xffn); v >>= 8n; }
  return b;
}

async function rpc(method, params = []) {
  let lastErr;
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
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('All RPC endpoints failed');
}

function signEd25519(seed32, msgBytes) {
  // PKCS8 DER for Ed25519: fixed 16-byte header + 32-byte seed
  const header = Buffer.from('302e020100300506032b657004220420', 'hex');
  const pkcs8 = Buffer.concat([header, Buffer.from(seed32)]);
  const privKey = createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' });
  return new Uint8Array(nodeSign(null, Buffer.from(msgBytes), privKey));
}

async function buildSignBroadcast(seed32, pubkeyBytes32, toB58, lamports) {
  const bhr = await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }]);
  const blockhash = base58Decode(bhr.value.blockhash);

  const from = pubkeyBytes32;
  const to   = base58Decode(toB58);
  const sys  = new Uint8Array(32); // SystemProgram = all zeros

  // SystemProgram::Transfer: discriminant u32(2) + lamports u64
  const instrData = new Uint8Array([2, 0, 0, 0, ...u64le(lamports)]);

  const message = new Uint8Array([
    1, 0, 1,                             // header: 1 signer, 0 readonly-signed, 1 readonly-unsigned
    ...cu16(3),                          // 3 account keys
    ...from, ...to, ...sys,              // accounts
    ...blockhash,                        // recent blockhash
    ...cu16(1),                          // 1 instruction
    2,                                   // program index = SystemProgram (index 2)
    ...cu16(2), 0, 1,                    // 2 account indices: [0]=from, [1]=to
    ...cu16(instrData.length), ...instrData,
  ]);

  const sig = signEd25519(seed32, message);
  const tx  = new Uint8Array([...cu16(1), ...sig, ...message]);

  const txB64 = Buffer.from(tx).toString('base64');
  const signature = await rpc('sendTransaction', [
    txB64,
    { encoding: 'base64', preflightCommitment: 'confirmed', maxRetries: 3 },
  ]);
  return signature;
}

async function getSolIdrRate() {
  const JUPPRICE = 'https://lite-api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112';
  const BINANCE  = 'https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT';
  const FX       = 'https://open.er-api.com/v6/latest/USD';

  const [jupR, fxR] = await Promise.allSettled([
    fetch(JUPPRICE, { signal: AbortSignal.timeout(5000) }).then(r => r.json()),
    fetch(FX,       { signal: AbortSignal.timeout(5000) }).then(r => r.json()),
  ]);
  const priceUsd = jupR.value?.data?.So11111111111111111111111111111111111111112?.price;
  const usdIdr   = fxR.value?.rates?.IDR;
  if (priceUsd > 0 && usdIdr > 0) return priceUsd * usdIdr;

  const [binR, fxR2] = await Promise.allSettled([
    fetch(BINANCE, { signal: AbortSignal.timeout(5000) }).then(r => r.json()),
    fetch(FX,      { signal: AbortSignal.timeout(5000) }).then(r => r.json()),
  ]);
  const solUsd = Number(binR.value?.price);
  const idr2   = fxR2.value?.rates?.IDR;
  if (solUsd > 0 && idr2 > 0) return solUsd * idr2;

  throw new Error('SOL/IDR rate unavailable');
}

export default async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const keypairB64 = process.env.DEMO_KEYPAIR_B64;
  if (!keypairB64) {
    return res.status(503).json({
      error: 'DEMO_KEYPAIR_B64 not configured',
      setup: [
        '1. node -e "const {Keypair}=require(\'@solana/web3.js\');const kp=Keypair.generate();console.log(\'PUBKEY:\',kp.publicKey.toBase58());console.log(\'B64:\',Buffer.from(kp.secretKey).toString(\'base64\'))"',
        '2. Send 0.01 SOL to PUBKEY on mainnet',
        '3. Set Vercel env var  DEMO_KEYPAIR_B64=<B64 value>',
        '4. Redeploy',
      ],
    });
  }

  const amountIdr = Math.max(100, Number(req.body?.amount_idr || 1000));

  try {
    const secretBytes = Buffer.from(keypairB64, 'base64');
    if (secretBytes.length < 64) throw new Error('Keypair must be 64 bytes');

    const seed32   = secretBytes.slice(0, 32);
    const pubBytes = secretBytes.slice(32, 64);
    const fromB58  = base58Encode(pubBytes);

    const solIdr   = await getSolIdrRate();
    const lamports = Math.ceil((amountIdr * 1.005 / solIdr) * 1e9);
    if (lamports < 1) throw new Error('Computed lamports < 1');

    const signature = await buildSignBroadcast(seed32, pubBytes, TREASURY_WALLET, lamports);

    return res.status(200).json({
      ok: true,
      signature,
      explorer_url: `https://explorer.solana.com/tx/${signature}?cluster=mainnet-beta`,
      solscan_url:  `https://solscan.io/tx/${signature}`,
      from:         fromB58,
      to:           TREASURY_WALLET,
      lamports,
      sol_amount:   (lamports / 1e9).toFixed(8),
      amount_idr:   amountIdr,
      mode:         'SERVER_SIGNED_REAL_TX',
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};
