import { getMerchant, registerMerchant } from '../store.js';

export default async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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
