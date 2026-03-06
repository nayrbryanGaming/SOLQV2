const fetch = require('node-fetch');

async function runTests() {
  const results = [];

  // TEST 1: Jupiter SOL→IDRX Quote (Mainnet)
  try {
    const r1 = await fetch('https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=idrxZcP8xiKkYk6XGD4uz1dxEYCWSgKDHqgjsBbwDur&amount=1000000&swapMode=ExactOut&slippageBps=100&platformFeeBps=100');
    const d1 = await r1.json();
    if (d1.error) {
      results.push({ test: 'Jupiter SOL→IDRX', status: 'FAIL', error: d1.error });
    } else {
      const sol = Number(d1.inAmount) / 1e9;
      const idr = Number(d1.outAmount) / 100;
      results.push({
        test: 'Jupiter SOL→IDRX',
        status: 'PASS',
        inAmount: d1.inAmount,
        outAmount: d1.outAmount,
        sol: sol.toFixed(6),
        idr: idr.toFixed(0),
        rate: Math.round(idr / sol),
        routes: d1.routePlan?.length || 0
      });
    }
  } catch (e) {
    results.push({ test: 'Jupiter SOL→IDRX', status: 'FAIL', error: e.message });
  }

  // TEST 2: Jupiter USDC→IDRX Quote (Mainnet)
  try {
    const r2 = await fetch('https://quote-api.jup.ag/v6/quote?inputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&outputMint=idrxZcP8xiKkYk6XGD4uz1dxEYCWSgKDHqgjsBbwDur&amount=1000000&swapMode=ExactOut&slippageBps=100&platformFeeBps=100');
    const d2 = await r2.json();
    if (d2.error) {
      results.push({ test: 'Jupiter USDC→IDRX', status: 'FAIL', error: d2.error });
    } else {
      const usdc = Number(d2.inAmount) / 1e6;
      const idr2 = Number(d2.outAmount) / 100;
      results.push({
        test: 'Jupiter USDC→IDRX',
        status: 'PASS',
        inAmount: d2.inAmount,
        outAmount: d2.outAmount,
        usdc: usdc.toFixed(4),
        idr: idr2.toFixed(0),
        rate: Math.round(idr2 / usdc),
        routes: d2.routePlan?.length || 0
      });
    }
  } catch (e) {
    results.push({ test: 'Jupiter USDC→IDRX', status: 'FAIL', error: e.message });
  }

  // TEST 3: CoinGecko Oracle
  try {
    const r3 = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana,usd-coin&vs_currencies=idr');
    const d3 = await r3.json();
    results.push({
      test: 'CoinGecko Oracle',
      status: d3.solana?.idr ? 'PASS' : 'FAIL',
      SOL_IDR: d3.solana?.idr,
      USDC_IDR: d3['usd-coin']?.idr
    });
  } catch (e) {
    results.push({ test: 'CoinGecko Oracle', status: 'FAIL', error: e.message });
  }

  // TEST 4: Backend Health
  try {
    const r4 = await fetch('http://localhost:3000/health');
    const d4 = await r4.json();
    results.push({ test: 'Backend Health', status: d4.status === 'OK' ? 'PASS' : 'FAIL', data: d4 });
  } catch (e) {
    results.push({ test: 'Backend Health', status: 'FAIL', error: e.message });
  }

  // TEST 5: Payment Intent with QRIS
  try {
    const qris = '00020101021126570011ID.DANA.WWW011893600915300000000002030001520454990053036005802ID5909TOKO TEST6013JAKARTA PUSAT61051034062070703A016304BE54';
    const r5 = await fetch('http://localhost:3000/v1/payment-intents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qris_payload: qris, currency: 'IDRX', input_amount: '10000' })
    });
    const d5 = await r5.json();
    if (d5.error) {
      results.push({ test: 'Payment Intent', status: 'FAIL', error: d5.error });
    } else {
      results.push({
        test: 'Payment Intent',
        status: 'PASS',
        id: d5.id,
        merchant: d5.merchant?.name,
        city: d5.merchant?.city,
        bank: d5.bank_code,
        amount_idr: d5.amount_details?.fiat_amount,
        crypto_amount: d5.amount_details?.crypto_amount,
        platformFee: d5.platformFee,
        feePercent: d5.effectiveFeePercent?.toFixed(2) + '%'
      });

      // TEST 6: Solana Pay TX Generation
      try {
        const r6 = await fetch('http://localhost:3000/solana-pay/' + d5.id, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ account: 'GsbwXfJraMomNxBcjK93pMFqBgHxBBdN6dDkPbEoAUhg' })
        });
        const d6 = await r6.json();
        results.push({
          test: 'Swap TX Generation',
          status: d6.transaction ? 'PASS' : 'FAIL',
          txLength: d6.transaction?.length || 0,
          error: d6.error || null
        });
      } catch (e) {
        results.push({ test: 'Swap TX Generation', status: 'FAIL', error: e.message });
      }
    }
  } catch (e) {
    results.push({ test: 'Payment Intent', status: 'FAIL', error: e.message });
  }

  // OUTPUT RESULTS
  console.log(JSON.stringify(results, null, 2));

  const passed = results.filter(r => r.status === 'PASS').length;
  const total = results.length;
  console.log(`\n=== ${passed}/${total} TESTS PASSED ===`);
}

runTests();

