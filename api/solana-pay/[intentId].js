import { createIntent, getIntent, updateIntent } from '../store.js';

// ── Constants ──────────────────────────────────────────────────────────────────
const SOL_MINT  = 'So11111111111111111111111111111111111111112';
const IDRX_MINT = 'idrxZcP8xiKkYk6XGD4uz1dxEYCWSgKDHqgjsBbwDur';

// Treasury IDRX ATA — receives swap output and platform fee
const TREASURY_IDRX_ATA = 'DqjBhjX9tFzMy9zYXwepXW8GNuqfuDCJ4J7sX1C78p6g';

const PLATFORM_FEE_BPS = 50; // 0.5% SOLQ revenue
const SLIPPAGE_BPS     = 50; // 0.5% slippage protection

const JUPITER_QUOTE_URL = 'https://lite-api.jup.ag/swap/v1/quote';
const JUPITER_SWAP_URL  = 'https://lite-api.jup.ag/swap/v1/swap';

// ── Helpers ────────────────────────────────────────────────────────────────────
function isValidPubkey(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length < 32 || trimmed.length > 44) return false;
  return /^[1-9A-HJ-NP-Za-km-z]+$/.test(trimmed);
}

/**
 * Build a Jupiter SOL→IDRX swap transaction (ExactOut).
 * Returns base64-encoded VersionedTransaction ready for wallet signing.
 */
async function buildJupiterSwapTx(amountIdr, userPublicKey) {
  const amountAtomic = Math.round(Number(amountIdr) * 100); // IDRX has 2 decimals
  if (!Number.isFinite(amountAtomic) || amountAtomic <= 0) {
    throw new Error('Amount IDR tidak valid');
  }

  // 1. Get Jupiter quote: SOL → IDRX, ExactOut
  const quoteUrl =
    `${JUPITER_QUOTE_URL}` +
    `?inputMint=${SOL_MINT}` +
    `&outputMint=${IDRX_MINT}` +
    `&amount=${amountAtomic}` +
    `&swapMode=ExactOut` +
    `&slippageBps=${SLIPPAGE_BPS}` +
    `&platformFeeBps=${PLATFORM_FEE_BPS}` +
    `&onlyDirectRoutes=false`;

  const quoteRes = await fetch(quoteUrl, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });

  if (!quoteRes.ok) {
    throw new Error(`Jupiter quote HTTP ${quoteRes.status}`);
  }

  const quote = await quoteRes.json();
  if (quote.error) throw new Error(`Jupiter: ${quote.error}`);
  if (!quote.outAmount || !quote.inAmount) {
    throw new Error('Jupiter: no route available for SOL→IDRX');
  }

  // 2. Build unsigned swap transaction via Jupiter
  const swapRes = await fetch(JUPITER_SWAP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey,
      wrapAndUnwrapSol: true,
      feeAccount: TREASURY_IDRX_ATA,          // 0.5% platform fee → treasury
      destinationTokenAccount: TREASURY_IDRX_ATA, // IDRX output → escrow
      dynamicComputeUnitLimit: true,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!swapRes.ok) {
    throw new Error(`Jupiter swap HTTP ${swapRes.status}`);
  }

  const swapData = await swapRes.json();
  if (!swapData.swapTransaction) {
    throw new Error('Jupiter: swapTransaction kosong dalam respons');
  }

  return {
    transaction: swapData.swapTransaction, // base64 VersionedTransaction
    inAmount:    quote.inAmount,           // SOL lamports user will spend
    outAmount:   quote.outAmount,          // IDRX atomic units received
    quote,
  };
}

