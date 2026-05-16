// Helius webhook — on-chain event listener for SOLQ Gateway deposits
// Triggers Xendit disbursement when SOL arrives at the gateway wallet.
// BUG-OLD-004 FIX: HMAC-SHA256 signature verification
// BUG-FIX 20260516: switched from IDRX (EVM-only) to Xendit; detect native SOL deposits

import { createHmac } from 'crypto';
import { getIntent, updateIntent, paymentIntents, getMerchant } from '../../store.js';
import { createDisbursement, mapBankCode } from '../../utils/xendit.js';

// Native SOL deposits land at the gateway wallet (matches PLATFORM_FEE_WALLET in client)
const GATEWAY_WALLET = 'ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m';
const LAMPORTS_PER_SOL = 1_000_000_000;
const MIN_DISBURSEMENT_IDR = 1000;

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
  const results = [];

  for (const event of events) {
    try {
      const txSig = event?.signature;
      const nativeTransfers = Array.isArray(event?.nativeTransfers) ? event.nativeTransfers : [];

      // Look for native SOL transfer landing at the gateway wallet
      const gatewayDeposit = nativeTransfers.find(
        (t) => t?.toUserAccount === GATEWAY_WALLET && Number(t?.amount) > 0,
      );
      if (!gatewayDeposit || !txSig) continue;

      const fromAddress = gatewayDeposit.fromUserAccount;
      const lamports = Number(gatewayDeposit.amount);

      // Match an intent by description (pi_xxx) or by payer wallet (latest open intent)
      let intentId = event?.description?.match(/pi_\w+/)?.[0] || null;
      let intent = intentId ? await getIntent(intentId) : null;
      if (!intent && fromAddress) {
        // Fallback: find most recent open intent for this payer
        const candidates = Object.values(paymentIntents).filter(
          (p) => p && p.payer_account === fromAddress && p.status !== 'COMPLETED',
        );
        if (candidates.length > 0) {
          intent = candidates.sort((a, b) =>
            new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
          )[0];
          intentId = intent.id;
        }
      }

      if (!intent || intent.status === 'COMPLETED') continue;

      const amountIdr = Number(intent.amount_details?.fiat_amount || 0);

      // Mark on-chain confirmed (idempotent — keep going if already confirmed)
      await updateIntent(intentId, {
        status: 'ON_CHAIN_CONFIRMED',
        txHash: txSig,
        tx_hash: txSig,
        payer_account: fromAddress || intent.payer_account,
        sol_received_lamports: lamports,
        sol_received_sol: lamports / LAMPORTS_PER_SOL,
      });

      // Resolve merchant bank details (registry > intent fields)
      const intentNmid = intent.nmid ?? intent.merchant_id ?? intent.merchant?.id ?? null;
      const registered = intentNmid ? await getMerchant(intentNmid) : null;
      const merchantAccount = registered?.bank_account ?? intent.merchant_account ?? intent.merchant?.pan ?? null;
      const bankCode = registered?.bank_code ?? intent.bank_code ?? null;
      const beneficiaryName = registered?.account_name ?? intent.merchant?.name ?? 'QRIS Merchant';

      // Trigger Xendit disbursement (Solana → IDR)
      if (merchantAccount && mapBankCode(bankCode) && amountIdr >= MIN_DISBURSEMENT_IDR) {
        try {
          const disbursement = await createDisbursement({
            externalId: `solq_helius_${intentId}_${txSig.slice(0, 8)}`,
            bankCode,
            accountNumber: merchantAccount,
            amountIdr,
            beneficiaryName,
            description: `SOLQ Helius ${intentId.slice(0, 20)}`,
          });
          await updateIntent(intentId, {
            status: 'COMPLETED',
            settlement_status: 'DISBURSED',
            xendit_disbursement_id: disbursement?.id ?? null,
            xendit_disbursement_status: disbursement?.status ?? 'COMPLETED',
          });
          results.push({ intentId, txSig, disbursed: true });
        } catch (err) {
          await updateIntent(intentId, {
            settlement_status: 'SETTLEMENT_PENDING',
            settlement_error: String(err.message || err),
          });
          results.push({ intentId, txSig, disbursed: false, error: String(err.message || err) });
        }
      } else {
        await updateIntent(intentId, { settlement_status: 'AWAITING_MANUAL_SETTLEMENT' });
        results.push({ intentId, txSig, disbursed: false, reason: 'missing_merchant_or_bank' });
      }
    } catch (err) {
      results.push({ error: String(err.message || err) });
    }
  }

  res.status(200).json({ received: events.length, processed: results });
};
