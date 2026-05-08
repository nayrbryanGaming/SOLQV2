// IDRX offramp — converts IDRX to IDR and sends to bank/e-wallet
import { createHmac } from 'crypto';

const IDRX_API_BASE = process.env.IDRX_API_BASE_URL ?? 'https://api.idrx.co';
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

function buildSignature(timestamp, bodyStr) {
  const message = IDRX_API_KEY + timestamp + bodyStr;
  return createHmac('sha256', IDRX_SECRET_KEY).update(message).digest('hex');
}

export async function createDisbursement({
  externalId,
  bankCode,
  accountNumber,
  amountIdr,
  beneficiaryName,
  description,
}) {
  const mappedCode = mapBankCode(bankCode);
  if (!mappedCode) throw new Error(`Unsupported bank code: ${bankCode}`);

  const timestamp = String(Date.now());
  const body = {
    external_id: externalId,
    amount: Math.round(amountIdr),
    bank_code: mappedCode,
    account_number: String(accountNumber),
    beneficiary_name: beneficiaryName ?? 'Merchant',
    description: description ?? `SOLQ ${externalId}`,
  };
  const bodyStr = JSON.stringify(body);
  const signature = buildSignature(timestamp, bodyStr);

  const response = await fetch(`${IDRX_API_BASE}/v1/disbursements`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': IDRX_API_KEY,
      'X-TIMESTAMP': timestamp,
      'X-SIGNATURE': signature,
    },
    body: bodyStr,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`IDRX disbursement failed [${response.status}]: ${text}`);
  }

  return response.json();
}