// ── Handler ────────────────────────────────────────────────────────────────────
export default async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // ── Extract intentId from path/query ──────────────────────────────────────
  let intentId = '';
  try {
    const host = req.headers?.host || 'solq.vercel.app';
    const url  = new URL(req.url || '/', `https://${host}`);
    intentId   = String(
      url.searchParams.get('intentId') || url.searchParams.get('id') || '',
    ).trim();

    if (!intentId) {
      const segments      = url.pathname.split('/').filter(Boolean);
      const solanaPayIdx  = segments.indexOf('solana-pay');
      if (solanaPayIdx >= 0 && segments.length > solanaPayIdx + 1) {
        intentId = String(segments[solanaPayIdx + 1] || '').trim();
      }
    }
  } catch (_) {
    intentId = '';
  }

  const persistenceReady = Boolean(
    process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN,
  );

  if (!intentId) {
    return res.status(400).json({ error: 'Missing intentId' });
  }

  const intent = await getIntent(intentId);

  // ── GET: Solana Pay label/info ─────────────────────────────────────────────
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

  // ── POST: Build and return swap transaction ────────────────────────────────
  if (req.method === 'POST') {
    const account = String(req.body?.account || '').trim();
    if (!account) {
      return res.status(400).json({ error: 'Missing account' });
    }
    if (!isValidPubkey(account)) {
      return res.status(400).json({ error: 'Invalid account format' });
    }

    // Resolve or create ephemeral intent
    let liveIntent = intent;
    if (!liveIntent) {
      const merchantName    = String(req.body?.merchant_name || '').trim() || 'UNKNOWN MERCHANT';
      const merchantId      = String(req.body?.merchant_id || req.body?.nmid || '').trim() || null;
      const merchantAccount = String(req.body?.merchant_account || '').trim() || null;
      const bankCode        = String(req.body?.bank_code || '').trim().toUpperCase() || 'UNKNOWN';
      const currencySource  = String(req.body?.currency_source || 'IDRX').trim().toUpperCase() || 'IDRX';
      const parsedAmount    = Number.parseFloat(String(req.body?.amount_idr ?? '0'));
      const amountIdr       = Number.isFinite(parsedAmount) && parsedAmount >= 0 ? parsedAmount : 0;

      liveIntent = await createIntent({
        id: intentId,
        status: 'CREATED',
        merchant: {
          name: merchantName,
          id:   merchantId,
          city: 'UNKNOWN',
          pan:  merchantAccount,
        },
        amount_details: {
          fiat_amount:     amountIdr,
          currency_source: currencySource,
          crypto_amount:   null,
          quote_id:        null,
          rate:            null,
        },
        merchant_id:      merchantId,
        merchant_account: merchantAccount,
        nmid:             merchantId || merchantAccount,
        bank_code:        bankCode,
      });
    }

    await updateIntent(intentId, {
      status:       'AUTHORIZATION_REQUESTED',
      payer_account: account,
    });

    // Resolve amount from intent or request body
    const rawAmount = liveIntent?.amount_details?.fiat_amount
      ?? Number.parseFloat(String(req.body?.amount_idr ?? '0'));
    const amountIdr = Number.isFinite(rawAmount) && rawAmount > 0 ? rawAmount : 0;

    // Build real Jupiter swap transaction
    let transaction  = null;
    let txInAmount   = null;
    let txOutAmount  = null;
    let jupiterError = null;
    let mode         = 'DEEPLINK_FALLBACK';

    if (amountIdr > 0) {
      try {
        const result = await buildJupiterSwapTx(amountIdr, account);
        transaction = result.transaction;
        txInAmount  = result.inAmount;
        txOutAmount = result.outAmount;
        mode        = 'JUPITER_SWAP';
      } catch (err) {
        jupiterError = String(err?.message || err);
      }
    } else {
      jupiterError = 'Amount IDR tidak diketahui — perlu input manual';
    }

    return res.status(200).json({
      transaction,
      mode,
      message: transaction
        ? 'SOL→IDRX swap transaction siap untuk ditandatangani'
        : `Transaction tidak tersedia: ${jupiterError}`,
      intent_id:        intentId,
      payer_account:    account,
      amount_idr:       amountIdr || null,
      sol_in_lamports:  txInAmount,
      idrx_out_atomic:  txOutAmount,
      merchant_name:    liveIntent?.merchant?.name ?? 'UNKNOWN MERCHANT',
      merchant_id:      liveIntent?.merchant_id ?? liveIntent?.nmid ?? liveIntent?.merchant?.id ?? null,
      nmid:             liveIntent?.nmid ?? liveIntent?.merchant_id ?? liveIntent?.merchant?.id ?? null,
      merchant_account: liveIntent?.merchant_account ?? null,
      persistence_ready: persistenceReady,
      warning: !transaction
        ? (jupiterError || 'Lanjutkan via wallet deep link')
        : null,
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
