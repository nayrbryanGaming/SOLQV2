const f = require('node-fetch');

async function main() {
  const IDRX = 'idrxZcP8xiKkYk6XGD4uz1dxEYCWSgKDHqgjsBbwDur';
  const SOL = 'So11111111111111111111111111111111111111112';
  const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

  // Test SOL→IDRX on lite-api
  console.log('=== SOL→IDRX (lite-api) ===');
  const r1 = await f(`https://lite-api.jup.ag/swap/v1/quote?inputMint=${SOL}&outputMint=${IDRX}&amount=1000000&swapMode=ExactOut&slippageBps=100&platformFeeBps=100`);
  const d1 = await r1.json();
  console.log('Status:', r1.status);
  if (d1.error) console.log('Error:', JSON.stringify(d1));
  else {
    console.log('inAmount:', d1.inAmount, '=', (Number(d1.inAmount)/1e9).toFixed(6), 'SOL');
    console.log('outAmount:', d1.outAmount, '=', 'Rp', (Number(d1.outAmount)/100).toFixed(0));
  }

  console.log('');

  // Test USDC→IDRX on lite-api
  console.log('=== USDC→IDRX (lite-api) ===');
  const r2 = await f(`https://lite-api.jup.ag/swap/v1/quote?inputMint=${USDC}&outputMint=${IDRX}&amount=1000000&swapMode=ExactOut&slippageBps=100&platformFeeBps=100`);
  const d2 = await r2.json();
  console.log('Status:', r2.status);
  if (d2.error) console.log('Error:', JSON.stringify(d2));
  else {
    console.log('inAmount:', d2.inAmount, '=', (Number(d2.inAmount)/1e6).toFixed(4), 'USDC');
    console.log('outAmount:', d2.outAmount, '=', 'Rp', (Number(d2.outAmount)/100).toFixed(0));
  }

  console.log('');

  // Test SOL→IDRX on public.jupiterapi.com
  console.log('=== SOL→IDRX (public.jupiterapi.com) ===');
  const r3 = await f(`https://public.jupiterapi.com/quote?inputMint=${SOL}&outputMint=${IDRX}&amount=1000000&swapMode=ExactOut&slippageBps=100&platformFeeBps=100`);
  const d3 = await r3.json();
  console.log('Status:', r3.status);
  if (d3.error) console.log('Error:', JSON.stringify(d3));
  else {
    console.log('inAmount:', d3.inAmount, '=', (Number(d3.inAmount)/1e9).toFixed(6), 'SOL');
    console.log('outAmount:', d3.outAmount, '=', 'Rp', (Number(d3.outAmount)/100).toFixed(0));
  }

  console.log('');

  // Test SWAP endpoint
  console.log('=== SWAP ENDPOINT (lite-api) ===');
  const r4 = await f(`https://lite-api.jup.ag/swap/v1/swap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: d1.error ? d3 : d1,
      userPublicKey: 'GsbwXfJraMomNxBcjK93pMFqBgHxBBdN6dDkPbEoAUhg',
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      computeUnitPriceMicroLamports: 'auto',
      destinationWallet: 'ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m'
    })
  });
  const d4 = await r4.json();
  console.log('Status:', r4.status);
  if (d4.swapTransaction) {
    console.log('TX Base64 length:', d4.swapTransaction.length);
    console.log('✅ SWAP TX GENERATED!');
  } else {
    console.log('Response:', JSON.stringify(d4).substring(0, 300));
  }

  console.log('\nDONE');
}
main().catch(e => console.log('ERR:', e.message));

