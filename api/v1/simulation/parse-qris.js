import { decodeQris } from '../../utils/qris.js';

const PLATFORM_WALLET = 'ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m';
const DEV_WALLET = '35z7X59rtyts557Up1RAwpyYN7x2cFqcDc7RjPuNxFzr';

function detectNonQrisFormat(payload) {
  if (/gopay|gojek|go-jek/i.test(payload)) return 'GOPAY';
  if (/ovo\.id|ovo:\/\/|OVOQR/i.test(payload)) return 'OVO';
  if (/dana\.id|DANA:\/\//i.test(payload)) return 'DANA';
  if (/shopee|shopeepay|sea\.money/i.test(payload)) return 'SHOPEEPAY';
  if (/bri\.co\.id|brimo|BRIVA/i.test(payload)) return 'BRI';
  if (/^https?:\/\//i.test(payload)) return 'URL';
  if (/^solana:/i.test(payload)) return 'SOLANA_PAY';
  return null;
}

function buildNonQrisResponse(payload, fmt) {
  let merchantName = 'Merchant';
  let amount = null;
  try {
    if (/^https?:\/\//i.test(payload)) {
      const url = new URL(payload);
      const domain = url.hostname.replace('www.', '');
      merchantName = url.searchParams.get('merchant') || url.searchParams.get('name')
        || url.searchParams.get('store') || domain.split('.')[0];
      const rawAmt = url.searchParams.get('amount') || url.searchParams.get('amt');
      if (rawAmt) amount = parseFloat(rawAmt) || null;
    } else {
      const nameMatch = payload.match(/(?:merchant[_\-\s]*name|name)[=:"\s]*([^&"'\s]{2,40})/i);
      if (nameMatch) merchantName = decodeURIComponent(nameMatch[1]);
      const amtMatch = payload.match(/amount[=:](\d+)/i);
      if (amtMatch) amount = parseInt(amtMatch[1]) / (fmt === 'GOPAY' ? 100 : 1);
    }
  } catch (_) { /* keep defaults */ }

  const fmtLabels = { GOPAY: 'GoPay', OVO: 'OVO', DANA: 'Dana', SHOPEEPAY: 'ShopeePay', BRI: 'BRI', URL: 'Link', SOLANA_PAY: 'Solana Pay' };
  return {
    simulation: true,
    qris_valid: false,
    qr_format: fmt,
    qr_format_label: fmtLabels[fmt] || fmt,
    non_qris: true,
    merchant: { name: merchantName, city: 'Indonesia', nmid: 'N/A', account: fmt, bank: fmt, mcc: '5999', country: 'ID' },
    qr_type: amount ? 'DYNAMIC' : 'STATIC',
    amount_locked: amount,
    validation_warnings: [`QR format ${fmt} — bukan QRIS EMVCo standar`],
    platform_wallet: PLATFORM_WALLET,
    dev_wallet: DEV_WALLET,
  };
}

export default async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const { qris_payload } = req.body || {};
  if (!qris_payload || typeof qris_payload !== 'string') {
    return res.status(400).json({ simulation: true, error: 'Missing qris_payload' });
  }
  const trimmed = qris_payload.trim();
  if (trimmed.length < 4) {
    return res.status(400).json({ simulation: true, error: 'QR payload too short' });
  }

  // Detect non-QRIS formats first (e-wallet URLs, Solana Pay, etc.)
  const nonQrisFmt = detectNonQrisFormat(trimmed);
  if (nonQrisFmt) {
    return res.status(200).json(buildNonQrisResponse(trimmed, nonQrisFmt));
  }

  try {
    const decoded = decodeQris(trimmed);
    const isDynamic = decoded.qrisType === 'DYNAMIC';
    const amountLocked = decoded.transactionAmount ? Number(decoded.transactionAmount) : null;

    return res.status(200).json({
      simulation: true,
      qris_valid: decoded.crc_valid,
      merchant: {
        name: decoded.merchantNameDisplay || decoded.merchantName || 'UNKNOWN',
        city: decoded.merchantCity || 'Indonesia',
        nmid: decoded.merchantId || decoded.merchantAccount || 'N/A',
        account: decoded.merchantAccount || 'N/A',
        bank: decoded.bankCode || 'UNKNOWN',
        mcc: decoded.merchantCategoryCode || '0000',
        country: decoded.countryCode || 'ID',
      },
      qr_type: isDynamic ? 'DYNAMIC' : 'STATIC',
      amount_locked: amountLocked,
      validation_warnings: decoded.validationWarnings || [],
      platform_wallet: PLATFORM_WALLET,
      dev_wallet: DEV_WALLET,
    });
  } catch (err) {
    // Unknown format — accept gracefully so frontend can still proceed
    return res.status(200).json({
      simulation: true,
      qris_valid: false,
      qr_format: 'UNKNOWN',
      non_qris: true,
      merchant: { name: 'Merchant', city: 'Indonesia', nmid: 'N/A', account: 'N/A', bank: 'Unknown', mcc: '5999', country: 'ID' },
      qr_type: 'STATIC',
      amount_locked: null,
      validation_warnings: [err.message],
      platform_wallet: PLATFORM_WALLET,
      dev_wallet: DEV_WALLET,
    });
  }
};
