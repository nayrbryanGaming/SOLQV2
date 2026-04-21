import {
  createIntent,
  getIntent,
  confirmIntent,
  updateIntent,
  paymentIntents,
} from '../store.js';
import {
  fetchTransactionFacts,
  isValidSolanaSignature,
  verifyFinalizedSignature,
} from '../utils/solana.js';

function normalizeStringField(value, fallback = null) {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function parseAmountField(value) {
  const parsed = Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

function parseContextBlob(raw) {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return null;
  }

  const candidates = [raw];
  try {
    candidates.push(decodeURIComponent(raw));
  } catch (_) {
    // keep raw-only
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    } catch (_) {
      // try next candidate
    }
  }

  return null;
}

function parseRequestUrl(req) {
  try {
    const host = req.headers?.host || 'solq.vercel.app';
    const url = new URL(req.url || '/', `https://${host}`);
    const query = {};
    url.searchParams.forEach((value, key) => {
      query[key] = value;
    });
    return {
      pathname: url.pathname,
      query,
    };
  } catch (_) {
    return {
      pathname: '/',
      query: {},
    };
  }
}

function buildFallbackContext(query, headerContextRaw) {
  const headerContext = parseContextBlob(headerContextRaw);
  const queryContext = parseContextBlob(query.context);

  const merged = {
    ...(headerContext || {}),
    ...(queryContext || {}),
    ...query,
  };

  const merchantName = normalizeStringField(merged.merchant_name, 'UNKNOWN MERCHANT');
  const merchantId = normalizeStringField(merged.merchant_id || merged.nmid, null);
  const merchantAccount = normalizeStringField(merged.merchant_account, null);
  const payerAccount = normalizeStringField(merged.payer_account, null);
  const bankCode = normalizeStringField(merged.bank_code, 'UNKNOWN');
  const currencySource = normalizeStringField(
    String(merged.currency_source || '').toUpperCase(),
    'IDRX',
  );
  const amountIdr = parseAmountField(merged.amount_idr);

  const hasContext = Boolean(
    merchantName !== 'UNKNOWN MERCHANT' || merchantId || merchantAccount || payerAccount || amountIdr > 0,
  );

  return {
    hasContext,
    merchantName,
    merchantId,
    merchantAccount,
    payerAccount,
    bankCode,
    amountIdr,
    currencySource,
  };
}

function buildBodyRecoveryContext(body) {
  const merchantName = normalizeStringField(body?.merchant_name, 'UNKNOWN MERCHANT');
  const merchantId = normalizeStringField(body?.merchant_id || body?.nmid, null);
  const merchantAccount = normalizeStringField(body?.merchant_account, null);
  const payerAccount = normalizeStringField(body?.payer_account, null);
  const bankCode = normalizeStringField(body?.bank_code, 'UNKNOWN');
  const currencySource = normalizeStringField(
    String(body?.currency_source || '').toUpperCase(),
    'IDRX',
  );
  const amountIdr = parseAmountField(body?.amount_idr);

  return {
    hasContext: Boolean(
      merchantName !== 'UNKNOWN MERCHANT' ||
        merchantId ||
        merchantAccount ||
        payerAccount ||
        amountIdr > 0,
    ),
    merchantName,
    merchantId,
    merchantAccount,
    payerAccount,
    bankCode,
    currencySource,
    amountIdr,
  };
}

