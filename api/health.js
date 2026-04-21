export default async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const persistenceReady = Boolean(
    process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN,
  );

  res.status(200).json({
    status: 'OK',
    service: 'SOLQ Orchestrator',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    persistence_ready: persistenceReady,
    storage_mode: persistenceReady ? 'kv' : 'memory',
    warning: persistenceReady
      ? null
      : 'Set KV_REST_API_URL + KV_REST_API_TOKEN for persistent stats and intents.',
  });
};
