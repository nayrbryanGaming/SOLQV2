const f = require('node-fetch');

async function main() {
  const IDRX = 'idrxZcP8xiKkYk6XGD4uz1dxEYCWSgKDHqgjsBbwDur';
  const SOL = 'So11111111111111111111111111111111111111112';
  const TREASURY_ATA = 'QVpWTCsVLDSLusuwNu3ucEQmeDUjCid1kap5qXzii38';
  const REAL_WALLET = 'GsbwXfJraMomNxBcjK93pMFqBgHxBBdN6dDkPbEoAUhg';

  // Get quote
  console.log('1. Getting quote...');
  const qr = await f(`https://lite-api.jup.ag/swap/v1/quote?inputMint=${SOL}&outputMint=${IDRX}&amount=1000000&swapMode=ExactOut&slippageBps=100&platformFeeBps=100`);
  const quote = await qr.json();
  console.log('Quote OK:', quote.inAmount, 'lamports →', quote.outAmount, 'IDRX atomic');

  // Test swap WITH feeAccount
  console.log('\n2. Swap with feeAccount...');
  const sr = await f('https://lite-api.jup.ag/swap/v1/swap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: REAL_WALLET,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      computeUnitPriceMicroLamports: 'auto',
      feeAccount: TREASURY_ATA,
    })
  });
  const sd = await sr.json();
  console.log('Swap status:', sr.status);
  if (sd.swapTransaction) {
    console.log('✅ TX length:', sd.swapTransaction.length);
  } else {
    console.log('Response:', JSON.stringify(sd).substring(0, 400));
  }

  // Test swap with feeAccount + destinationWallet
  console.log('\n3. Swap with feeAccount + destinationWallet...');
  const sr2 = await f('https://lite-api.jup.ag/swap/v1/swap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: REAL_WALLET,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      computeUnitPriceMicroLamports: 'auto',
      feeAccount: TREASURY_ATA,
      destinationTokenAccount: TREASURY_ATA,
    })
  });
  const sd2 = await sr2.json();
  console.log('Swap status:', sr2.status);
  if (sd2.swapTransaction) {
    console.log('✅ TX length:', sd2.swapTransaction.length);
  } else {
    console.log('Response:', JSON.stringify(sd2).substring(0, 400));
  }

  console.log('\nDONE');
}
main().catch(e => console.log('ERR:', e.message));

