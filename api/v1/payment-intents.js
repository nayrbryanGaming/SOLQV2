import { createIntent } from '../../store.js';

export default async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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

      const intent = createIntent({
        qris_payload,
        currency: currency || 'IDRX',
        input_amount: input_amount || 0,
      });

      res.status(200).json({
        intent_id: intent.id,
        ...intent,
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
};

