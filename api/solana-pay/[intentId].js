import { createIntent, getIntent, updateIntent } from '../store.js';

function isValidPubkey(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length < 32 || trimmed.length > 44) return false;
  return /^[1-9A-HJ-NP-Za-km-z]+$/.test(trimmed);
}

export default async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  let intentId = '';
  try {
    const host = req.headers?.host || 'solq.vercel.app';
    const url = new URL(req.url || '/', `https://${host}`);
    intentId = String(
      url.searchParams.get('intentId') || url.searchParams.get('id') || '',
    ).trim();

    if (!intentId) {
      const segments = url.pathname.split('/').filter(Boolean);
      const solanaPayIndex = segments.indexOf('solana-pay');
      if (solanaPayIndex >= 0 && segments.length > solanaPayIndex + 1) {
        intentId = String(segments[solanaPayIndex + 1] || '').trim();
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

  if (req.method === 'GET') {
    return res.status(200).json({
      label: 'SOLQ',
      icon: 'https://solq.vercel.app/favicon.png',
      message: `SOLQ Payment Intent: ${intentId}`,
      reference: intentId,
      amount_idr: intent?.amount_details?.fiat_amount ?? null,
      merchant_name: intent?.merchant?.name ?? 'UNKNOWN MERCHANT',
      merchant_id: intent?.merchant_id ?? intent?.nmid ?? intent?.merchant?.id ?? null,
      nmid: intent?.nmid ?? intent?.merchant_id ?? intent?.merchant?.id ?? null,
      persistence_ready: persistenceReady,
      warning: persistenceReady
        ? null
        : 'Intent state may not persist across serverless invocations. Configure KV_REST_API_URL and KV_REST_API_TOKEN.',
    });
  }

  if (req.method === 'POST') {
    const account = String(req.body?.account || '').trim();
    if (!account) {
      return res.status(400).json({ error: 'Missing account' });
    }
    if (!isValidPubkey(account)) {
      return res.status(400).json({ error: 'Invalid account format' });
    }

    let liveIntent = intent;
    if (!liveIntent) {
      const merchantName =
        String(req.body?.merchant_name || '').trim() || 'UNKNOWN MERCHANT';
      const merchantId =
        String(req.body?.merchant_id || req.body?.nmid || '').trim() || null;
      const merchantAccount =
        String(req.body?.merchant_account || '').trim() || null;
      const bankCode =
        String(req.body?.bank_code || '').trim().toUpperCase() || 'UNKNOWN';
      const currencySource =
        String(req.body?.currency_source || 'IDRX').trim().toUpperCase() ||
        'IDRX';
      const parsedAmount = Number.parseFloat(String(req.body?.amount_idr ?? '0'));
      const amountIdr = Number.isFinite(parsedAmount) && parsedAmount >= 0
        ? parsedAmount
        : 0;

      liveIntent = await createIntent({
        id: intentId,
        status: 'CREATED',
        merchant: {
          name: merchantName,
          id: merchantId,
          city: 'UNKNOWN',
          pan: merchantAccount,
        },
        amount_details: {
          fiat_amount: amountIdr,
          currency_source: currencySource,
          crypto_amount: null,
          quote_id: null,
          rate: null,
        },
        merchant_id: merchantId,
        merchant_account: merchantAccount,
        nmid: merchantId || merchantAccount,
        bank_code: bankCode,
      });
    }

    const updated = await updateIntent(intentId, {
      status: 'AUTHORIZATION_REQUESTED',
      payer_account: account,
    });
    const responseIntent = updated || liveIntent;

    // Serverless endpoint does not hold private keys and does not assemble
    // custodial transactions here. Client should continue with wallet deep link.
    return res.status(200).json({
      transaction: null,
      mode: 'DEEPLINK_FALLBACK',
      message: 'Direct transaction payload unavailable on this endpoint. Continue in wallet deep link flow.',
      intent_id: intentId,
      payer_account: account,
      amount_idr: responseIntent?.amount_details?.fiat_amount ?? null,
      merchant_name: responseIntent?.merchant?.name ?? 'UNKNOWN MERCHANT',
      merchant_id: responseIntent?.merchant_id ?? responseIntent?.nmid ?? responseIntent?.merchant?.id ?? null,
      nmid: responseIntent?.nmid ?? responseIntent?.merchant_id ?? responseIntent?.merchant?.id ?? null,
      merchant_account: responseIntent?.merchant_account ?? null,
      persistence_ready: persistenceReady,
      warning: persistenceReady
        ? null
        : 'Intent state may not persist across serverless invocations. Configure KV_REST_API_URL and KV_REST_API_TOKEN.',
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
