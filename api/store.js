// Simple in-memory store for payment intents
export const paymentIntents = {};

export const getStats = () => {
  const intents = Object.values(paymentIntents);
  const successCount = intents.filter(i => i.status === 'COMPLETED').length;
  return {
    success_count: successCount,
    total_intents: intents.length,
    timestamp: new Date().toISOString()
  };
};

export const createIntent = (data) => {
  const intentId = Math.random().toString(36).substring(7);
  const intent = {
    id: intentId,
    ...data,
    status: 'PENDING',
    created_at: new Date().toISOString(),
  };
  paymentIntents[intentId] = intent;
  return intent;
};

export const getIntent = (id) => {
  return paymentIntents[id] || null;
};

export const confirmIntent = (id, txHash) => {
  const intent = paymentIntents[id];
  if (!intent) return null;
  intent.status = 'COMPLETED';
  intent.tx_hash = txHash;
  intent.completed_at = new Date().toISOString();
  return intent;
};

