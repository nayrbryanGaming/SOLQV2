import { getInventoryStatus, disburseFromInventory, mapBankCode } from './utils/idrx-evm.js';
import { paymentIntents, updateIntent, getMerchant } from './store.js';

export default async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const persistenceReady = Boolean(
    process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN,
  );

  // Inventory status surfaces whether the platform's IDRX/MATIC inventory on
  // Polygon is healthy. ?inventory=1 enables it (extra RPC roundtrip per call).
  const wantsInventory = req.query?.inventory === '1' || req.url?.includes('inventory=1');
  const wantsRetry = req.query?.retry === '1' || req.url?.includes('retry=1');
  let inventory = wantsInventory || wantsRetry ? await getInventoryStatus() : null;

  // Auto-retry: scan in-memory paymentIntents for SETTLEMENT_PENDING and retry
  // disbursement. Safe to call from anywhere — disburseFromInventory is idempotent
  // at the intent level (we check burn_tx_hash first). Stays scoped to one Vercel
  // function instance unless KV is enabled. Returns per-intent results so the
  // caller can verify what drained.
  let retried = null;
  if (wantsRetry) {
    if (!inventory?.ok || inventory.idrxBalance === 0) {
      retried = { skipped: true, reason: 'INVENTORY_EMPTY_OR_RPC_DOWN', inventory };
    } else {
      const pending = Object.values(paymentIntents).filter(
        (p) => p && p.settlement_status === 'SETTLEMENT_PENDING' && !p.burn_tx_hash,
      );
      const results = [];
      for (const intent of pending.slice(0, 20)) {
        const amountIdr = Number(intent.amount_details?.fiat_amount || intent.amount_idr || 0);
        if (amountIdr < 20000) {
          results.push({ id: intent.id, skipped: 'BELOW_IDRX_MIN', amount: amountIdr });
          continue;
        }
        const intentNmid = intent.nmid ?? intent.merchant_id ?? intent.merchant?.id ?? null;
        const registered = intentNmid ? await getMerchant(intentNmid) : null;
        const bankAccount = registered?.bank_account ?? intent.merchant_account ?? intent.merchant?.pan ?? null;
        const bankCode = registered?.bank_code ?? intent.bank_code ?? null;
        if (!bankAccount || !mapBankCode(bankCode)) {
          results.push({ id: intent.id, skipped: 'MISSING_MERCHANT_OR_BANK' });
          continue;
        }
        const r = await disburseFromInventory({
          amountIdr,
          bankCode,
          bankAccount,
          bankAccountName: registered?.account_name ?? intent.merchant?.name ?? 'QRIS Merchant',
          bankName: mapBankCode(bankCode),
        });
        if (r.status === 'DISBURSED') {
          await updateIntent(intent.id, {
            settlement_status: 'DISBURSED',
            burn_tx_hash: r.burnTxHash,
            burn_explorer: r.burnExplorer,
            idrx_redeem_response: r.redeem,
          });
          results.push({ id: intent.id, status: 'DISBURSED', burn: r.burnTxHash });
        } else {
          results.push({ id: intent.id, status: r.status });
        }
      }
      retried = { scanned: pending.length, attempted: Math.min(pending.length, 20), results };
    }
  }

  const envFlags = {
    idrx_creds: Boolean(process.env.IDRX_API_KEY && process.env.IDRX_SECRET_KEY),
    platform_evm: Boolean(process.env.PLATFORM_EVM_PRIVATE_KEY),
    helius_webhook: Boolean(process.env.HELIUS_WEBHOOK_SECRET),
    merchant_registry: Boolean(process.env.MERCHANT_REGISTRY_API_KEY),
    kv_persistence: persistenceReady,
  };

  res.status(200).json({
    status: 'OK',
    service: 'SOLQ Orchestrator',
    disbursement_provider: 'IDRX (Polygon burn → redeem-request)',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    storage_mode: persistenceReady ? 'kv' : 'memory',
    env_ready: envFlags,
    inventory,
    retried,
    warning: persistenceReady
      ? null
      : 'Set KV_REST_API_URL + KV_REST_API_TOKEN for persistent stats and intents.',
  });
};
