const MAINNET_RPCS = [
  'https://api.mainnet-beta.solana.com',
  'https://solana-mainnet.g.alchemy.com/v2/demo',
];

const DEVNET_RPCS = [
  'https://api.devnet.solana.com',
];

function getRpcs(cluster) {
  return cluster === 'devnet' ? DEVNET_RPCS : MAINNET_RPCS;
}

async function rpcCall(rpcUrl, method, params) {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(`RPC HTTP ${response.status}`);
  }

  const json = await response.json();
  if (json.error) {
    throw new Error(json.error.message || 'RPC error');
  }

  return json.result;
}

export function isValidSolanaSignature(signature) {
  if (typeof signature !== 'string') return false;
  if (signature.length < 80 || signature.length > 100) return false;
  return /^[1-9A-HJ-NP-Za-km-z]+$/.test(signature);
}

export async function verifyFinalizedSignature(signature, cluster = 'mainnet-beta') {
  let lastError = null;
  let notFoundCount = 0;
  const rpcs = getRpcs(cluster);

  for (const rpc of rpcs) {
    try {
      const result = await rpcCall(rpc, 'getSignatureStatuses', [
        [signature],
        { searchTransactionHistory: true },
      ]);
      const status = result?.value?.[0];
      if (!status) {
        notFoundCount += 1;
        continue;
      }

      const confirmationStatus = status.confirmationStatus || 'processed';
      const isFinalized = confirmationStatus === 'finalized' || status.confirmations === null;
      if (!isFinalized) {
        return {
          ok: false,
          reason: 'SIGNATURE_NOT_FINALIZED',
          confirmationStatus,
          rpc,
        };
      }

      const tx = await rpcCall(rpc, 'getTransaction', [
        signature,
        {
          encoding: 'jsonParsed',
          commitment: 'finalized',
          maxSupportedTransactionVersion: 0,
        },
      ]);

      if (!tx) {
        return {
          ok: false,
          reason: 'TRANSACTION_NOT_FOUND',
          confirmationStatus,
          rpc,
        };
      }

      if (tx?.meta?.err) {
        return {
          ok: false,
          reason: 'TRANSACTION_EXECUTION_FAILED',
          confirmationStatus,
          rpc,
          txError: tx.meta.err,
        };
      }

      const accountKeys = tx?.transaction?.message?.accountKeys || [];
      const signers = [];
      for (const keyEntry of accountKeys) {
        if (keyEntry && typeof keyEntry === 'object' && keyEntry.signer && keyEntry.pubkey) {
          signers.push(String(keyEntry.pubkey));
        }
      }

      return {
        ok: true,
        confirmationStatus,
        slot: status.slot || null,
        blockTime: tx?.blockTime || null,
        feeLamports: tx?.meta?.fee ?? null,
        signers,
        rpc,
      };
    } catch (error) {
      lastError = error;
    }
  }

  if (notFoundCount === rpcs.length) {
    return { ok: false, reason: 'SIGNATURE_NOT_FOUND' };
  }

  return {
    ok: false,
    reason: 'RPC_UNREACHABLE',
    detail: lastError ? String(lastError.message || lastError) : 'unknown',
  };
}

function parseAtomicAmount(uiTokenAmount) {
  const atomic = uiTokenAmount?.amount;
  if (typeof atomic !== 'string') return 0n;
  try {
    return BigInt(atomic);
  } catch (_) {
    return 0n;
  }
}

function extractPayer(result) {
  const keys = result?.transaction?.message?.accountKeys;
  if (!Array.isArray(keys) || keys.length === 0) {
    return null;
  }

  for (const key of keys) {
    if (key && typeof key === 'object' && key.signer && typeof key.pubkey === 'string') {
      return key.pubkey;
    }
  }

  const first = keys[0];
  if (typeof first === 'string') return first;
  if (first && typeof first.pubkey === 'string') return first.pubkey;
  return null;
}

function extractTokenDeltas(meta) {
  const pre = Array.isArray(meta?.preTokenBalances) ? meta.preTokenBalances : [];
  const post = Array.isArray(meta?.postTokenBalances) ? meta.postTokenBalances : [];
  const deltas = new Map();

  for (const row of pre) {
    const accountIndex = row?.accountIndex;
    const mint = row?.mint;
    if (accountIndex === undefined || typeof mint !== 'string') continue;
    const key = `${accountIndex}:${mint}`;
    const prev = deltas.get(key) || 0n;
    deltas.set(key, prev - parseAtomicAmount(row?.uiTokenAmount));
  }

  for (const row of post) {
    const accountIndex = row?.accountIndex;
    const mint = row?.mint;
    if (accountIndex === undefined || typeof mint !== 'string') continue;
    const key = `${accountIndex}:${mint}`;
    const prev = deltas.get(key) || 0n;
    deltas.set(key, prev + parseAtomicAmount(row?.uiTokenAmount));
  }

  const items = [];
  for (const [key, delta] of deltas.entries()) {
    if (delta === 0n) continue;
    const [accountIndex, mint] = key.split(':');
    const postRow = post.find(
      (row) => String(row?.accountIndex) === accountIndex && row?.mint === mint,
    );
    const preRow = pre.find(
      (row) => String(row?.accountIndex) === accountIndex && row?.mint === mint,
    );

    items.push({
      accountIndex: Number(accountIndex),
      mint,
      owner: postRow?.owner || preRow?.owner || null,
      decimals: postRow?.uiTokenAmount?.decimals ?? preRow?.uiTokenAmount?.decimals ?? null,
      deltaAtomic: delta.toString(),
    });
  }

  return items;
}

export async function fetchTransactionFacts(signature, cluster = 'mainnet-beta') {
  let lastError = null;
  const rpcs = getRpcs(cluster);

  for (const rpc of rpcs) {
    try {
      const result = await rpcCall(rpc, 'getTransaction', [
        signature,
        {
          encoding: 'jsonParsed',
          commitment: 'finalized',
          maxSupportedTransactionVersion: 0,
        },
      ]);

      if (!result) {
        continue;
      }

      return {
        ok: true,
        rpc,
        slot: result.slot || null,
        blockTime: result.blockTime || null,
        payer: extractPayer(result),
        tokenDeltas: extractTokenDeltas(result.meta),
      };
    } catch (error) {
      lastError = error;
    }
  }

  return {
    ok: false,
    reason: 'TRANSACTION_NOT_AVAILABLE',
    detail: lastError ? String(lastError.message || lastError) : 'unknown',
  };
}
