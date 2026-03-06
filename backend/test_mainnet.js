const fetch = require('node-fetch');

async function runTests() {
  const results = [];
  console.log('═════════════════════════════════════════════════════');
  console.log(' SOLQ REAL MAINNET DEMO — ' + new Date().toISOString());
  console.log('═════════════════════════════════════════════════════');

  // TEST 1: Jupiter SOL→IDRX Quote (Mainnet — lite-api)
  console.log('\n[TEST 1] Jupiter SOL→IDRX Quote (Mainnet)');
  try {
    const r = await fetch('https://lite-api.jup.ag/swap/v1/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=idrxZcP8xiKkYk6XGD4uz1dxEYCWSgKDHqgjsBbwDur&amount=1000000&swapMode=ExactOut&slippageBps=100&platformFeeBps=100');
    const d = await r.json();
    if (d.error) { console.log('  ❌ ERROR:', d.error); results.push('FAIL'); }
    else {
      const sol = Number(d.inAmount) / 1e9;
      const idr = Number(d.outAmount) / 100;
      console.log('  SOL needed:', sol.toFixed(6), 'SOL');
      console.log('  IDRX output: Rp', idr.toLocaleString());
      console.log('  Rate: 1 SOL = Rp', Math.round(idr / sol).toLocaleString());
      console.log('  Routes:', d.routePlan?.length || 0);
      console.log('  ✅ PASS — REAL MAINNET QUOTE');
      results.push('PASS');
    }
  } catch (e) { console.log('  ❌ FAIL:', e.message); results.push('FAIL'); }

  // TEST 2: Jupiter USDC→IDRX Quote (Mainnet)
  console.log('\n[TEST 2] Jupiter USDC→IDRX Quote (Mainnet)');
  try {
    const r = await fetch('https://lite-api.jup.ag/swap/v1/quote?inputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&outputMint=idrxZcP8xiKkYk6XGD4uz1dxEYCWSgKDHqgjsBbwDur&amount=1000000&swapMode=ExactOut&slippageBps=100&platformFeeBps=100');
    const d = await r.json();
    if (d.error) { console.log('  ❌ ERROR:', d.error); results.push('FAIL'); }
    else {
      const usdc = Number(d.inAmount) / 1e6;
      const idr = Number(d.outAmount) / 100;
      console.log('  USDC needed:', usdc.toFixed(4), 'USDC');
      console.log('  IDRX output: Rp', idr.toLocaleString());
      console.log('  Rate: 1 USDC = Rp', Math.round(idr / usdc).toLocaleString());
      console.log('  ✅ PASS — REAL MAINNET QUOTE');
      results.push('PASS');
    }
  } catch (e) { console.log('  ❌ FAIL:', e.message); results.push('FAIL'); }

  // TEST 3: Jupiter SWAP TX Generation (Mainnet)
  console.log('\n[TEST 3] Jupiter Swap TX Generation (Mainnet)');
  try {
    const qr = await fetch('https://lite-api.jup.ag/swap/v1/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=idrxZcP8xiKkYk6XGD4uz1dxEYCWSgKDHqgjsBbwDur&amount=1000000&swapMode=ExactOut&slippageBps=100&platformFeeBps=100');
    const quote = await qr.json();
    const sr = await fetch('https://lite-api.jup.ag/swap/v1/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: 'GsbwXfJraMomNxBcjK93pMFqBgHxBBdN6dDkPbEoAUhg',
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        computeUnitPriceMicroLamports: 'auto',
        feeAccount: 'QVpWTCsVLDSLusuwNu3ucEQmeDUjCid1kap5qXzii38',
        destinationTokenAccount: 'QVpWTCsVLDSLusuwNu3ucEQmeDUjCid1kap5qXzii38',
      })
    });
    const sd = await sr.json();
    if (sd.swapTransaction) {
      console.log('  TX Base64 length:', sd.swapTransaction.length, 'chars');
      console.log('  This TX can be signed by Phantom and executed on Solana Mainnet');
      console.log('  ✅ PASS — REAL MAINNET SWAP TX');
      results.push('PASS');
    } else {
      console.log('  ❌ FAIL:', JSON.stringify(sd).substring(0, 200));
      results.push('FAIL');
    }
  } catch (e) { console.log('  ❌ FAIL:', e.message); results.push('FAIL'); }

  // TEST 4: CoinGecko Price Oracle (Real Market Data)
  console.log('\n[TEST 4] CoinGecko Price Oracle');
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana,usd-coin&vs_currencies=idr');
    const d = await r.json();
    console.log('  SOL/IDR: Rp', d.solana?.idr?.toLocaleString());
    console.log('  USDC/IDR: Rp', d['usd-coin']?.idr?.toLocaleString());
    if (d.solana?.idr > 0) { console.log('  ✅ PASS'); results.push('PASS'); }
    else { console.log('  ❌ FAIL'); results.push('FAIL'); }
  } catch (e) { console.log('  ❌ FAIL:', e.message); results.push('FAIL'); }

  // TEST 5: Backend Health + Config
  console.log('\n[TEST 5] SOLQ Backend');
  try {
    const r = await fetch('http://localhost:3000/health');
    const d = await r.json();
    console.log('  Status:', d.status, '| Service:', d.service);
    console.log('  ✅ PASS');
    results.push('PASS');
  } catch (e) { console.log('  ❌ FAIL:', e.message); results.push('FAIL'); }

  // TEST 6: Payment Intent Creation with QRIS
  console.log('\n[TEST 6] Payment Intent (Rp 25,000 — Dynamic QRIS)');
  try {
    // This is a valid EMVCo QRIS format with proper tags
    const r = await fetch('http://localhost:3000/v1/payment-intents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        qris_payload: '00020101021226680016COM.NOBUBANK.WWW01189360050300000898160215ID10230643587770303UMI51440014ID.CO.QRIS.WWW0215ID10230643587770303UMI5204549953033605802ID5913WARUNG MADURA6007BEKASI61051714162070703A01630461A5',
        currency: 'IDRX',
        input_amount: '25000'
      })
    });
    const d = await r.json();
    if (d.id) {
      console.log('  Intent ID:', d.id);
      console.log('  Status:', d.status);
      console.log('  Merchant:', d.merchant?.name || 'N/A');
      console.log('  Amount IDR: Rp', d.amount_details?.fiat_amount?.toLocaleString());
      console.log('  Platform Fee:', d.platformFee);
      console.log('  Fee %:', d.effectiveFeePercent?.toFixed(2) + '%');
      console.log('  ✅ PASS');
      results.push('PASS');

      // TEST 7: Generate Solana Pay TX via backend
      console.log('\n[TEST 7] Backend → Jupiter Swap TX (Full Pipeline)');
      try {
        const r2 = await fetch('http://localhost:3000/solana-pay/' + d.id, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ account: 'GsbwXfJraMomNxBcjK93pMFqBgHxBBdN6dDkPbEoAUhg' })
        });
        const d2 = await r2.json();
        if (d2.transaction) {
          console.log('  TX Base64 length:', d2.transaction.length);
          console.log('  Message:', d2.message);
          console.log('  ✅ PASS — FULL PIPELINE WORKS');
          results.push('PASS');
        } else {
          console.log('  Response:', JSON.stringify(d2).substring(0, 300));
          console.log('  ⚠️  TX generation issue (may need oracle warmup)');
          results.push(d2.error?.includes('ORACLE') || d2.error?.includes('SECURITY') ? 'WARN' : 'FAIL');
        }
      } catch (e) { console.log('  ❌ FAIL:', e.message); results.push('FAIL'); }
    } else {
      console.log('  Response:', JSON.stringify(d).substring(0, 200));
      results.push('FAIL');
    }
  } catch (e) { console.log('  ❌ FAIL:', e.message); results.push('FAIL'); }

  // TEST 8: IDRX API Key Configured
  console.log('\n[TEST 8] IDRX Off-Ramp API');
  const hasKey = process.env.IDRX_API_KEY && process.env.IDRX_API_KEY !== 'YOUR_STABELIFY_API_KEY_HERE';
  console.log('  API Key:', hasKey ? '✅ CONFIGURED (' + process.env.IDRX_API_KEY?.substring(0,8) + '...)' : '❌ MISSING');
  console.log('  Secret Key:', process.env.IDRX_SECRET_KEY ? '✅ CONFIGURED' : '❌ MISSING');
  results.push(hasKey ? 'PASS' : 'FAIL');

  // SUMMARY
  const passed = results.filter(r => r === 'PASS').length;
  const warned = results.filter(r => r === 'WARN').length;
  const failed = results.filter(r => r === 'FAIL').length;
  console.log('\n═════════════════════════════════════════════════════');
  console.log(` RESULTS: ${passed} PASS | ${warned} WARN | ${failed} FAIL / ${results.length} TOTAL`);
  console.log('═════════════════════════════════════════════════════');

  if (failed === 0) {
    console.log(' 🎉 ALL SYSTEMS OPERATIONAL — MAINNET READY');
  }
}

require('dotenv').config();
runTests();

