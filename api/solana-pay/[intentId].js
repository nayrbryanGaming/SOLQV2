import { createIntent, getIntent, updateIntent } from '../store.js';

// ── Constants ──────────────────────────────────────────────────────────────────
// Treasury wallet — receives SOL escrow from payer
const TREASURY_WALLET = 'ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m';

// Solana mainnet RPC endpoints (fallback chain — no dead/demo keys)
const SOLANA_RPCS = [
  'https://api.mainnet-beta.solana.com',
  'https://rpc.ankr.com/solana',
  'https://solana-rpc.publicnode.com',
];

// Jupiter price endpoint for SOL/IDR oracle (quote-only, no swap required)
const JUPITER_PRICE_URL =
  'https://lite-api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112';

// Fallback pricing sources
const COINGECKO_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=idr';
const BINANCE_URL =
  'https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT';
const FX_URL = 'https://open.er-api.com/v6/latest/USD';

// SOLQ platform fee
const FEE_BPS = 50; // 0.5%

// ── Base58 / Encoding helpers ─────────────────────────────────────────────────
const B58_CHARS = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Decode(s) {
  let n = 0n;
  for (const c of s) {
    const idx = B58_CHARS.indexOf(c);
    if (idx < 0) throw new Error(`Invalid base58 char: ${c}`);
    n = n * 58n + BigInt(idx);
  }
  const bytes = [];
  while (n > 0n) { bytes.unshift(Number(n & 0xffn)); n >>= 8n; }
  let zeros = 0;
  for (const c of s) { if (c !== '1') break; zeros++; }
  return new Uint8Array([...new Array(zeros).fill(0), ...bytes]);
}

function base64Encode(buf) {
  // Works in Node.js 18+
  return Buffer.from(buf).toString('base64');
}

function encodeCompactU16(n) {
  if (n <= 0x7F) return [n];
  if (n <= 0x3FFF) return [0x80 | (n & 0x7F), n >> 7];
  return [0x80 | (n & 0x7F), 0x80 | ((n >> 7) & 0x7F), n >> 14];
}

function encodeU64LE(n) {
  const b = new Uint8Array(8);
  let v = BigInt(Math.round(n));
  for (let i = 0; i < 8; i++) { b[i] = Number(v & 0xffn); v >>= 8n; }
  return b;
}

// ── Solana RPC helper ──────────────────────────────────────────────────────────
async function rpcCall(method, params = []) {
  for (const rpc of SOLANA_RPCS) {
    try {
      const res = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(6000),
      });
      const json = await res.json();
      if (json.result !== undefined) return json.result;
    } catch (_) { /* try next */ }
  }
  throw new Error('All Solana RPC endpoints failed');
}

