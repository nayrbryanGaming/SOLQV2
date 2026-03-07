import { getIntent, confirmIntent } from '../../store.js';

export default async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'Intent ID required' });
  }

  if (req.method === 'GET') {
    const intent = getIntent(id);
    if (!intent) {
      return res.status(404).json({ error: 'Intent not found' });
    }
    res.status(200).json(intent);
  } else if (req.method === 'POST') {
    try {
      const { tx_hash } = req.body;

      if (!tx_hash) {
        return res.status(400).json({ error: 'tx_hash required' });
      }

      const intent = confirmIntent(id, tx_hash);
      if (!intent) {
        return res.status(404).json({ error: 'Intent not found' });
      }

      res.status(200).json(intent);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
};

