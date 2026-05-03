/**
 * IDRX API Live Test
 * Run: node test-idrx.js
 * Tests auth signature + all known endpoints against api.idrx.co
 */
require('dotenv').config();
const crypto = require('crypto');
const fetch = require('node-fetch');

const API_KEY    = process.env.IDRX_API_KEY    || '';
const SECRET_KEY = process.env.IDRX_SECRET_KEY || '';
const BASE_URL   = process.env.IDRX_API_URL    || 'https://api.idrx.co';

if (!API_KEY || !SECRET_KEY) {
    console.error('❌ IDRX_API_KEY or IDRX_SECRET_KEY not set in .env');
    process.exit(1);
}

// ── Signature (same logic as bankPartnerService.ts) ──────────────────────────
function buildSecret() {
    const isHex = SECRET_KEY.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(SECRET_KEY);
    if (isHex) return Buffer.from(SECRET_KEY, 'hex');
    try {
        const buf = Buffer.from(SECRET_KEY, 'base64');
        if (buf.length >= 16) return buf;
    } catch {}
    return Buffer.from(SECRET_KEY, 'utf8');
}

function sign(method, urlPath, body, timestamp) {
    const secret = buildSecret();
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(timestamp);
    hmac.update(method);
    hmac.update(urlPath);
    if (body) hmac.update(body);
    return hmac.digest('base64url');
}

function headers(method, urlPath, body = '') {
    const ts = Date.now().toString();
    return {
        'Content-Type': 'application/json',
        'idrx-api-key': API_KEY,
        'idrx-api-sig': sign(method, urlPath, body, ts),
        'idrx-api-ts':  ts,
    };
}

// ── Test endpoints ────────────────────────────────────────────────────────────
const TESTS = [
    { method: 'GET',  path: '/health' },
    { method: 'GET',  path: '/api/v1/health' },
    { method: 'GET',  path: '/api/v1/me' },
    { method: 'GET',  path: '/api/v1/user/me' },
    { method: 'GET',  path: '/api/v1/member/me' },
    { method: 'GET',  path: '/api/v1/auth/verify' },
    { method: 'GET',  path: '/api/v1/transaction/rates' },
    { method: 'GET',  path: '/api/v1/transactions' },
    { method: 'GET',  path: '/api/v1/bank-accounts' },
    { method: 'GET',  path: '/api/v1/wallet/balance' },
    { method: 'GET',  path: '/api/v1/balance' },
];

async function run() {
    const secretBuf = buildSecret();
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  IDRX API Live Test');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  Base URL : ${BASE_URL}`);
    console.log(`  API Key  : ${API_KEY.substring(0, 8)}...`);
    console.log(`  Secret   : ${SECRET_KEY.length} chars → decoded as ${/^[0-9a-fA-F]+$/.test(SECRET_KEY) && SECRET_KEY.length % 2 === 0 ? 'HEX' : 'BASE64'} → ${secretBuf.length} bytes`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    for (const t of TESTS) {
        try {
            const h = headers(t.method, t.path);
            const res = await fetch(`${BASE_URL}${t.path}`, {
                method: t.method,
                headers: h,
                timeout: 10000,
            });
            const body = await res.text();
            const preview = body.substring(0, 120).replace(/\n/g, ' ');

            let icon = res.status === 200 ? '✅' : res.status === 404 ? '⬜' : res.status === 401 ? '🔑' : res.status === 403 ? '🔒' : '⚠️';
            console.log(`${icon} [${res.status}] ${t.method} ${t.path}`);
            if (res.status !== 404) console.log(`         ${preview}`);
        } catch (e) {
            console.log(`❌ [ERR] ${t.method} ${t.path} → ${e.message}`);
        }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Legend: ✅ 200 OK  ⬜ 404 not deployed  🔑 401 auth fail  🔒 403 forbidden');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

run().catch(console.error);
