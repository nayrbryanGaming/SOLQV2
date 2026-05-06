import { getRealTimePricing } from '../../utils/pricing.js';

const PLATFORM_WALLET = 'ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m';
const DEV_WALLET = '35z7X59rtyts557Up1RAwpyYN7x2cFqcDc7RjPuNxFzr';
const SPREAD_BPS = 50; // 0.5%
const MIN_FEE_IDR = 2500;

function jitter(base) {
  return Math.round(base * (1 + (Math.random() - 0.5) * 0.006));
}

export default async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const { amount_idr, token = 'SOL' } = req.body || {};
  const amountIdr = Number(amount_idr);
  if (!amountIdr || amountIdr < 1000 || amountIdr > 100_000_000) {
    return res.status(400).json({ simulation: true, error: 'amount_idr must be 1,000–100,000,000' });
  }

  const tok = String(token).toUpperCase();
  let solIdr = 2850000;
  let usdcIdr = 16350;

  // Try to get real prices
  try {
    const pricing = await getRealTimePricing();
    if (pricing.sol_idr) solIdr = pricing.sol_idr;
    if (pricing.usdc_idr) usdcIdr = pricing.usdc_idr;
  } catch (_) { /* use fallback */ }

  const prices = {
    SOL: jitter(solIdr),
    USDC: jitter(usdcIdr),
    IDRX: 1,
  };

  const rate = prices[tok] || prices.SOL;
  const spread = SPREAD_BPS / 10000;
  const effectiveRate = rate * (1 - spread);
  const tokenAmount = tok === 'IDRX' ? amountIdr : amountIdr / effectiveRate;
  const platformFee = Math.max(MIN_FEE_IDR, Math.round(amountIdr * spread));
  const platformShare = Math.round(platformFee * 0.70);
  const devShare = platformFee - platformShare;

  return res.status(200).json({
    simulation: true,
    token: tok,
    amount_idr: amountIdr,
    token_needed: parseFloat(tokenAmount.toFixed(tok === 'IDRX' ? 0 : 6)),
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
    network_fee_idr: 2,
    network_fee_note: 'Gas sponsored by SOLQ platform',
    total_idr: amountIdr + platformFee,
    quote_valid_seconds: 30,
    expires_at: new Date(Date.now() + 30_000).toISOString(),
    route: tok === 'SOL' ? 'SOL → USDC → IDRX via Jupiter' : tok === 'USDC' ? 'USDC → IDRX via Jupiter' : 'IDRX direct transfer',
    jupiter_mode: 'ExactOut',
  });
};
