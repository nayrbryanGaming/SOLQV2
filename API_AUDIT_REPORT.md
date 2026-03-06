# ═══════════════════════════════════════════════════════════════════════════════
#  SOLQ API AUDIT REPORT - FULL TRANSPARENCY
#  Date: 4 March 2026
#  Status: PRODUCTION MAINNET
# ═══════════════════════════════════════════════════════════════════════════════

## 📋 DAFTAR SEMUA API YANG DIGUNAKAN

### ✅ API GRATIS (TANPA API KEY / REGISTRATION)

| # | API | URL | Digunakan di | Status | Rate Limit |
|---|-----|-----|-------------|--------|------------|
| 1 | **Jupiter Quote API v6** | `https://quote-api.jup.ag/v6/quote` | Flutter + Backend | ✅ 100% GRATIS | ~600 req/min |
| 2 | **Jupiter Swap API v6** | `https://quote-api.jup.ag/v6/swap` | Backend | ✅ 100% GRATIS | ~600 req/min |
| 3 | **Jupiter Price API v2** | `https://api.jup.ag/price/v2` | Flutter (fallback) | ✅ 100% GRATIS | ~600 req/min |
| 4 | **CoinGecko Public API** | `https://api.coingecko.com/api/v3/simple/price` | Flutter + Backend | ✅ GRATIS (rate limited) | 10-30 req/min |
| 5 | **ExchangeRate-API** | `https://api.exchangerate-api.com/v4/latest/USD` | Flutter (fallback) | ✅ GRATIS | 1500 req/month |
| 6 | **Solana Mainnet RPC** | `https://api.mainnet-beta.solana.com` | Flutter + Backend | ✅ GRATIS (public) | Throttled |
| 7 | **Alchemy Solana RPC** | `https://solana-mainnet.g.alchemy.com/v2/demo` | Flutter + Backend (failover) | ✅ GRATIS (demo) | Limited |
| 8 | **Ankr Solana RPC** | `https://rpc.ankr.com/solana` | Flutter + Backend (failover) | ✅ GRATIS (public) | Limited |

**Total API Gratis: 8 API — TIDAK BUTUH API KEY**

---

### ⚠️ API YANG BUTUH REGISTRASI MANUAL (BELUM ADA KEY)

| # | API | ENV Variable | Digunakan di | Status | Cara Dapat |
|---|-----|-------------|-------------|--------|-----------|
| 1 | **IDRX / Stabelify** | `IDRX_API_KEY` | Backend (settlement) | ❌ BELUM ADA KEY | Hubungi Nael @ Stabelify/IDRX |
| 2 | **CoinGecko Pro** | `COINGECKO_API_KEY` | Flutter + Backend | ⚠️ OPTIONAL | https://www.coingecko.com/en/api/pricing (gratis 10k req/bulan) |
| 3 | **PJP Provider** | `PJP_API_KEY` | Backend (Xendit/Midtrans) | ⚠️ OPTIONAL (not used) | Xendit.co / Midtrans.com |

---

## 🔍 PENJELASAN DETAIL TIAP API

### 1. Jupiter API (GRATIS, NO KEY)
- **Quote API**: Mendapatkan harga swap SOL → IDRX real-time
- **Swap API**: Membuat transaksi swap yang siap ditandatangani user
- **Price API**: Fallback harga jika CoinGecko down
- **Dokumentasi**: https://station.jup.ag/docs/apis/swap-api
- **TIDAK PERNAH menyimpan private key user**

### 2. CoinGecko API (GRATIS, OPTIONAL KEY)
- **Public tier**: 10-30 request/menit TANPA KEY
- **Demo tier**: 10,000 request/bulan DENGAN FREE KEY
- **Digunakan**: Verifikasi harga oracle, circuit breaker
- **FAKTA**: Tanpa key pun sudah bisa jalan, key hanya untuk rate limit lebih tinggi

### 3. Solana RPC (GRATIS, NO KEY)
- **Public Mainnet**: Disediakan Solana Labs, gratis tapi throttled
- **Failover**: Alchemy demo + Ankr public RPC
- **Digunakan**: Cek saldo, verifikasi transaksi on-chain
- **PRODUKSI**: Untuk volume 30k+ transaksi/hari, WAJIB pakai Helius/Triton ($50-500/bulan)

### 4. ExchangeRate-API (GRATIS)
- **Digunakan**: Konversi USD → IDR (fallback jika CoinGecko dan Jupiter gagal)
- **Rate limit**: 1500 request/bulan (GRATIS)
- **Akurasi**: Data FX rate real-time dari bank sentral

### 5. IDRX/Stabelify API (BUTUH REGISTRASI) ❌
- **Ini adalah SATU-SATUNYA API yang butuh registrasi manual**
- **Fungsi**: Off-ramp IDRX → IDR ke rekening bank merchant
- **Status**: `IDRX_API_KEY=YOUR_STABELIFY_API_KEY_HERE` ← BELUM DIISI
- **DAMPAK**: Tanpa key ini, settlement ke bank TIDAK BISA JALAN
- **SOLUSI**: Hubungi tim IDRX/Stabelify untuk mendapatkan production API key

---

## 🛡️ AUDIT KEAMANAN

### ✅ YANG SUDAH AMAN

