// Primary: KV-backed store (when configured)
// Fallback: in-memory store (for local/dev or missing KV env)
export const paymentIntents = {};

const KV_REST_API_URL = process.env.KV_REST_API_URL;
const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;
const KV_ENABLED = Boolean(KV_REST_API_URL && KV_REST_API_TOKEN);

const KEY_PREFIX = 'solq:';
const INTENT_IDS_KEY = `${KEY_PREFIX}intent_ids`;
const TOTAL_COUNT_KEY = `${KEY_PREFIX}total_count`;
const SUCCESS_COUNT_KEY = `${KEY_PREFIX}success_count`;
const UNIQUE_WALLETS_KEY = `${KEY_PREFIX}unique_wallets`;

function intentKey(id) {
  return `${KEY_PREFIX}intent:${id}`;
}

async function kvRequest(command, args = []) {
  if (!KV_ENABLED) return null;

  const response = await fetch(KV_REST_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KV_REST_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([command, ...args]),
  });

  if (!response.ok) {
    throw new Error(`KV HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (payload?.error) {
    throw new Error(String(payload.error));
  }

  return payload?.result ?? null;
}

async function kvGetJson(key) {
  const raw = await kvRequest('GET', [key]);
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

async function kvSetJson(key, value) {
  return kvRequest('SET', [key, JSON.stringify(value)]);
}

function normalizeWalletCandidate(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getWalletFromIntent(intent) {
  return normalizeWalletCandidate(
    intent?.payer_account || intent?.wallet_address || intent?.address,
  );
}

function toSafeInt(value) {
  const parsed = Number.parseInt(String(value ?? '0'), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function getStatsFromMemory() {
  const intents = Object.values(paymentIntents);
  const successCount = intents.filter((intent) => intent.status === 'COMPLETED').length;
  const uniqueWalletUsers = new Set(
    intents
      .map((intent) => getWalletFromIntent(intent))
      .filter((wallet) => wallet !== null),
  ).size;

  return {
    success_count: successCount,
    unique_wallet_users: uniqueWalletUsers,
    total_intents: intents.length,
    timestamp: new Date().toISOString(),
    storage_mode: 'memory',
    persistence_ready: false,
    warning:
      'Persistent counter unavailable. Configure KV_REST_API_URL and KV_REST_API_TOKEN for cross-invocation stats.',
  };
}

async function persistWalletSet(intent) {
  const wallet = getWalletFromIntent(intent);
  if (!wallet || !KV_ENABLED) return;
  await kvRequest('SADD', [UNIQUE_WALLETS_KEY, wallet]);
}

export const getStats = async () => {
  if (KV_ENABLED) {
    try {
      const [successCountRaw, uniqueWalletUsersRaw, totalCountRaw] = await Promise.all([
        kvRequest('GET', [SUCCESS_COUNT_KEY]),
        kvRequest('SCARD', [UNIQUE_WALLETS_KEY]),
        kvRequest('GET', [TOTAL_COUNT_KEY]),
      ]);

      return {
        success_count: toSafeInt(successCountRaw),
        unique_wallet_users: toSafeInt(uniqueWalletUsersRaw),
        total_intents: toSafeInt(totalCountRaw),
        timestamp: new Date().toISOString(),
        storage_mode: 'kv',
        persistence_ready: true,
      };
    } catch (_) {
      // fall through to memory fallback
    }
  }

  return getStatsFromMemory();
};

export const createIntent = async (data) => {
  const intentId = data.id || `pi_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();
  const intent = {
    ...data,
    id: intentId,
    status: data.status || 'CREATED',
    createdAt: data.createdAt || now,
    updatedAt: now,
  };

  paymentIntents[intentId] = intent;

  if (KV_ENABLED) {
    try {
      const existing = await kvGetJson(intentKey(intentId));
      if (existing) {
        paymentIntents[intentId] = existing;
        return existing;
      }

      await Promise.all([
        kvSetJson(intentKey(intentId), intent),
        kvRequest('SADD', [INTENT_IDS_KEY, intentId]),
        kvRequest('INCR', [TOTAL_COUNT_KEY]),
        persistWalletSet(intent),
      ]);
    } catch (_) {
      // keep memory fallback
    }
  }

  return intent;
};

export const getIntent = async (id) => {
  if (paymentIntents[id]) {
    return paymentIntents[id];
  }

  if (!KV_ENABLED) {
    return null;
  }

  try {
    const intent = await kvGetJson(intentKey(id));
    if (intent) {
      paymentIntents[id] = intent;
    }
    return intent;
  } catch (_) {
    return null;
  }
};

export const updateIntent = async (id, patch) => {
  const intent = await getIntent(id);
  if (!intent) return null;

  const previousStatus = intent.status;
  const updated = {
    ...intent,
    ...patch,
    id: intent.id,
    updatedAt: new Date().toISOString(),
  };

  paymentIntents[id] = updated;

  if (KV_ENABLED) {
    try {
      await kvSetJson(intentKey(id), updated);
      await persistWalletSet(updated);

      if (previousStatus !== 'COMPLETED' && updated.status === 'COMPLETED') {
        await kvRequest('INCR', [SUCCESS_COUNT_KEY]);
      }
    } catch (_) {
      // keep memory fallback
    }
  }

  return updated;
};

export const confirmIntent = async (id, txHash, payerAccount) => {
  const intent = await getIntent(id);
  if (!intent) return null;

  const previousStatus = intent.status;
  const updated = {
    ...intent,
    status: 'COMPLETED',
    txHash,
    tx_hash: txHash,
    payer_account: payerAccount || intent.payer_account || null,
    completedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  paymentIntents[id] = updated;

  if (KV_ENABLED) {
    try {
      await Promise.all([
        kvSetJson(intentKey(id), updated),
        persistWalletSet(updated),
        previousStatus !== 'COMPLETED'
          ? kvRequest('INCR', [SUCCESS_COUNT_KEY])
          : Promise.resolve(null),
      ]);
    } catch (_) {
      // keep memory fallback
    }
  }

  return updated;
};

export const resetStore = async () => {
  Object.keys(paymentIntents).forEach((key) => {
    delete paymentIntents[key];
  });

  if (!KV_ENABLED) return;

  try {
    const ids = await kvRequest('SMEMBERS', [INTENT_IDS_KEY]);
    const deleteKeys = Array.isArray(ids)
      ? ids.map((id) => intentKey(String(id))).filter((key) => key.length > 0)
      : [];

    if (deleteKeys.length > 0) {
      await kvRequest('DEL', deleteKeys);
    }

    await kvRequest('DEL', [INTENT_IDS_KEY, TOTAL_COUNT_KEY, SUCCESS_COUNT_KEY, UNIQUE_WALLETS_KEY]);
  } catch (_) {
    // ignore cleanup issues
  }
};

// ─── Merchant Registry ────────────────────────────────────────────────────────

const MERCHANT_PREFIX = `${KEY_PREFIX}merchant:`;
const merchantRegistry = {};

function merchantKey(nmid) {
  return `${MERCHANT_PREFIX}${String(nmid)}`;
}

function getDemoMerchant(nmid) {
  const demoNmid = process.env.DEMO_MERCHANT_NMID;
  if (!demoNmid) return null;
  if (nmid !== demoNmid && nmid !== '*') return null;
  return {
    nmid: demoNmid,
    bank_code: process.env.DEMO_MERCHANT_BANK_CODE ?? 'BCA',
    bank_account: process.env.DEMO_MERCHANT_ACCOUNT ?? '1234567890',
    bank_name: process.env.DEMO_MERCHANT_BANK_NAME ?? 'Bank Central Asia',
    account_name: process.env.DEMO_MERCHANT_ACCOUNT_NAME ?? 'Demo Merchant',
    merchant_name: process.env.DEMO_MERCHANT_DISPLAY_NAME ?? 'Demo Merchant',
    source: 'env',
  };
}

export const getMerchant = async (nmid) => {
  if (!nmid) return null;

  if (merchantRegistry[nmid]) return merchantRegistry[nmid];

  if (KV_ENABLED) {
    try {
      const m = await kvGetJson(merchantKey(nmid));
      if (m) {
        merchantRegistry[nmid] = m;
        return m;
      }
    } catch (_) {
      // fall through
    }
  }

  return getDemoMerchant(nmid);
};

export const registerMerchant = async (data) => {
  if (!data?.nmid) throw new Error('nmid required');
  const now = new Date().toISOString();
  const merchant = { ...data, registered_at: data.registered_at ?? now, updated_at: now };
  merchantRegistry[data.nmid] = merchant;
  if (KV_ENABLED) {
    try {
      await kvSetJson(merchantKey(data.nmid), merchant);
    } catch (_) {
      // keep in-memory fallback
    }
  }
  return merchant;
};
