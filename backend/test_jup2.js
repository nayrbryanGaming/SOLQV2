const f = require('node-fetch');

async function tryUrl(name, url) {
  try {
    const r = await f(url, { timeout: 10000 });
    const t = await r.text();
    console.log(name + ' [' + r.status + ']: ' + t.substring(0, 250));
  } catch(e) {
    console.log(name + ' FAIL: ' + e.message.substring(0, 100));
  }
}

async function main() {
  // Try all known Jupiter endpoints
  const base = 'inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=100000000';

  await tryUrl('ultra_v1_quote', 'https://api.jup.ag/ultra/v1/order?' + base);
  await tryUrl('lite_v1_swap_q', 'https://lite-api.jup.ag/swap/v1/quote?' + base);
  await tryUrl('public_v6', 'https://public.jupiterapi.com/quote?' + base);
  await tryUrl('tokens', 'https://tokens.jup.ag/token/So11111111111111111111111111111111111111112');
  await tryUrl('price_v1', 'https://api.jup.ag/price/v1?id=So11111111111111111111111111111111111111112');

  console.log('DONE');
}
main();