export default async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const requestUrl = parseRequestUrl(req);
  const query = requestUrl.query || {};
  let intentId = String(query.id || query.intentId || '').trim();
  if (!intentId) {
    const segments = String(requestUrl.pathname || '/').split('/').filter(Boolean);
    const paymentIndex = segments.indexOf('payment-intents');
    if (paymentIndex >= 0 && segments.length > paymentIndex + 1) {
      intentId = String(segments[paymentIndex + 1] || '').trim();
    } else if (segments.length >= 3 && segments[0] === 'api' && segments[1] === 'v1') {
      intentId = String(segments[2] || '').trim();
    }
  }

  if (intentId.includes('&')) {
    intentId = intentId.split('&')[0].trim();
  }
  const persistenceReady = Boolean(
    process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN,
  );

  if (!intentId) {
    return res.status(400).json({ error: 'Intent ID required' });
  }

  if (req.method === 'GET') {
    const intent = await getIntent(intentId);
    if (!intent) {
      const fallback = buildFallbackContext(
        query,
        req.headers?.['x-solq-context'],
      );

      if (!fallback.hasContext) {
        return res.status(404).json({
          error: 'Intent not found',
          intent_id: intentId,
          persistence_ready: persistenceReady,
          warning: persistenceReady
            ? null
            : 'Intent state tidak persisten antar serverless invocation. Set KV_REST_API_URL + KV_REST_API_TOKEN untuk persistence lintas request.',
          status_source: 'not_found',
        });
      }

      const fallbackStatus = fallback.payerAccount
        ? 'AUTHORIZATION_REQUESTED'
        : 'CREATED';

      return res.status(200).json({
        id: intentId,
        status: fallbackStatus,
        merchant: {
          name: fallback.merchantName,
          id: fallback.merchantId,
          city: 'UNKNOWN',
          pan: fallback.merchantAccount,
        },
        amount_details: {
          fiat_amount: fallback.amountIdr,
          currency_source: fallback.currencySource,
          crypto_amount: null,
          quote_id: null,
          rate: null,
        },
        merchant_id: fallback.merchantId,
        merchant_account: fallback.merchantAccount,
        nmid: fallback.merchantId || fallback.merchantAccount,
        bank_code: fallback.bankCode,
        payer_account: fallback.payerAccount,
        persistence_ready: persistenceReady,
        warning: persistenceReady
          ? null
          : 'Intent not found in current serverless instance. Configure KV_REST_API_URL and KV_REST_API_TOKEN for cross-invocation persistence.',
        status_source: fallback.hasContext
          ? 'stateless_context_fallback'
          : 'stateless_fallback',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    res.status(200).json(intent);
  } else if (req.method === 'POST') {
    try {
      const txHash = String(req.body?.tx_hash || '').trim();
      const payerAccount = String(req.body?.payer_account || '').trim() || null;
      const recoveryContext = buildBodyRecoveryContext(req.body || {});

      if (!txHash) {
        return res.status(400).json({ error: 'tx_hash required' });
      }

      if (!isValidSolanaSignature(txHash)) {
        return res.status(400).json({
          status: 'FAILED',
          message: 'Invalid tx_hash format',
        });
      }

      let existing = await getIntent(intentId);
      if (!existing) {
        existing = await createIntent({
          id: intentId,
          status: 'CREATED',
          merchant: {
            name: recoveryContext.merchantName,
            id: recoveryContext.merchantId,
            city: 'UNKNOWN',
            pan: recoveryContext.merchantAccount,
          },
          amount_details: {
            fiat_amount: recoveryContext.amountIdr,
            currency_source: recoveryContext.currencySource,
            crypto_amount: null,
            quote_id: null,
            rate: null,
          },
          merchant_id: recoveryContext.merchantId,
          merchant_account: recoveryContext.merchantAccount,
          nmid: recoveryContext.merchantId || recoveryContext.merchantAccount,
          bank_code: recoveryContext.bankCode,
          payer_account: recoveryContext.payerAccount,
          recovered_from_confirm: recoveryContext.hasContext,
        });
      }

      if (existing.txHash && existing.txHash === txHash) {
        return res.status(200).json({
          ...existing,
          message: 'Idempotent confirm accepted',
          txHash: existing.txHash,
          explorer: `https://explorer.solana.com/tx/${existing.txHash}?cluster=mainnet-beta`,
        });
      }

      const replayIntent = Object.values(paymentIntents).find(
        (intent) => intent && intent.id !== intentId && intent.txHash === txHash,
      );
      if (replayIntent) {
        return res.status(400).json({
          status: 'FAILED',
          message: 'Replay blocked: signature already used by another intent',
          txHash,
          conflicting_intent: replayIntent.id,
          explorer: `https://explorer.solana.com/tx/${txHash}?cluster=mainnet-beta`,
        });
      }

      const verification = await verifyFinalizedSignature(txHash);
      if (!verification.ok) {
        const failed = await updateIntent(intentId, {
          status: 'FAILED',
          txHash,
          tx_hash: txHash,
          payer_account: payerAccount || existing.payer_account || null,
        });

        return res.status(400).json({
          status: 'FAILED',
          message: `On-chain verification failed: ${verification.reason}`,
          txHash,
          explorer: `https://explorer.solana.com/tx/${txHash}?cluster=mainnet-beta`,
          intent: failed,
        });
      }

      const facts = await fetchTransactionFacts(txHash);
      if (!facts.ok) {
        return res.status(400).json({
          status: 'FAILED',
          message: `Finalized transaction details unavailable: ${facts.reason}`,
          txHash,
          explorer: `https://explorer.solana.com/tx/${txHash}?cluster=mainnet-beta`,
        });
      }

      const deltas = Array.isArray(facts.tokenDeltas) ? facts.tokenDeltas : [];
      const positiveDeltas = deltas.filter((row) => {
        const amount = BigInt(row.deltaAtomic || '0');
        return amount > 0n;
      });

      if (positiveDeltas.length === 0) {
        return res.status(400).json({
          status: 'FAILED',
          message: 'No positive token transfer detected for this signature',
          txHash,
          explorer: `https://explorer.solana.com/tx/${txHash}?cluster=mainnet-beta`,
        });
      }

      if (existing.expected_token_mint) {
        const mintMatched = positiveDeltas.some(
          (row) => row.mint === existing.expected_token_mint,
        );
        if (!mintMatched) {
          return res.status(400).json({
            status: 'FAILED',
            message: 'Expected token mint mismatch',
            expected_mint: existing.expected_token_mint,
            txHash,
            explorer: `https://explorer.solana.com/tx/${txHash}?cluster=mainnet-beta`,
          });
        }
      }

      if (existing.expected_recipient_owner) {
        const ownerMatched = positiveDeltas.some(
          (row) => row.owner === existing.expected_recipient_owner,
        );
        if (!ownerMatched) {
          return res.status(400).json({
            status: 'FAILED',
            message: 'Expected recipient owner mismatch',
            expected_owner: existing.expected_recipient_owner,
            txHash,
            explorer: `https://explorer.solana.com/tx/${txHash}?cluster=mainnet-beta`,
          });
        }
      }

      if (existing.expected_min_atomic) {
        const minAtomic = BigInt(String(existing.expected_min_atomic));
        const maxDelta = positiveDeltas.reduce((max, row) => {
          const val = BigInt(row.deltaAtomic || '0');
          return val > max ? val : max;
        }, 0n);
        if (maxDelta < minAtomic) {
          return res.status(400).json({
            status: 'FAILED',
            message: 'Transferred amount below minimum expected amount',
            expected_min_atomic: String(minAtomic),
            received_atomic: String(maxDelta),
            txHash,
            explorer: `https://explorer.solana.com/tx/${txHash}?cluster=mainnet-beta`,
          });
        }
      }

      const onChainPayer = facts.payer;
      const payerMismatchWarning =
        payerAccount && onChainPayer && payerAccount !== onChainPayer
          ? {
              callback_payer: payerAccount,
              onchain_payer: onChainPayer,
              message:
                'Callback payer differs from finalized on-chain signer. Canonical payer set to on-chain signer.',
            }
          : null;

      const canonicalPayer = onChainPayer || payerAccount || existing.payer_account || null;
      const intent = await confirmIntent(intentId, txHash, canonicalPayer);
      res.status(200).json({
        ...intent,
        status: 'COMPLETED',
        txHash,
        payer_account: canonicalPayer,
        explorer: `https://explorer.solana.com/tx/${txHash}?cluster=mainnet-beta`,
        verification,
        transaction_facts: {
          rpc: facts.rpc,
          slot: facts.slot,
          blockTime: facts.blockTime,
          payer: onChainPayer,
          token_deltas: facts.tokenDeltas,
        },
        payer_warning: payerMismatchWarning,
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
};
