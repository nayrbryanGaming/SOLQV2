import { getMerchant, registerMerchant } from '../store.js';

// timing-safe constant-time string compare
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export default async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Key');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const url = new URL(req.url || '/', `https://${req.headers?.host || 'solq.vercel.app'}`);
    const segments = url.pathname.split('/').filter(Boolean);
    const merchantsIdx = segments.lastIndexOf('merchants');
    const nmid =
      merchantsIdx >= 0 && merchantsIdx < segments.length - 1
        ? segments[merchantsIdx + 1]
        : (url.searchParams.get('nmid') ?? null);

    if (req.method === 'GET') {
      if (!nmid) {
        return res.status(400).json({ error: 'NMID required: GET /v1/merchants/:nmid' });
      }
      const merchant = await getMerchant(nmid);
      if (!merchant) {
        return res.status(404).json({ error: 'Merchant not found', nmid });
      }
      return res.status(200).json(merchant);
    }

    if (req.method === 'POST') {
      // SECURITY: merchant registration affects where Xendit disburses IDR.
      // Without auth, anyone could register a merchant with a victim's NMID
      // and their own bank account to hijack disbursements.
      const adminKey = process.env.MERCHANT_REGISTRY_API_KEY;
      if (!adminKey) {
        return res.status(503).json({
          error: 'MERCHANT_REGISTRY_DISABLED',
          message: 'MERCHANT_REGISTRY_API_KEY env var not set — registry writes are disabled in this deployment.',
        });
      }
      const authHeader = String(req.headers?.authorization || '').trim();
      const xAdminKey = String(req.headers?.['x-admin-key'] || '').trim();
      const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : xAdminKey;
      if (!safeEqual(provided, adminKey)) {
        return res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'Provide MERCHANT_REGISTRY_API_KEY via "Authorization: Bearer <key>" or "X-Admin-Key: <key>".',
        });
      }

      const body = req.body ?? {};
      if (!body.nmid || !body.bank_code || !body.bank_account) {
        return res.status(400).json({ error: 'Required fields: nmid, bank_code, bank_account' });
      }
      const merchant = await registerMerchant(body);
      return res.status(200).json(merchant);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
