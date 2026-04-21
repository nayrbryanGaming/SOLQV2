import fetch from 'node-fetch';

const baseUrl = process.env.STRESS_BASE_URL || 'https://solq.vercel.app/api/v1';
const total = Math.max(1, Number(process.env.STRESS_TOTAL || '1000'));
const concurrency = Math.max(1, Number(process.env.STRESS_CONCURRENCY || '25'));
const timeoutMs = Math.max(100, Number(process.env.STRESS_TIMEOUT_MS || '10000'));

// Minimal EMV-like payload for backend parser path.
const qrisPayload = process.env.STRESS_QRIS_PAYLOAD ||
  '00020101021126650016COM.NOBUBANK.WWW011893600503000008791402149130009188440303UMI51440014ID.CO.QRIS.WWW0215ID10243244592860303UMI5204549953033605802ID5918TEST MERCHANT 01 6007JAKARTA6105123406304ABCD';

type Sample = { ok: boolean; durationMs: number };

async function createIntent(index: number): Promise<Sample> {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/payment-intents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        qris_payload: qrisPayload,
        currency: 'IDRX',
        input_amount: 1000 + (index % 9000),
      }),
    });

    return { ok: response.status === 200, durationMs: Date.now() - started };
  } catch (_) {
    return { ok: false, durationMs: Date.now() - started };
  } finally {
    clearTimeout(timeout);
  }
}

async function worker(workerId: number, jobs: number[]): Promise<{ ok: number; fail: number; latencies: number[] }> {
  let ok = 0;
  let fail = 0;
  const latencies: number[] = [];

  for (const job of jobs) {
    const sample = await createIntent(job);
    latencies.push(sample.durationMs);
    if (sample.ok) ok++;
    else fail++;

    if ((ok + fail) % 100 === 0) {
      process.stdout.write(`[worker ${workerId}] processed ${ok + fail}\n`);
    }
  }

  return { ok, fail, latencies };
}

function splitJobs(count: number, buckets: number): number[][] {
  const groups: number[][] = Array.from({ length: buckets }, () => []);
  for (let i = 0; i < count; i++) {
    groups[i % buckets].push(i);
  }
  return groups;
}

function percentile(sorted: number[], pct: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((pct / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

(async () => {
  const started = Date.now();
  const groups = splitJobs(total, concurrency);

  const results = await Promise.all(groups.map((jobs, idx) => worker(idx + 1, jobs)));

  const ok = results.reduce((sum, r) => sum + r.ok, 0);
  const fail = results.reduce((sum, r) => sum + r.fail, 0);
  const latencies = results.flatMap((r) => r.latencies).sort((a, b) => a - b);
  const elapsedSec = (Date.now() - started) / 1000;
  const reqPerSec = total / Math.max(1, elapsedSec);
  const okPerSec = ok / Math.max(1, elapsedSec);
  const successRate = (ok / Math.max(1, total)) * 100;
  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  const p99 = percentile(latencies, 99);

  console.log('--- STRESS RESULT ---');
  console.log(`Base URL     : ${baseUrl}`);
  console.log(`Total        : ${total}`);
  console.log(`Concurrency  : ${concurrency}`);
  console.log(`Timeout (ms) : ${timeoutMs}`);
  console.log(`Success      : ${ok}`);
  console.log(`Failed       : ${fail}`);
  console.log(`Success Rate : ${successRate.toFixed(2)}%`);
  console.log(`Elapsed (s)  : ${elapsedSec.toFixed(2)}`);
  console.log(`Req/s (all)  : ${reqPerSec.toFixed(2)}`);
  console.log(`Req/s (ok)   : ${okPerSec.toFixed(2)}`);
  console.log(`Latency p50  : ${p50.toFixed(0)} ms`);
  console.log(`Latency p95  : ${p95.toFixed(0)} ms`);
  console.log(`Latency p99  : ${p99.toFixed(0)} ms`);

  process.exit(fail > 0 ? 1 : 0);
})();
