import { getRealTimePricing } from '../../utils/pricing.js';
import { testConnectivity as idrxTestConnectivity } from '../../utils/idrx.js';

const PLATFORM_WALLET = 'ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m';
const DEV_WALLET = '35z7X59rtyts557Up1RAwpyYN7x2cFqcDc7RjPuNxFzr';
const SPREAD_BPS = 50; // 0.5%
const MIN_FEE_IDR = 2500;

function fakeSignature() {
  const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let sig = '';
  for (let i = 0; i < 88; i++) sig += chars[Math.floor(Math.random() * chars.length)];
  return sig;
}

function jitter(base) {
  return Math.round(base * (1 + (Math.random() - 0.5) * 0.006));
}

export default async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const { amount_idr, token = 'SOL', merchant, nmid, wallet_address, cluster: rawCluster } = req.body || {};
  const cluster = String(rawCluster || 'mainnet-beta').toLowerCase() === 'devnet' ? 'devnet' : 'mainnet-beta';
  const amountIdr = Number(amount_idr);
  if (!amountIdr || amountIdr < 1000) {
    return res.status(400).json({ simulation: true, error: 'amount_idr must be >= 1000' });
  }

  const tok = String(token).toUpperCase();
  let solIdr = 2850000;
  let usdcIdr = 16350;

  try {
    const pricing = await getRealTimePricing();
    if (pricing.sol_idr) solIdr = pricing.sol_idr;
    if (pricing.usdc_idr) usdcIdr = pricing.usdc_idr;
  } catch (_) { /* use fallback */ }

  const prices = { SOL: jitter(solIdr), USDC: jitter(usdcIdr), IDRX: 1 };
  const rate = prices[tok] || prices.SOL;
  const spread = SPREAD_BPS / 10000;
  const effectiveRate = rate * (1 - spread);
  const tokenAmount = tok === 'IDRX' ? amountIdr : amountIdr / effectiveRate;
  const platformFee = Math.max(MIN_FEE_IDR, Math.round(amountIdr * spread));
  const platformShare = Math.round(platformFee * 0.70);
  const devShare = platformFee - platformShare;
  const fakeSig = fakeSignature();
  const intentId = `sim_${Date.now()}`;
  const clusterParam = cluster === 'devnet' ? '?cluster=devnet' : '?cluster=mainnet-beta';
  const explorerUrl = `https://explorer.solana.com/tx/${fakeSig}${clusterParam}`;
  const solscanUrl = `https://solscan.io/tx/${fakeSig}${cluster === 'devnet' ? '?cluster=devnet' : ''}`;

  // Test IDRX API connectivity (no burn required — GET only)
  let idrxApiTest = null;
  try {
    idrxApiTest = await idrxTestConnectivity();
  } catch (_) {
    idrxApiTest = { ok: false, error: 'connectivity test failed' };
  }

  return res.status(200).json({
    simulation: true,
    simulation_note: 'SIMULASI PENUH — Tidak ada dana nyata yang berpindah. QRIS parsing NYATA, Solana TX SIMULASI.',
    intent_id: intentId,
    status: 'SETTLEMENT_COMPLETE',
    cluster,
    merchant: merchant || 'Unknown Merchant',
    nmid: nmid || 'N/A',
    wallet_address: wallet_address || 'NOT_PROVIDED',
    amount_idr: amountIdr,
    token: tok,
    token_amount: parseFloat(tokenAmount.toFixed(tok === 'IDRX' ? 0 : 6)),
    rate_idr: rate,
    effective_rate_idr: Math.round(effectiveRate),
    platform_fee_idr: platformFee,
    platform_fee_pct: '0.5%',
    fee_split: {
      platform_wallet: PLATFORM_WALLET,
      platform_share_idr: platformShare,
      dev_wallet: DEV_WALLET,
      dev_share_idr: devShare,
      split: '70% platform / 30% dev',
    },
    simulated_tx_signature: fakeSig,
    simulated_explorer_url: explorerUrl,
    simulated_solscan_url: solscanUrl,
    solana_network: `${cluster} (SIMULATED)`,
    // Settlement path: Xendit disbursement (IDRX EVM bridge on roadmap)
    // Audit v6 OPSI C: Xendit is fastest-to-prod path for Solana → IDR
    xendit_settlement: {
      method: 'XENDIT_DISBURSEMENT_SIMULATED',
      status: 'COMPLETED',
      amount_idr: amountIdr - platformFee,
      merchant_receives: `Rp ${(amountIdr - platformFee).toLocaleString('id-ID')}`,
      note: 'Real: POST /api/disbursements → Xendit BI-FAST transfer to merchant bank',
    },
    // IDRX API connectivity test result (auth verification, no burn needed)
    idrx_api_test: {
      endpoint: 'GET /api/auth/get-bank-accounts',
      ...idrxApiTest,
      note: 'IDRX supports EVM chains only (Polygon/Base/BNB). Solana path uses Xendit.',
    },
    processing_steps: [
      { step: 1, label: 'QRIS_VALIDATED', completed_at: new Date(Date.now()).toISOString() },
      { step: 2, label: 'QUOTE_READY', completed_at: new Date(Date.now() + 200).toISOString() },
      { step: 3, label: 'TX_BUILT', completed_at: new Date(Date.now() + 800).toISOString() },
      { step: 4, label: 'SIGNATURE_RECEIVED', completed_at: new Date(Date.now() + 1600).toISOString() },
      { step: 5, label: 'ON_CHAIN_CONFIRMED', completed_at: new Date(Date.now() + 3000).toISOString() },
      { step: 6, label: 'XENDIT_DISBURSED', completed_at: new Date(Date.now() + 4500).toISOString() },
      { step: 7, label: 'SETTLEMENT_COMPLETE', completed_at: new Date(Date.now() + 5000).toISOString() },
    ],
    completed_at: new Date(Date.now() + 5000).toISOString(),
  });
};
