import { getInventoryStatus } from './utils/idrx-evm.js';

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
  let inventory = null;
  if (req.query?.inventory === '1' || req.url?.includes('inventory=1')) {
    inventory = await getInventoryStatus();
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
    warning: persistenceReady
      ? null
      : 'Set KV_REST_API_URL + KV_REST_API_TOKEN for persistent stats and intents.',
  });
};
