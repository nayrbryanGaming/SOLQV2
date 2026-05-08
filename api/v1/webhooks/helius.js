// Helius webhook — on-chain event listener for IDRX payments
// BUG-OLD-004 FIX: HMAC-SHA256 signature verification

import { createHmac } from 'crypto';
import { getIntent, updateIntent } from '../../store.js';
import { createDisbursement, mapBankCode } from '../../utils/idrx.js';

const IDRX_MINT = 'idrxZcP8xiKkYk6XGD4uz1dxEYCWSgKDHqgjsBbwDur';
const TREASURY_ITA = 'DqjBhjX9tFzMy9zYXwepXW8GNuqfuDCJ4J7sX1C78p6g';

function verifyHeliusSignature(rawBody, headerSig) {
  const secret = process.env.HELIUS_WEBHOOK_SECRET;
  if (!secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  // constant-time compare
  if (headerSig.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ headerSig.charCodeAt(i);
  }
  return diff === 0;
}

export default async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, helius-signature');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  // Verify Helius HMAC-SHA256 signature
  const headerSig = String(req.headers?.['helius-signature'] || '').trim();
  const rawBody = JSON.stringify(req.body);
  if (!verifyHeliusSignature(rawBody, headerSig)) {
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  const events = Array.isArray(req.body) ? req.body : [req.body];

  for (const event of events) {
    try {
      const txSig = event?.signature;
      const nativeTransfers = Array.isArray(event?.nativeTransfers) ? event.nativeTransfers : [];
      const tokenTransfers = Array.isArray(event?.tokenTransfers) ? event.tokenTransfers : [];

      // Look for IDRX transfer to treasury wallet
      const idrxTransfer = tokenTransfers.find(
        (t) => t?.mint === IDRX_MINT && t?.toUserAccount === TREASURY_ITA && Number(t?.tokenAmount) > 0,
      );

      if (!idrxTransfer || !txSig) continue;

      // Try to match to a payment intent by payer address or tx signature
      const fromAddress = idrxTransfer.fromUserAccount;
      const intentId = event?.description?.match(/pi_\w+/)?.[0] ?? null;

      if (!intentId) continue;

      const intent = await getIntent(intentId);
      if (!intent) continue;
      if (intent.status === 'COMPLETED') continue;

      const idrxAtomic = Number(idrxTransfer.tokenAmount);
      const amountIdr = idrxAtomic / 100; // IDRX has 2 decimals

      // Mark on-chain confirmed
      await updateIntent(intentId, {
        status: 'ON_CHAIN_CONFIRMED',
        txHash: txSig,
        tx_hash: txSig,
        payer_account: fromAddress || intent.payer_account,
        idrx_received_atomic: idrxAtomic,
      });

      // Trigger Xendit disbursement
      const merchantAccount = intent.merchant_account ?? intent.merchant?.pan ?? null;
      const bankCode = intent.bank_code ?? null;
      const beneficiaryName = intent.merchant?.name ?? 'QRIS Merchant';

      if (merchantAccount && mapBankCode(bankCode) && amountIdr >= 1000) {
        const disbursement = await createDisbursement({
          externalId: intentId,
          bankCode,
          accountNumber: merchantAccount,
          amountIdr,
          beneficiaryName,
          description: `SOLQ Helius ${intentId.slice(0, 20)}`,
        });
        await updateIntent(intentId, {
          status: 'COMPLETED',
          settlement_status: 'DISBURSED',
          idrx_disbursement_id: disbursement.id ?? disbursement.external_id,
          idrx_disbursement_status: disbursement.status ?? 'PENDING',
        });
      }
    } catch (_) {
      // Non-fatal: continue processing other events
    }
  }

  res.status(200).json({ received: events.length });
};
