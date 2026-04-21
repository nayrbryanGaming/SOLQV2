import { createIntent } from '../../store.js';
import { decodeQris } from '../../utils/qris.js';
import { getRealTimePricing } from '../../utils/pricing.js';

function toNumber(value) {
  const num = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(num) ? num : 0;
}

function clampAmount(amount) {
  if (!Number.isFinite(amount) || amount < 0) return 0;
  if (amount > 100000000) return 100000000;
  return amount;
}

export default async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'POST') {
    try {
      const { qris_payload, currency, input_amount } = req.body;

      if (!qris_payload) {
        return res.status(400).json({ error: 'qris_payload required' });
      }

      const decoded = decodeQris(qris_payload);
      const qrAmount = toNumber(decoded.transactionAmount);
      const manualAmount = toNumber(input_amount);
      const amountIdr = clampAmount(qrAmount > 0 ? qrAmount : manualAmount);

      let pricing;
      try {
        pricing = await getRealTimePricing();
      } catch (error) {
        return res.status(503).json({
          error: 'Real-time pricing unavailable. Unable to create deterministic payment intent.',
          details: error.message,
        });
      }

      const usdcAmount = amountIdr > 0
        ? Number((amountIdr / pricing.usdc_idr).toFixed(6))
        : 0;

      const platformFee = Number((amountIdr * 0.01).toFixed(6));
      const networkFee = 0.000005;
      const networkFeeIdr = Number((networkFee * pricing.sol_idr).toFixed(6));
      const currencySource = String(currency || 'IDRX').toUpperCase();

      const intent = await createIntent({
        status: 'CREATED',
        merchant: {
          name: decoded.merchantNameDisplay || decoded.merchantName,
          id: decoded.merchantId || decoded.merchantAccount || null,
          city: decoded.merchantCity || 'UNKNOWN',
          pan: decoded.merchantAccount,
        },
        amount_details: {
          fiat_amount: amountIdr,
          currency_source: currencySource,
          crypto_amount: usdcAmount,
          quote_id: `qt_${Date.now()}`,
          rate: pricing.usdc_idr,
        },
        qris_data: decoded,
        merchant_id: decoded.merchantId || null,
        merchant_account: decoded.merchantAccount,
        nmid: decoded.merchantId || null,
        bank_code: decoded.bankCode || 'UNKNOWN',
        qris_translation: decoded.translation || null,
        platformFee,
        networkFee,
        networkFeeIdr,
        slippage: 0.5,
        maxFee: Number((amountIdr + platformFee + networkFeeIdr).toFixed(6)),
        effectiveFeePercent: 1.0,
        userSavingsVsQris: Number((amountIdr * 0.02).toFixed(6)),
        pricing,
      });

      res.status(200).json({
        ...intent,
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
};
