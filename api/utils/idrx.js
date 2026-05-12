// IDRX offramp — burn IDRX on-chain then call redeem API to settle IDR to merchant bank
//
// BUG-C001: IDRX Redeem only supports EVM chains: Polygon, Base, BNB, WorldChain, Lisk, Kaia.
// Solana is NOT supported. For Solana → IDR, use Xendit disbursement (see api/utils/xendit.js).
// IDRX EVM bridge (Wormhole/deBridge) is on roadmap; not yet implemented.
import { createHmac } from 'crypto';

// Chains actually supported by IDRX Redeem (verified from docs.idrx.co)
const IDRX_SUPPORTED_CHAINS = ['polygon', 'base', 'bsc', 'worldchain', 'lisk', 'kaia'];

const IDRX_BASE = 'https://idrx.co';
const IDRX_API_KEY = process.env.IDRX_API_KEY ?? 'dfcdee9f7b182552';
const IDRX_SECRET_KEY =
  process.env.IDRX_SECRET_KEY ??
  '0cfb87e14195c17518f4d5577325fa70e8cc7297da490f01e252ea1a0d26c2e8';

const BANK_CODE_MAP = {
  BCA: 'BCA', BNI: 'BNI', BRI: 'BRI', MANDIRI: 'MANDIRI',
  CIMB: 'CIMB', DANAMON: 'DANAMON', PERMATA: 'PERMATA',
  MEGA: 'MEGA', BTN: 'BTN', BTPN: 'BTPN', OCBC: 'OCBC',
  GOPAY: 'GOPAY', OVO: 'OVO', DANA: 'DANA', LINKAJA: 'LINKAJA',
  SHOPEEPAY: 'SHOPEEPAY', QRIS: 'QRIS',
};

export function mapBankCode(rawCode) {
  if (!rawCode) return null;
  return BANK_CODE_MAP[String(rawCode).toUpperCase()] ?? null;
}

// Signature: HMAC-SHA256(hex-decoded secret, timestamp + METHOD + urlPath + body) → base64url
function buildSignature(timestamp, method, urlPath, bodyStr) {
  const secretBytes = Buffer.from(IDRX_SECRET_KEY, 'hex');
  const message = `${timestamp}${method.toUpperCase()}${urlPath}${bodyStr}`;
  return createHmac('sha256', secretBytes).update(message).digest('base64url');
}

// Primary: submit IDRX redeem after burning IDRX on-chain
// burnTxHash is the Solana TX signature of the on-chain SPL Token burn
export async function submitRedeemRequest({
  burnTxHash,
  networkChainId = 'solana',
  amountIdr,
  bankAccount,
  bankCode,
  bankName,
  bankAccountName,
  walletAddress = '',
}) {
  // BUG-C001 guard: fail fast with clear error before hitting IDRX API with unsupported chain
  if (!IDRX_SUPPORTED_CHAINS.includes(String(networkChainId).toLowerCase())) {
    throw new Error(
      `IDRX: chain '${networkChainId}' not supported for redeem. ` +
      `Supported: ${IDRX_SUPPORTED_CHAINS.join(', ')}. ` +
      `For Solana, use Xendit disbursement.`
    );
  }
  const mappedCode = mapBankCode(bankCode);
  if (!mappedCode) throw new Error(`Unsupported bank code: ${bankCode}`);
  if (!burnTxHash) throw new Error('burnTxHash required — burn IDRX on-chain first');

  const timestamp = String(Date.now());
  const urlPath = '/api/transaction/redeem-request';
  const body = {
    txHash: burnTxHash,
    networkChainId,
    amountTransfer: String(Math.round(amountIdr)),
    bankAccount: String(bankAccount),
    bankCode: mappedCode,
    bankName: bankName ?? mappedCode,
    bankAccountName: bankAccountName ?? 'Merchant',
    walletAddress,
  };
  const bodyStr = JSON.stringify(body);
  const signature = buildSignature(timestamp, 'POST', urlPath, bodyStr);

  const response = await fetch(`${IDRX_BASE}${urlPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'idrx-api-key': IDRX_API_KEY,
      'idrx-api-sig': signature,
      'idrx-api-ts': timestamp,
    },
    body: bodyStr,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`IDRX redeem [${response.status}]: ${text}`);
  }

  return response.json();
}

// Legacy wrapper — requires burnTxHash and a supported EVM chain (NOT solana)
export async function createDisbursement({
  externalId,
  bankCode,
  accountNumber,
  amountIdr,
  beneficiaryName,
  burnTxHash,
  walletAddress,
  networkChainId,
}) {
  if (!burnTxHash) {
    throw new Error(
      'IDRX requires on-chain burn TX hash. Client must burn IDRX first, then pass burn_tx_hash.',
    );
  }
  const chain = String(networkChainId || '').toLowerCase();
  if (!IDRX_SUPPORTED_CHAINS.includes(chain)) {
    throw new Error(
      `IDRX: chain '${chain || 'none'}' not supported. Supported: ${IDRX_SUPPORTED_CHAINS.join(', ')}. ` +
      'For Solana, use Xendit disbursement (api/utils/xendit.js).',
    );
  }
  return submitRedeemRequest({
    burnTxHash,
    networkChainId: chain,
    amountIdr,
    bankAccount: accountNumber,
    bankCode,
    bankName: bankCode,
    bankAccountName: beneficiaryName ?? 'Merchant',
    walletAddress: walletAddress ?? '',
  });
}

// Test IDRX API connectivity — calls GET /api/auth/get-bank-accounts (no burn needed)
export async function testConnectivity() {
  const timestamp = String(Date.now());
  const urlPath = '/api/auth/get-bank-accounts';
  const signature = buildSignature(timestamp, 'GET', urlPath, '');

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const response = await fetch(`${IDRX_BASE}${urlPath}`, {
      method: 'GET',
      headers: {
        'idrx-api-key': IDRX_API_KEY,
        'idrx-api-sig': signature,
        'idrx-api-ts': timestamp,
      },
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    const text = await response.text().catch(() => '');
    let data = null;
    try { data = JSON.parse(text); } catch (_) { data = { raw: text }; }

    return {
      ok: response.ok,
      status: response.status,
      data: response.ok ? data : null,
      error: response.ok ? null : (data?.message || text || response.statusText),
    };
  } catch (err) {
    return { ok: false, status: 0, data: null, error: String(err.message || err) };
  }
}