| Aspek | Status | Detail |
|-------|--------|--------|
| Private Key Storage | ✅ AMAN | App TIDAK PERNAH menyimpan private key |
| Seed Phrase | ✅ AMAN | TIDAK ada input seed phrase di app |
| Backend Signing | ✅ AMAN | Backend TIDAK menandatangani transaksi |
| On-Chain Verification | ✅ AMAN | Semua status berdasarkan finalized on-chain |
| Oracle Manipulation | ✅ AMAN | Circuit breaker 2.5% deviation |
| Multi-Oracle | ✅ AMAN | 3 sumber harga (CoinGecko, Jupiter, FX API) |
| Multi-RPC | ✅ AMAN | 3 RPC endpoint dengan failover otomatis |
| QRIS CRC Validation | ✅ AMAN | CRC-16/CCITT-FALSE verified |
| Rate Limiting | ✅ AMAN | 60 req/min per IP di backend |
| Input Validation | ✅ AMAN | QRIS payload, amount, wallet address, tx_hash validated |
| Security Headers | ✅ AMAN | X-Frame-Options, CSP, HSTS, XSS-Protection |
| Request Size Limit | ✅ AMAN | Max 50kb per request (Anti-DDoS) |
| Network Security | ✅ AMAN | HTTPS enforced for all external API calls |
| Audit Logging | ✅ AMAN | SHA-256 integrity hash per log entry |
| Memory Cleanup | ✅ AMAN | GC setiap 1 jam untuk intent > 24 jam |
| Stuck TX Detection | ✅ AMAN | Reconciliation worker setiap 60 detik |
| Wallet Persistence | ✅ AMAN | Base58 validation sebelum restore |

### ⚠️ CATATAN PENTING

1. **IDRX_API_KEY belum diisi** → Settlement ke bank belum bisa jalan
   - Flow on-chain (scan QRIS → swap SOL → IDRX) sudah 100% berfungsi
   - Yang belum: off-ramp IDRX → IDR ke rekening bank
   
2. **treasuryIdrxAta hardcoded** → `QVpWTCsVLDSLusuwNu3ucEQmeDUjCid1kap5qXzii38`
   - Ini Associated Token Account dari Treasury wallet
   - HARUS diverifikasi bahwa ATA ini benar-benar milik treasury wallet
   - Jika salah, platform fee tidak akan masuk ke treasury

3. **Cleartext HTTP** → Masih diizinkan untuk local dev backend (192.168.*.*)
   - Production WAJIB gunakan HTTPS backend
   - Network security config sudah dibuat untuk membatasi cleartext

---

## 🔄 FLOW YANG BENAR-BENAR BERJALAN (TANPA API KEY MANUAL)

```
[1] User connect wallet (Phantom/Solflare) → ✅ GRATIS (deep link)
[2] User scan QRIS                         → ✅ GRATIS (camera + local parsing)
[3] Fetch harga SOL/IDR                    → ✅ GRATIS (CoinGecko public API)
[4] Get swap quote SOL → IDRX             → ✅ GRATIS (Jupiter Quote API)
[5] Build swap transaction                  → ✅ GRATIS (Jupiter Swap API)
[6] User sign di wallet                    → ✅ GRATIS (wallet signing, user bayar gas ~0.000005 SOL)
[7] Verify on-chain (finalized)            → ✅ GRATIS (Solana public RPC)
[8] Settlement IDRX → IDR ke bank          → ❌ BUTUH IDRX_API_KEY (manual registration)
```

**Kesimpulan: Step 1-7 sudah 100% berjalan GRATIS tanpa API key manual.**
**Step 8 (off-ramp ke bank) butuh partnership dengan IDRX/Stabelify.**

---

## 📊 BIAYA OPERASIONAL BULANAN (ESTIMASI)

| Komponen | Gratis Tier | Production Tier |
|----------|------------|-----------------|
| Jupiter API | $0 | $0 (gratis) |
| CoinGecko | $0 (public) | $0 (demo key gratis) |
| Solana RPC | $0 (public) | $50-200/bulan (Helius) |
| FX Rate API | $0 | $0 |
| Server (Backend) | $0 (lokal) | $20-50/bulan (VPS) |
| **TOTAL** | **$0** | **$70-250/bulan** |

---

Generated by SOLQ Audit System
Date: 2026-03-04

---

## 🐛 BUG AUDIT LOG (SEMUA SUDAH DIPERBAIKI)

| # | BUG | Severity | File | Status |
|---|-----|----------|------|--------|
| 1 | Duplicate `if (_intent == null)` di `_buildBody()` — dead code path | LOW | `main.dart:228` | ✅ FIXED |
| 2 | Wallet buttons overflow di ListView tanpa Wrap layout | MEDIUM | `main.dart:355` | ✅ FIXED |
| 3 | State `CREATED` tidak ada tombol PAY — user stuck setelah scan QRIS | **CRITICAL** | `main.dart:620` | ✅ FIXED |
| 4 | Static QRIS (amount=0) tidak trigger `pendingAmount` state — numpad tidak muncul | **CRITICAL** | `orchestrator_service.dart:106` | ✅ FIXED |
| 5 | Dead code `_buildFeeDetail` widget tidak pernah dipanggil | LOW | `main.dart:715` | ✅ REMOVED |
| 6 | `IDRX_API_KEY` placeholder `YOUR_STABELIFY_API_KEY_HERE` lolos validasi | **CRITICAL** | `bankPartnerService.ts:29` | ✅ FIXED |
| 7 | Backend `createPaymentTransaction` tidak validate amount > 0 untuk static QRIS | HIGH | `solanaService.ts:48` | ✅ FIXED |
| 8 | Tidak ada duplicate tx_hash detection — replay attack possible | **CRITICAL** | `paymentRoutes.ts:110` | ✅ FIXED |
| 9 | Failed state tidak punya dedicated UI view — user stuck pada error | HIGH | `main.dart` | ✅ FIXED (added `_buildFailedView`) |
| 10 | Amount max tidak dibatasi — bisa input >100M IDR | MEDIUM | `paymentRoutes.ts:25`, `solanaService.ts:50` | ✅ FIXED |


