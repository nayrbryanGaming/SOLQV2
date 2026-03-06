const f = require('node-fetch');

async function tryUrl(name, url) {
  try {
    const r = await f(url, { timeout: 10000 });
    const t = await r.text();
    console.log(name + ' [' + r.status + ']: ' + t.substring(0, 200));
  } catch(e) {
    console.log(name + ' FAIL: ' + e.message);
  }
}

async function main() {
  await tryUrl('V6_OLD', 'https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=100000000');
  await tryUrl('SWAP_V1', 'https://api.jup.ag/swap/v1/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=100000000');
  await tryUrl('LITE_V1', 'https://lite-api.jup.ag/v1/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=100000000');
  await tryUrl('PRICE', 'https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112');
  console.log('DONE');
}
main();

