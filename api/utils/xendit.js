// Xendit Disbursement — IDR bank transfer + e-wallet offramp
// Supports QRIS bank & e-wallet codes from EMVCo TLV parsing

const XENDIT_DISBURSE_URL = 'https://api.xendit.co/disbursements';

// QRIS → Xendit bank_code mapping
const BANK_CODE_MAP = {
  BCA: 'BCA', BNI: 'BNI', BRI: 'BRI', BTN: 'BTN',
  CIMB: 'CIMB', MANDIRI: 'MANDIRI', DANAMON: 'DANAMON',
  PERMATA: 'PERMATA', MAYBANK: 'MAYBANK', BSI: 'BSI',
  BSIM: 'BSI', BTPN: 'BTPN', JENIUS: 'BTPN', JAGO: 'JAGO',
  OCBC: 'OCBC', PANIN: 'PANIN', MEGA: 'MEGA',
  // E-wallets via Xendit Disbursements API
  GOPAY: 'GOPAY', GOJEK: 'GOPAY',
  OVO: 'OVO',
  DANA: 'DANA',
  LINKAJA: 'LINKAJA',
  SHOPEEPAY: 'SHOPEEPAY',
};

export function mapBankCode(rawCode) {
  if (!rawCode) return null;
  const upper = String(rawCode).toUpperCase().trim();
  return BANK_CODE_MAP[upper] ?? (upper !== 'UNKNOWN' ? upper : null);
}

export function isEwallet(bankCode) {
  const ewallet = ['GOPAY', 'OVO', 'DANA', 'LINKAJA', 'SHOPEEPAY'];
  return ewallet.includes(String(bankCode).toUpperCase());
}

/**
 * Create a Xendit disbursement (bank transfer or e-wallet).
 * Returns the Xendit response or throws on failure.
 * Uses externalId as idempotency key — safe to retry with same ID.
 */
export async function createDisbursement({
  externalId,
  bankCode,
  accountNumber,
  amountIdr,
  beneficiaryName,
  description,
}) {
  const apiKey = process.env.XENDIT_API_KEY;
  if (!apiKey) throw new Error('XENDIT_API_KEY not set');

  const mappedCode = mapBankCode(bankCode);
  if (!mappedCode) throw new Error(`Unsupported bank/wallet code: ${bankCode}`);
  if (!accountNumber) throw new Error('accountNumber required');
  if (!amountIdr || amountIdr < 1000) throw new Error(`amountIdr must be >= 1000 (got ${amountIdr})`);

  const auth = Buffer.from(`${apiKey}:`).toString('base64');
  const payload = {
    external_id: externalId,
    bank_code: mappedCode,
    account_number: String(accountNumber).replace(/\D/g, '') || String(accountNumber),
    amount: Math.round(amountIdr),
    beneficiary_name: (beneficiaryName || 'QRIS Merchant').toUpperCase().slice(0, 50),
    description: (description || `SOLQ ${externalId}`).slice(0, 100),
    email_to_notify: 'settlement@solq.app',
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);

  try {
    const res = await fetch(XENDIT_DISBURSE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
        'User-Agent': 'SOLQ/2.0',
      },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });

    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch (_) { data = { raw: text }; }

    if (!res.ok) throw new Error(`Xendit ${res.status}: ${JSON.stringify(data)}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}