// ── SOL/IDR price oracle (multi-source fallback) ───────────────────────────────
async function getSolIdrRate() {
  // 1. Jupiter price
  try {
    const res = await fetch(JUPITER_PRICE_URL, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const d = await res.json();
      const priceUsd = d?.data?.So11111111111111111111111111111111111111112?.price;
      if (priceUsd > 0) {
        // Get USD/IDR FX
        const fx = await fetch(FX_URL, { signal: AbortSignal.timeout(5000) });
        if (fx.ok) {
          const fxd = await fx.json();
          const usdIdr = fxd?.rates?.IDR;
          if (usdIdr > 0) return priceUsd * usdIdr;
        }
      }
    }
  } catch (_) {}

  // 2. CoinGecko
  try {
    const res = await fetch(COINGECKO_URL, { signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const d = await res.json();
      const rate = d?.solana?.idr;
      if (rate > 0) return rate;
    }
  } catch (_) {}

  // 3. Binance + FX
  try {
    const [binRes, fxRes] = await Promise.all([
      fetch(BINANCE_URL, { signal: AbortSignal.timeout(5000) }),
      fetch(FX_URL, { signal: AbortSignal.timeout(5000) }),
    ]);
    if (binRes.ok && fxRes.ok) {
      const [bin, fx] = await Promise.all([binRes.json(), fxRes.json()]);
      const solUsd = Number(bin?.price);
      const usdIdr = fx?.rates?.IDR;
      if (solUsd > 0 && usdIdr > 0) return solUsd * usdIdr;
    }
  } catch (_) {}

  throw new Error('SOL/IDR price oracle failed');
}

// ── Build Solana legacy SOL-transfer transaction (no external libs needed) ─────
async function buildSolTransferTx(fromPubkeyB58, toPubkeyB58, lamports) {
  // 1. Get recent blockhash
  const blockhashResult = await rpcCall('getLatestBlockhash', [{ commitment: 'confirmed' }]);
  const blockhashB58 = blockhashResult?.value?.blockhash;
  if (!blockhashB58) throw new Error('Could not get blockhash from Solana RPC');

  // 2. Decode keys (32 bytes each)
  const fromKey   = base58Decode(fromPubkeyB58);  // payer & signer
  const toKey     = base58Decode(toPubkeyB58);    // recipient
  const sysProgKey = new Uint8Array(32);           // SystemProgram = all zeros
  const blockhash  = base58Decode(blockhashB58);

  // 3. SystemProgram::Transfer instruction data
  //    discriminant = 2 (transfer), followed by lamports as u64 LE
  const instrData = new Uint8Array([2, 0, 0, 0, ...encodeU64LE(lamports)]);

  // 4. Assemble message
  //    Header: [numRequiredSignatures=1, numReadonlySignedAccounts=0, numReadonlyUnsignedAccounts=1]
  const header = new Uint8Array([1, 0, 1]);

  // Account keys: from (signer+writable), to (writable), SystemProgram (readonly unsigned)
  const accountKeys = new Uint8Array([...fromKey, ...toKey, ...sysProgKey]);

  // Single instruction: SystemProgram at index 2, accounts [0=from, 1=to]
  const instruction = new Uint8Array([
    2,                              // program_id_index (SystemProgram)
    ...encodeCompactU16(2),         // 2 accounts
    0, 1,                           // account indices: from, to
    ...encodeCompactU16(instrData.length),
    ...instrData,
  ]);

  const message = new Uint8Array([
    ...header,
    ...encodeCompactU16(3),         // 3 account keys
    ...accountKeys,
    ...blockhash,                   // recent blockhash
    ...encodeCompactU16(1),         // 1 instruction
    ...instruction,
  ]);

  // 5. Full transaction: [num_signatures=1] + [64 zero bytes] + message
  //    The wallet replaces the 64 zero bytes with the real signature
  const tx = new Uint8Array([
    ...encodeCompactU16(1),
    ...new Uint8Array(64),          // placeholder signature
    ...message,
  ]);

  return base64Encode(tx);
}

// ── Public key validator ───────────────────────────────────────────────────────
function isValidPubkey(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length < 32 || trimmed.length > 44) return false;
  return /^[1-9A-HJ-NP-Za-km-z]+$/.test(trimmed);
}

