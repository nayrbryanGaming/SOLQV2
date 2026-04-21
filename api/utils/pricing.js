const COINGECKO_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=solana,usd-coin&vs_currencies=idr';
const JUPITER_SOL_USD_URL =
  'https://lite-api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112';
const BINANCE_SOL_USDT_URL =
  'https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT';
const USD_IDR_FX_URLS = [
  'https://open.er-api.com/v6/latest/USD',
  'https://api.exchangerate-api.com/v4/latest/USD',
];
const CACHE_WINDOW_MS = 60 * 1000;
const HTTP_TIMEOUT_MS = 6000;

let cachedPricing = null;
let cachedAt = 0;

function normalizePositiveNumber(value) {
  const parsed = Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

async function fetchJson(url, { headers = {} } = {}) {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort();
  }, HTTP_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...headers,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function fetchUsdIdrRate() {
  let lastError = null;

  for (const url of USD_IDR_FX_URLS) {
    try {
      const payload = await fetchJson(url);
      const usdIdr = normalizePositiveNumber(payload?.rates?.IDR);
      if (usdIdr) {
        return { usdIdr, source: url.includes('open.er-api.com') ? 'open_er_api' : 'exchange_rate_api' };
      }
      lastError = new Error('USD/IDR missing or invalid');
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`USD/IDR oracle failure: ${lastError?.message || 'unknown'}`);
}

function buildDeterministicPricing({ solUsd, usdcUsd, usdIdr, source }) {
  const normalizedSolUsd = normalizePositiveNumber(solUsd);
  const normalizedUsdcUsd = normalizePositiveNumber(usdcUsd);
  const normalizedUsdIdr = normalizePositiveNumber(usdIdr);

  if (!normalizedSolUsd || !normalizedUsdcUsd || !normalizedUsdIdr) {
    throw new Error('Invalid deterministic pricing components');
  }

  const solIdr = Number((normalizedSolUsd * normalizedUsdIdr).toFixed(6));
  const usdcIdr = Number((normalizedUsdcUsd * normalizedUsdIdr).toFixed(6));

  if (!normalizePositiveNumber(solIdr) || !normalizePositiveNumber(usdcIdr)) {
    throw new Error('Derived IDR pricing is invalid');
  }

  return {
    sol_idr: solIdr,
    usdc_idr: usdcIdr,
    source,
    cached_at: new Date().toISOString(),
  };
}

async function fetchFromCoinGecko() {
  const headers = {};
  const apiKey = process.env.COINGECKO_API_KEY;
  if (apiKey && String(apiKey).trim().length > 0) {
    headers['x-cg-demo-api-key'] = String(apiKey).trim();
  }

  const payload = await fetchJson(COINGECKO_URL, { headers });
  const solIdr = normalizePositiveNumber(payload?.solana?.idr);
  const usdcIdr = normalizePositiveNumber(payload?.['usd-coin']?.idr);

  if (!solIdr || !usdcIdr) {
    throw new Error('CoinGecko payload invalid');
  }

  return {
    sol_idr: Number(solIdr.toFixed(6)),
    usdc_idr: Number(usdcIdr.toFixed(6)),
    source: 'coingecko',
    cached_at: new Date().toISOString(),
  };
}

async function fetchFromJupiterWithFx() {
  const [jupiterPayload, fx] = await Promise.all([
    fetchJson(JUPITER_SOL_USD_URL),
    fetchUsdIdrRate(),
  ]);

  const solUsd = normalizePositiveNumber(
    jupiterPayload?.data?.So11111111111111111111111111111111111111112?.price,
  );
  if (!solUsd) {
    throw new Error('Jupiter SOL/USD missing');
  }

  return buildDeterministicPricing({
    solUsd,
    usdcUsd: 1,
    usdIdr: fx.usdIdr,
    source: `jupiter+${fx.source}`,
  });
}

async function fetchFromBinanceWithFx() {
  const [binancePayload, fx] = await Promise.all([
    fetchJson(BINANCE_SOL_USDT_URL),
    fetchUsdIdrRate(),
  ]);

  const solUsd = normalizePositiveNumber(binancePayload?.price);
  if (!solUsd) {
    throw new Error('Binance SOL/USDT missing');
  }

  return buildDeterministicPricing({
    solUsd,
    usdcUsd: 1,
    usdIdr: fx.usdIdr,
    source: `binance+${fx.source}`,
  });
}

export async function getRealTimePricing() {
  const now = Date.now();
  if (cachedPricing && now - cachedAt <= CACHE_WINDOW_MS) {
    return {
      ...cachedPricing,
      cached: true,
    };
  }

  const errors = [];

  const providers = [
    { name: 'coingecko', run: fetchFromCoinGecko },
    { name: 'jupiter+fx', run: fetchFromJupiterWithFx },
    { name: 'binance+fx', run: fetchFromBinanceWithFx },
  ];

  for (const provider of providers) {
    try {
      cachedPricing = await provider.run();
      cachedAt = now;
      return {
        ...cachedPricing,
        cached: false,
      };
    } catch (error) {
      errors.push(`${provider.name}: ${error.message}`);
    }
  }

  throw new Error(`Pricing oracle failure (${errors.join(' | ')})`);
}
