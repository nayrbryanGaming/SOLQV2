import { decodeQris } from '../../utils/qris.js';

const PLATFORM_WALLET = 'ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m';
const DEV_WALLET = '35z7X59rtyts557Up1RAwpyYN7x2cFqcDc7RjPuNxFzr';

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
  if (qris_payload.length < 20 || qris_payload.length > 800) {
    return res.status(400).json({ simulation: true, error: 'Invalid QRIS payload length (20-800 chars)' });
  }

  try {
    const decoded = decodeQris(qris_payload);
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
    return res.status(400).json({
      simulation: true,
      error: 'INVALID_QRIS',
      message: err.message,
    });
  }
};