// ── Main handler ───────────────────────────────────────────────────────────────
export default async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  // Extract intentId
  let intentId = '';
  try {
    const host = req.headers?.host || 'solq.vercel.app';
    const url  = new URL(req.url || '/', `https://${host}`);
    intentId   = String(
      url.searchParams.get('intentId') || url.searchParams.get('id') || '',
    ).trim();
    if (!intentId) {
      const seg = url.pathname.split('/').filter(Boolean);
      const idx = seg.indexOf('solana-pay');
      if (idx >= 0 && seg.length > idx + 1) intentId = String(seg[idx + 1] || '').trim();
    }
  } catch (_) { intentId = ''; }

  const persistenceReady = Boolean(
    process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN,
  );

  if (!intentId) return res.status(400).json({ error: 'Missing intentId' });

  const intent = await getIntent(intentId);

  // ── GET: Solana Pay label ──────────────────────────────────────────────────
  if (req.method === 'GET') {
    return res.status(200).json({
      label:         'SOLQ — Solana × QRIS',
      icon:          'https://solq.vercel.app/favicon.png',
      message:       `Bayar QRIS via SOLQ: ${intentId}`,
      reference:     intentId,
      amount_idr:    intent?.amount_details?.fiat_amount ?? null,
      merchant_name: intent?.merchant?.name ?? 'UNKNOWN MERCHANT',
      merchant_id:   intent?.merchant_id ?? intent?.nmid ?? intent?.merchant?.id ?? null,
      nmid:          intent?.nmid ?? intent?.merchant_id ?? intent?.merchant?.id ?? null,
      persistence_ready: persistenceReady,
    });
  }

  // ── POST: Build SOL-transfer transaction ───────────────────────────────────
  if (req.method === 'POST') {
    const account = String(req.body?.account || '').trim();
    if (!account) return res.status(400).json({ error: 'Missing account' });
    if (!isValidPubkey(account)) return res.status(400).json({ error: 'Invalid account format' });

    // Resolve / create ephemeral intent
    let liveIntent = intent;
    if (!liveIntent) {
      const merchantName    = String(req.body?.merchant_name || '').trim() || 'UNKNOWN MERCHANT';
      const merchantId      = String(req.body?.merchant_id || req.body?.nmid || '').trim() || null;
      const merchantAccount = String(req.body?.merchant_account || '').trim() || null;
      const bankCode        = String(req.body?.bank_code || '').trim().toUpperCase() || 'UNKNOWN';
      const currencySource  = String(req.body?.currency_source || 'IDRX').trim().toUpperCase();
      const parsedAmount    = Number.parseFloat(String(req.body?.amount_idr ?? '0'));
      const amountIdr       = Number.isFinite(parsedAmount) && parsedAmount >= 0 ? parsedAmount : 0;

      liveIntent = await createIntent({
        id: intentId,
        status: 'CREATED',
        merchant: { name: merchantName, id: merchantId, city: 'UNKNOWN', pan: merchantAccount },
        amount_details: { fiat_amount: amountIdr, currency_source: currencySource, crypto_amount: null, quote_id: null, rate: null },
        merchant_id: merchantId,
        merchant_account: merchantAccount,
        nmid: merchantId || merchantAccount,
        bank_code: bankCode,
      });
    }

    await updateIntent(intentId, { status: 'AUTHORIZATION_REQUESTED', payer_account: account });

    const rawAmount = liveIntent?.amount_details?.fiat_amount
      ?? Number.parseFloat(String(req.body?.amount_idr ?? '0'));
    const amountIdr = Number.isFinite(rawAmount) && rawAmount > 0 ? rawAmount : 0;

    // Build SOL-transfer transaction
    let transaction   = null;
    let solInLamports = null;
    let solIdrRate    = null;
    let buildError    = null;

    if (amountIdr > 0) {
      try {
        // Get SOL/IDR rate
        solIdrRate = await getSolIdrRate();
        if (!solIdrRate || solIdrRate <= 0) throw new Error('Invalid SOL/IDR rate');

        // Calculate SOL needed = (amountIdr + 0.5% fee) / solIdr rate
        const feeFactor = 1 + FEE_BPS / 10000;
        const solAmount = (amountIdr * feeFactor) / solIdrRate;
        solInLamports   = Math.ceil(solAmount * 1e9); // convert SOL → lamports

        // Build transaction: user sends SOL escrow to treasury
        transaction = await buildSolTransferTx(account, TREASURY_WALLET, solInLamports);
      } catch (err) {
        buildError = String(err?.message || err);
      }
    } else {
      buildError = 'Amount IDR tidak diketahui — perlu input manual';
    }

    return res.status(200).json({
      transaction,
      mode:            transaction ? 'SOL_TRANSFER' : 'DEEPLINK_FALLBACK',
      message: transaction
        ? `SOL transfer siap: ${(solInLamports / 1e9).toFixed(6)} SOL → treasury`
        : `Transaction tidak tersedia: ${buildError}`,
      intent_id:        intentId,
      payer_account:    account,
      amount_idr:       amountIdr || null,
      sol_in_lamports:  solInLamports,
      sol_idr_rate:     solIdrRate,
      merchant_name:    liveIntent?.merchant?.name ?? 'UNKNOWN MERCHANT',
      merchant_id:      liveIntent?.merchant_id ?? liveIntent?.nmid ?? liveIntent?.merchant?.id ?? null,
      nmid:             liveIntent?.nmid ?? liveIntent?.merchant_id ?? liveIntent?.merchant?.id ?? null,
      merchant_account: liveIntent?.merchant_account ?? null,
      persistence_ready: persistenceReady,
      warning:          !transaction ? buildError : null,
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
