# SOLQ 2.0 — Solana × QRIS Payment Orchestrator

> **Pay any Indonesian QRIS merchant with SOL, USDC, or IDRX — instantly, non-custodially, on Solana Mainnet.**

[![Solana Mainnet](https://img.shields.io/badge/Solana-Mainnet--Beta-9945FF?logo=solana&logoColor=white)](https://explorer.solana.com/address/ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m)
[![Live App](https://img.shields.io/badge/Live%20App-solq.vercel.app-00FF94?logo=vercel&logoColor=black)](https://solq.vercel.app)
[![Simulator](https://img.shields.io/badge/Simulator-solq--demo.vercel.app-A855F7?logo=vercel&logoColor=white)](https://solq-demo.vercel.app)
[![Jupiter ExactOut](https://img.shields.io/badge/Jupiter-ExactOut%20Swap-00D18C)](https://jup.ag)
[![IDRX Stablecoin](https://img.shields.io/badge/IDRX-1%3A1%20IDR%20Peg-0066CC)](https://idrx.co)
[![Flutter](https://img.shields.io/badge/Flutter-3.x-02569B?logo=flutter&logoColor=white)](https://flutter.dev)
[![OJK Compliant](https://img.shields.io/badge/OJK-APU%2FPPT%20Compliant-green)](https://ojk.go.id)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Colosseum Hackathon](https://img.shields.io/badge/Colosseum-Hackathon%202026-FF6B00)](https://www.colosseum.org)

---

| | |
|---|---|
| **Live App (Real Wallet)** | [solq.vercel.app](https://solq.vercel.app) |
| **Simulator (Demo)** | [solq-demo.vercel.app](https://solq-demo.vercel.app) |
| **Primary Repo** | [github.com/nayrbryanGaming/solq](https://github.com/nayrbryanGaming/solq) |
| **Mirror Repo** | [github.com/nayrbryanGaming/SOLQV2](https://github.com/nayrbryanGaming/SOLQV2) |
| **Treasury Wallet** | [`ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m`](https://explorer.solana.com/address/ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m) |
| **IDRX Mint** | [`idrxZcP8xiKkYk6XGD4uz1dxEYCWSgKDHqgjsBbwDur`](https://explorer.solana.com/address/idrxZcP8xiKkYk6XGD4uz1dxEYCWSgKDHqgjsBbwDur) |

---

## Production Status

| Status | Guarantee |
|--------|-----------|
| **ZERO CUSTODY** | Private key never enters SOLQ servers |
| **ZERO MOCK** | All transactions on real mainnet |
| **REAL MAINNET** | Every TX verified on-chain, Solana Mainnet-Beta |
| **SCANNER STABLE** | Zero black screen — lifecycle hardened |
| **WALLET HARDENED** | `account_key` extraction verified, zero parsing errors |
| **QRIS ROBUST** | 100+ banks & e-wallets, static + dynamic, locked-nominal detection |
| **CLOUD-FIRST** | Rejects localhost, auto-fallback to Vercel/Render |
| **AUDIT COMPLIANT** | SHA-256 immutable log, 5-year retention |

---

# ENGLISH

## Table of Contents

1. [What Is SOLQ?](#what-is-solq)
2. [The Problem](#the-problem)
3. [SOLQ as Orchestrator, Not Vendor](#solq-as-orchestrator-not-vendor)
4. [Payment Flow End-to-End](#payment-flow-end-to-end)
5. [System Architecture](#system-architecture)
6. [Key Features](#key-features)
7. [Fee Structure](#fee-structure)
8. [On-Chain Proof](#on-chain-proof)
9. [Tech Stack](#tech-stack)
10. [Quick Start](#quick-start)
11. [Environment Variables](#environment-variables)
12. [Security Model](#security-model)
13. [Compliance](#compliance)
14. [Roadmap](#roadmap)

---

## What Is SOLQ?

SOLQ is a **non-custodial payment orchestration layer** that bridges Solana's DeFi ecosystem with Indonesia's **30+ million QRIS merchant network**.

**SOLQ is not a payment gateway. SOLQ is not a fintech company. SOLQ is not a bank.**

SOLQ is a **tool orchestrator** — a coordination layer that simultaneously manages four existing technologies so that crypto users can pay at any QRIS merchant without a custodial intermediary:

| Orchestrated Protocol | Role in SOLQ |
|---|---|
| **Jupiter DEX Aggregator** | Computes the best ExactOut swap: exactly how much SOL/USDC for an exact IDR output |
| **IDRX Stablecoin** | 1:1 IDR bridge — merchants still receive Rupiah in their existing bank accounts |
| **Solana Mainnet** | On-chain transaction rails — permanent, verifiable, ~400ms finality |
| **QRIS EMVCo Standard** | TLV parsing + CRC-16/CCITT-FALSE validation per Bank Indonesia regulations |

**The result:** A user scans any QRIS merchant code → confirms in Phantom/MWA wallet → the merchant immediately receives IDR in their bank account/e-wallet — **with zero changes required on the merchant's side.**

---

## The Problem

Indonesia has over **30 million active QRIS merchants** (Bank Indonesia, 2024). Meanwhile, millions of Solana DeFi users across Southeast Asia hold SOL, USDC, IDRX.

### The Friction Gap (Before SOLQ)

```mermaid
flowchart TD
    A([Hold SOL/USDC in Phantom]) --> B[Transfer to centralized exchange]
    B --> C[Sell to IDR\nt+0 to t+2]
    C --> D[Withdraw to bank account\nfee + 1–48h wait]
    D --> E[Open mobile banking]
    E --> F([Scan and pay QRIS])

    style A fill:#1e1e2e,color:#cdd6f4,stroke:#6c7086
    style F fill:#313244,color:#cdd6f4,stroke:#6c7086
    style C fill:#45475a,color:#f38ba8,stroke:#f38ba8
    style D fill:#45475a,color:#f38ba8,stroke:#f38ba8
```

**Total: 1–48 hours. Cost: 1.5–3%.**

### SOLQ's Solution

```mermaid
flowchart TD
    A([Hold SOL/USDC in Phantom]) --> B[Open SOLQ — Scan QRIS]
    B --> C[Confirm in Phantom / MWA\n~3 seconds]
    C --> D([Merchant receives IDR\n~400ms finality])

    style A fill:#1e3a1e,color:#a6e3a1,stroke:#a6e3a1
    style B fill:#1e3a1e,color:#a6e3a1,stroke:#a6e3a1
    style C fill:#1e3a1e,color:#a6e3a1,stroke:#a6e3a1
    style D fill:#1e3a1e,color:#a6e3a1,stroke:#a6e3a1
```

**Total: 1 tap. Cost: 0.5% platform fee + ~Rp 0.02 network fee.**

---

## SOLQ as Orchestrator, Not Vendor

| Aspect | Payment Vendor / Gateway | SOLQ (Tool Orchestrator) |
|---|---|---|
| Holds user funds? | Yes (custodial) | **Never** |
| Holds private keys? | Sometimes | **Never** |
| Merchant registration required? | Yes | **No** — QRIS already exists |
| Merchant changes required? | Yes | **No** — IDR lands in existing account |
| User KYC required? | Usually | **No** — wallet-first, pseudonymous |
| Settlement path | Via SOLQ's account | **Direct via IDRX → merchant bank** |
| Regulatory category | OJK PJP (requires license) | Non-custodial orchestration layer |
| Counterparty risk | Yes | **None** — funds never reside at SOLQ |

**Analogy:** Google Maps isn't a taxi — it finds the fastest route. SOLQ isn't a bank — it orchestrates the fastest path to pay QRIS with crypto.

---

## Payment Flow End-to-End

```mermaid
sequenceDiagram
    participant U as User
    participant S as SOLQ Orchestrator
    participant J as Jupiter Lite API
    participant W as Phantom / MWA Wallet
    participant R as Solana RPC
    participant I as IDRX / BI-FAST
    participant DB as PostgreSQL AuditLog

    U->>S: Scan QRIS merchant code
    S->>S: EMVCo TLV decode + CRC-16/CCITT-FALSE validation
    S->>S: Extract merchant_name, NMID, bank_code, amount_mode
    Note over S: LOCKED_FROM_QR vs INPUT_REQUIRED — 100+ bank/e-wallet detection

    S->>J: ExactOut quote — "How much SOL for Rp 50,000?"
    J-->>S: inAmount (exact SOL/USDC) + route + platformFeeBps=50

    S->>S: Deterministic pricing — CoinGecko → Jupiter+FX → Binance+FX
    Note over S: 60s cache, 2min staleness limit

    S-->>U: Payment intent — SOL amount, platform fee, network fee, slippage
    Note over U: ALL fees shown BEFORE confirmation

    U->>W: Confirm transaction
    W-->>S: Signed TX (private key never leaves wallet)

    S->>R: On-chain verify — Helius → QuickNode → Alchemy → Ankr → public
    S->>S: Replay attack block (tx_hash uniqueness)
    S->>S: Payer mismatch check
    S->>S: Risk Engine — score 0-100, 4 tiers (LOW/MEDIUM/HIGH/BLOCK)

    S->>I: IDRX disbursement → BI-FAST / GPN / GoPay / OVO
    I-->>U: Merchant receives IDR in existing bank account

    S->>DB: SHA-256 event hash logged — 5-year retention
```

---

## System Architecture

```mermaid
graph TD
    subgraph CLIENT["Client Layer"]
        APK1["apk-live\nMainnet · Real TX · Security ON"]
        APK2["apk-demo\nDevnet · Simulation · Security ON"]
        APK3["apk-nosec\nMainnet · Real TX · Security OFF"]
        APK4["apk-demo-nosec\nDevnet · Simulation · Security OFF"]
        WEB1["web-live\nsolq.vercel.app"]
        WEB2["web-demo\nsolq.vercel.app/demo"]
    end

    subgraph API["API Layer — Vercel Serverless Functions (Node.js ESM)"]
        PI["POST /v1/payment-intents\nQRIS decode + Jupiter ExactOut quote"]
        SP["GET /solana-pay/:id\nBuild unsigned Solana Pay TX"]
        CF["POST /v1/payment-intents/:id/confirm\nOn-chain verify · Risk Engine · IDRX off-ramp"]
    end

    subgraph ECO["Ecosystem"]
        JUP["Jupiter Lite API\nlite-api.jup.ag\nExactOut swap"]
        IDRX["IDRX API\nidrx.co\nIDR off-ramp"]
        RPC["Solana RPC\nHelius → QuickNode\n→ Alchemy → Ankr"]
        DB["PostgreSQL\nAudit log · SHA-256\n5-year retention"]
    end

    CLIENT -->|HTTPS| API
    PI --> JUP
    SP --> RPC
    CF --> RPC
    CF --> IDRX
    CF --> DB
```

---

## Key Features

| Feature | Implementation Detail |
|---|---|
| **EMVCo QRIS Parsing** | Full TLV decoder (tags 00-99), CRC-16/CCITT-FALSE per §2.9, static & dynamic QR, permissive mode for SME stickers |
| **QRIS Locked-Nominal Detection** | `amountMode: LOCKED_FROM_QR` vs `INPUT_REQUIRED` — shown to user before confirmation |
| **100+ Bank/E-Wallet Detection** | `detectBank()` covers BRI, BNI, BCA, Mandiri, BTN, BSI, 30+ BPD, CIMB, Permata, GoPay, OVO, Dana, ShopeePay, LinkAja, Jenius, Jago, SeaBank, Blu, Neo, Allo, DOKU, Xendit, and more |
| **Jupiter ExactOut** | Real-time quote — exact SOL/USDC for exact IDR. `platformFeeBps=50`, `swapMode=ExactOut` |
| **Non-Custodial** | Phantom ECDH deep link (X25519 + NaCl secretbox) + MWA Android. Private key never leaves wallet. |
| **Scanner Stabilization** | MobileScanner lifecycle hardening — controller reused, not destroyed. Zero black screen. |
| **Multi-RPC Failover** | Helius → QuickNode → Alchemy → Ankr → public. Auto-switch, zero downtime. |
| **Replay Attack Protection** | `tx_hash` uniqueness per intent — once used, rejected permanently. |
| **IDRX Off-Ramp** | 1:1 IDR stablecoin → bank / GoPay / OVO via BI-FAST/GPN. Zero merchant changes. |
| **Risk Engine** | Score 0-100, 4 tiers: LOW / MEDIUM / HIGH / BLOCK. OFAC = auto-block (score 100). |
| **OJK Audit Log** | SHA-256 integrity hash per event. 3-tier: console / JSONL / WORM webhook. 5-year retention. |
| **Android Phone Chrome** | Web apps show authentic Android status bar (time, signal, battery) + nav bar (back/home/recents) |

---

---

## Fee Structure

| Component | Cost | Who Pays |
|---|---|---|
| Solana network fee | ~Rp 0.02 (0.000005 SOL) | User |
| Jupiter swap slippage | ≤0.5% (1% tolerance) | User |
| **SOLQ platform fee** | **0.5% (min. Rp 2,500)** | User |
| Legacy QRIS MDR | 0.3% – 2% | Merchant (SOLQ eliminates this) |

> **Fee distribution (0.5%):**
> - **70%** → Treasury: [`ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m`](https://explorer.solana.com/address/ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m)
> - **30%** → Dev: [`35z7X59rtyts557Up1RAwpyYN7x2cFqcDc7RjPuNxFzr`](https://explorer.solana.com/address/35z7X59rtyts557Up1RAwpyYN7x2cFqcDc7RjPuNxFzr)

> `PLATFORM_FEE_BPS = 50`, `MIN_FEE_IDR = 2500`. These values are locked.

---

## On-Chain Proof

| Asset | Address |
|---|---|
| **Treasury Wallet** | [`ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m`](https://explorer.solana.com/address/ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m) |
| **Dev Wallet** | [`35z7X59rtyts557Up1RAwpyYN7x2cFqcDc7RjPuNxFzr`](https://explorer.solana.com/address/35z7X59rtyts557Up1RAwpyYN7x2cFqcDc7RjPuNxFzr) |
| **IDRX Mint** | [`idrxZcP8xiKkYk6XGD4uz1dxEYCWSgKDHqgjsBbwDur`](https://explorer.solana.com/address/idrxZcP8xiKkYk6XGD4uz1dxEYCWSgKDHqgjsBbwDur) |
| **SOL Mint** | `So11111111111111111111111111111111111111112` |
| **USDC Mint** | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| **Jupiter Lite API** | `https://lite-api.jup.ag/swap/v1` |

---

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| **Mobile** | Flutter 3.x (Dart) | Android & iOS |
| **Web App** | Vanilla HTML/JS | PWA — `solq.vercel.app` |
| **Backend** | Node.js 20 + Express + TypeScript | Strict mode |
| **Serverless** | Vercel Functions (ESM) | No build step |
| **Blockchain** | Solana Mainnet-Beta | `@solana/web3.js` |
| **DEX** | Jupiter v6 Lite API | ExactOut, `platformFeeBps=50` |
| **Stablecoin** | IDRX | 1:1 IDR peg, 2 decimals |
| **Wallet** | Phantom + Solflare + MWA | ECDH X25519 deep link |
| **Price Oracle** | CoinGecko Pro → Jupiter+FX → Binance+FX | 3-layer fallback |
| **Off-Ramp** | IDRX API | BI-FAST / GPN / GoPay / OVO |
| **Database** | PostgreSQL + Prisma | 5-year audit retention |
| **CI/CD** | GitHub Actions | Auto-mirror to SOLQV2 |

---

## Quick Start

### Prerequisites
- Node.js 20+, Flutter 3.x + Android SDK
- PostgreSQL 15+, Redis
- API keys: Helius RPC, CoinGecko, IDRX

### 1. Clone
```bash
git clone https://github.com/nayrbryanGaming/SOLQV2.git
cd SOLQV2
```

### 2. Web App (Zero Config)
```bash
npx serve . -p 3000
# Open http://localhost:3000 with Phantom extension installed
```

### 3. Flutter APK Builds
```bash
flutter pub get

# Production (mainnet, root detection ON)
bash apk-live/build.sh

# Simulation (devnet)
bash apk-demo/build.sh

# Demo / CEO presentation (mainnet, NO security checks)
bash apk-nosec/build.sh
```

### 4. Backend
```bash
cd backend
cp .env.example .env   # fill HELIUS_RPC_URL, IDRX_API_KEY, DATABASE_URL, REDIS_URL
npm install && npm run db:migrate && npm start
```

### 5. Verify Mainnet
```bash
curl https://solq.vercel.app/health
curl https://solq.vercel.app/v1/simulation/quote | jq .
```

---

## Environment Variables

**Minimum for Mainnet:**
```env
HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
DATABASE_URL=postgresql://user:pass@host:5432/solq_prod?sslmode=require
REDIS_URL=redis://your-redis:6379
IDRX_API_BASE_URL=https://api.idrx.co
IDRX_API_KEY=your_idrx_key
IDRX_SECRET_KEY=your_idrx_secret

# Fee config — DO NOT CHANGE
PLATFORM_SPREAD_BPS=50
MIN_FEE_IDR=2500
SOLQ_FEE_WALLET=ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m
```

---

## Security Model

| Aspect | Implementation |
|---|---|
| **Non-Custodial** | SOLQ orchestrates but never signs. Private key stays in user's wallet. |
| **CRC-16 Validation** | Every QRIS payload validated per EMVCo §2.9 — fatal error on mismatch. |
| **Replay Protection** | `tx_hash` stored and rejected permanently if resubmitted. |
| **Payer Mismatch** | On-chain signer cross-checked against wallet that initiated the request. |
| **Rate Limiting** | 60 req/min/IP, in-process, no Redis dependency. |
| **Risk Engine** | OFAC = auto-block. 4-tier: LOW / MEDIUM / HIGH / BLOCK. |
| **Hot Wallet Monitor** | Every 15 min. Auto-pause if gas wallet < 0.1 SOL. |

---

## Compliance

| Standard | Implementation |
|---|---|
| **OJK APU/PPT** | SHA-256 integrity hash per event + WORM webhook |
| **5-Year Retention** | Datadog / Logtail / CloudWatch Object Lock |
| **EMVCo QRCPS MPM** | Full CRC-16/CCITT-FALSE — no bypass |
| **Non-Custodial** | Private key never transits SOLQ servers |
| **Bank Indonesia QRIS** | All valid QRIS formats per BI specification |

---

## Roadmap

### Phase 1 — Production Hardening (Complete ✅)
- [x] EMVCo QRIS parsing + CRC validation
- [x] Jupiter ExactOut swap integration
- [x] IDRX off-ramp
- [x] Non-custodial Phantom ECDH deep link + MWA Android
- [x] Multi-RPC failover
- [x] Replay attack & payer mismatch protection
- [x] Risk Engine (4-tier)
- [x] GitHub Actions auto-mirror
- [x] 100+ bank/e-wallet QRIS detection
- [x] Android phone chrome on web apps (status bar + nav bar)

### Phase 2 — Infrastructure (In Progress)
- [ ] PostgreSQL persistent store (replace in-memory on Vercel)
- [ ] Production Redis (BullMQ queue)
- [ ] Jito bundle priority inclusion
- [ ] Certificate pinning in Flutter HTTP client

### Phase 3 — Scale (Planned)
- [ ] AI Risk Engine v2
- [ ] Gas sponsorship (SOLQ absorbs Solana fee)
- [ ] QRIS Dynamic QR generation for crypto merchants
- [ ] iOS MWA support
- [ ] OJK PJP compliance framework

---

## Repository Mirror

| Repository | Role |
|---|---|
| [`nayrbryanGaming/solq`](https://github.com/nayrbryanGaming/solq) | Primary source |
| [`nayrbryanGaming/SOLQV2`](https://github.com/nayrbryanGaming/SOLQV2) | Auto-mirror (Law 8) |

---

## License

MIT © 2026 SOLQ Team — Vincentius Bryan Kwandou

---
---
---

# BAHASA INDONESIA

> **Bayar semua merchant QRIS Indonesia dengan SOL, USDC, atau IDRX — instan, non-custodial, on-chain di Solana Mainnet.**

## Daftar Isi

1. [Apa itu SOLQ?](#apa-itu-solq)
2. [Masalah yang Diselesaikan](#masalah-yang-diselesaikan)
3. [SOLQ sebagai Orkestrator, Bukan Vendor](#solq-sebagai-orkestrator-bukan-vendor)
4. [Alur Pembayaran End-to-End](#alur-pembayaran-end-to-end)
5. [Arsitektur Sistem](#arsitektur-sistem)
6. [Fitur Utama](#fitur-utama)
7. [Struktur Biaya](#struktur-biaya)
8. [Bukti On-Chain](#bukti-on-chain)
9. [Tech Stack](#tech-stack-id)
10. [Quick Start](#quick-start-id)
11. [Environment Variables](#environment-variables-id)
12. [Model Keamanan](#model-keamanan)
13. [Kepatuhan Regulasi](#kepatuhan-regulasi)
14. [Roadmap](#roadmap-id)

---

## Status Produksi

| Status | Jaminan |
|--------|---------|
| **ZERO CUSTODY** | Private key tidak pernah masuk server SOLQ |
| **ZERO MOCK** | Semua transaksi di mainnet nyata |
| **REAL MAINNET** | Setiap TX terverifikasi on-chain, Solana Mainnet-Beta |
| **SCANNER STABLE** | Zero black screen — lifecycle hardened |
| **WALLET HARDENED** | Ekstraksi `account_key` terverifikasi, zero parsing error |
| **QRIS ROBUST** | 100+ bank & e-wallet, statis + dinamis, deteksi nominal terkunci |
| **CLOUD-FIRST** | Menolak localhost, auto-fallback ke Vercel/Render |
| **AUDIT COMPLIANT** | Log immutable SHA-256, retensi 5 tahun |

---

## Apa itu SOLQ?

SOLQ adalah **lapisan orkestrasi pembayaran non-kustodial** yang menjembatani ekosistem DeFi Solana dengan **30+ juta merchant QRIS Indonesia**.

**SOLQ bukan payment gateway. SOLQ bukan fintech. SOLQ bukan bank.**

SOLQ adalah **tool orchestrator** — lapisan koordinasi yang secara bersamaan mengelola empat teknologi yang sudah ada, sehingga pengguna kripto dapat membayar di merchant QRIS manapun tanpa perantara kustodial:

| Protokol | Peran di SOLQ |
|---|---|
| **Jupiter DEX Aggregator** | Menghitung swap ExactOut terbaik: tepat berapa SOL/USDC untuk output IDR yang pasti |
| **IDRX Stablecoin** | Jembatan 1:1 IDR — merchant tetap menerima Rupiah di rekening bank yang sudah ada |
| **Solana Mainnet** | Rel transaksi on-chain — permanen, terverifikasi, ~400ms finality |
| **QRIS EMVCo Standard** | TLV parsing + validasi CRC-16/CCITT-FALSE sesuai regulasi Bank Indonesia |

**Hasilnya:** User scan QRIS merchant mana pun → konfirmasi di wallet Phantom/MWA → merchant langsung menerima IDR di rekening bank/e-wallet — **tanpa perubahan apapun di sisi merchant.**

---

## Masalah yang Diselesaikan

Indonesia memiliki lebih dari **30 juta merchant QRIS aktif** (Bank Indonesia, 2024). Sementara itu, jutaan pengguna DeFi Solana di Asia Tenggara memegang SOL, USDC, IDRX.

### Friction Gap (Sebelum SOLQ)

```mermaid
flowchart TD
    A([Pegang SOL/USDC di Phantom]) --> B[Transfer ke exchange terpusat]
    B --> C[Jual ke IDR\nt+0 sampai t+2]
    C --> D[Tarik ke rekening bank\nbiaya + tunggu]
    D --> E[Buka mobile banking]
    E --> F([Scan & bayar QRIS])

    style A fill:#1e1e2e,color:#cdd6f4,stroke:#6c7086
    style F fill:#313244,color:#cdd6f4,stroke:#6c7086
    style C fill:#45475a,color:#f38ba8,stroke:#f38ba8
    style D fill:#45475a,color:#f38ba8,stroke:#f38ba8
```

**Total: 1–48 jam. Biaya: 1,5–3%.**

### Solusi SOLQ

```mermaid
flowchart TD
    A([Pegang SOL/USDC di Phantom]) --> B[Buka SOLQ — Scan QRIS]
    B --> C[Konfirmasi di Phantom / MWA\n~3 detik]
    C --> D([Merchant terima IDR\n~400ms finality])

    style A fill:#1e3a1e,color:#a6e3a1,stroke:#a6e3a1
    style B fill:#1e3a1e,color:#a6e3a1,stroke:#a6e3a1
    style C fill:#1e3a1e,color:#a6e3a1,stroke:#a6e3a1
    style D fill:#1e3a1e,color:#a6e3a1,stroke:#a6e3a1
```

**Total: 1 tap. Biaya: platform fee 0,5% + ~Rp 0,02 network fee.**

---

## SOLQ sebagai Orkestrator, Bukan Vendor

| Aspek | Payment Vendor / Gateway | SOLQ (Tool Orchestrator) |
|---|---|---|
| Simpan dana user? | Ya (kustodial) | **Tidak pernah** |
| Pegang private key? | Kadang | **Tidak pernah** |
| Merchant perlu daftar? | Ya | **Tidak** — QRIS sudah ada |
| Merchant perlu ubah sistem? | Ya | **Tidak** — IDR masuk ke rekening yang sudah ada |
| KYC user diperlukan? | Biasanya | **Tidak** — wallet-first, pseudonymous |
| Jalur settlement | Lewat akun SOLQ | **Langsung via IDRX → bank merchant** |
| Kategori regulasi | OJK PJP (wajib izin) | Non-custodial orchestration layer |
| Counterparty risk | Ya | **Tidak ada** — dana tidak pernah ada di SOLQ |

**Analogi:** Google Maps bukan taksi — ia mencari rute tercepat. SOLQ bukan bank — ia mengorkestrasikan jalur tercepat untuk bayar QRIS dengan kripto.

---

## Alur Pembayaran End-to-End

```mermaid
sequenceDiagram
    participant U as User
    participant S as SOLQ Orchestrator
    participant J as Jupiter Lite API
    participant W as Phantom / MWA Wallet
    participant R as Solana RPC
    participant I as IDRX / BI-FAST
    participant DB as PostgreSQL AuditLog

    U->>S: Scan kode QRIS merchant
    S->>S: Decode EMVCo TLV + validasi CRC-16/CCITT-FALSE
    S->>S: Ekstrak merchant_name, NMID, bank_code, amount_mode
    Note over S: LOCKED_FROM_QR vs INPUT_REQUIRED — deteksi 100+ bank/e-wallet

    S->>J: Quote ExactOut — "Berapa SOL untuk Rp 50.000?"
    J-->>S: inAmount (SOL/USDC exact) + route + platformFeeBps=50

    S->>S: Pricing deterministik — CoinGecko → Jupiter+FX → Binance+FX
    Note over S: Cache 60 detik, batas staleness 2 menit

    S-->>U: Payment intent — jumlah SOL, platform fee, network fee, slippage
    Note over U: SEMUA fee ditampilkan SEBELUM konfirmasi

    U->>W: Konfirmasi transaksi
    W-->>S: TX bertanda tangan (private key tidak pernah keluar dari wallet)

    S->>R: Verifikasi on-chain — Helius → QuickNode → Alchemy → Ankr → public
    S->>S: Blokir replay attack (keunikan tx_hash)
    S->>S: Pemeriksaan payer mismatch
    S->>S: Risk Engine — skor 0-100, 4 tier (LOW/MEDIUM/HIGH/BLOCK)

    S->>I: Disbursement IDRX → BI-FAST / GPN / GoPay / OVO
    I-->>U: Merchant menerima IDR di rekening yang sudah ada

    S->>DB: Hash event SHA-256 dicatat — retensi 5 tahun
```

---

## Arsitektur Sistem

```mermaid
graph TD
    subgraph CLIENT["Lapisan Klien"]
        APK1["apk-live\nMainnet · TX Nyata · Security ON"]
        APK2["apk-demo\nDevnet · Simulasi · Security ON"]
        APK3["apk-nosec\nMainnet · TX Nyata · Security OFF"]
        APK4["apk-demo-nosec\nDevnet · Simulasi · Security OFF"]
        WEB1["web-live\nsolq.vercel.app"]
        WEB2["web-demo\nsolq.vercel.app/demo"]
    end

    subgraph API["Lapisan API — Vercel Serverless Functions (Node.js ESM)"]
        PI["POST /v1/payment-intents\nDecode QRIS + Jupiter ExactOut quote"]
        SP["GET /solana-pay/:id\nBuat unsigned Solana Pay TX"]
        CF["POST /v1/payment-intents/:id/confirm\nVerifikasi on-chain · Risk Engine · IDRX off-ramp"]
    end

    subgraph ECO["Ekosistem"]
        JUP["Jupiter Lite API\nlite-api.jup.ag\nExactOut swap"]
        IDRX["IDRX API\nidrx.co\nIDR off-ramp"]
        RPC["Solana RPC\nHelius → QuickNode\n→ Alchemy → Ankr"]
        DB["PostgreSQL\nAudit log · SHA-256\nRetensi 5 tahun"]
    end

    CLIENT -->|HTTPS| API
    PI --> JUP
    SP --> RPC
    CF --> RPC
    CF --> IDRX
    CF --> DB
```

---

## Fitur Utama

| Fitur | Detail Implementasi |
|---|---|
| **Parsing QRIS EMVCo** | Decoder TLV lengkap (tag 00-99), CRC-16/CCITT-FALSE per §2.9, QR statis & dinamis, mode permissive untuk stiker SME |
| **Deteksi Nominal Terkunci QRIS** | `amountMode: LOCKED_FROM_QR` vs `INPUT_REQUIRED` — ditampilkan ke user sebelum konfirmasi |
| **100+ Bank/E-Wallet** | `detectBank()` mencakup BRI, BNI, BCA, Mandiri, BTN, BSI, 30+ BPD, CIMB, Permata, GoPay, OVO, Dana, ShopeePay, LinkAja, Jenius, Jago, SeaBank, Blu, Neo, Allo, DOKU, Xendit, dan lainnya |
| **Jupiter ExactOut** | Quote real-time — tepat berapa SOL/USDC untuk IDR yang pasti. `platformFeeBps=50`, `swapMode=ExactOut` |
| **Non-Custodial** | Phantom ECDH deep link (X25519 + NaCl secretbox) + MWA Android. Private key tidak pernah keluar dari wallet. |
| **Stabilisasi Scanner** | Hardening lifecycle MobileScanner — controller digunakan ulang, tidak dihancurkan. Zero black screen. |
| **Multi-RPC Failover** | Helius → QuickNode → Alchemy → Ankr → public. Auto-switch, zero downtime. |
| **Proteksi Replay Attack** | Keunikan `tx_hash` per intent — sekali digunakan, ditolak permanen. |
| **IDRX Off-Ramp** | Stablecoin 1:1 IDR → bank / GoPay / OVO via BI-FAST/GPN. Zero perubahan merchant. |
| **Risk Engine** | Skor 0-100, 4 tier: LOW / MEDIUM / HIGH / BLOCK. OFAC = auto-block (skor 100). |
| **OJK Audit Log** | Hash integritas SHA-256 per event. 3 tier: console / JSONL / WORM webhook. Retensi 5 tahun. |
| **Android Phone Chrome** | Web app menampilkan status bar Android asli (waktu, sinyal, baterai) + nav bar (back/home/recents) |

---

## Struktur Biaya

| Komponen | Biaya | Siapa yang Membayar |
|---|---|---|
| Solana network fee | ~Rp 0,02 (0,000005 SOL) | User |
| Jupiter swap slippage | ≤0,5% (toleransi 1%) | User |
| **SOLQ platform fee** | **0,5% (min. Rp 2.500)** | User |
| MDR QRIS lama | 0,3% – 2% | Merchant (SOLQ mengeliminasi ini) |

> **Distribusi fee (0,5%):**
> - **70%** → Treasury: [`ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m`](https://explorer.solana.com/address/ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m)
> - **30%** → Dev: [`35z7X59rtyts557Up1RAwpyYN7x2cFqcDc7RjPuNxFzr`](https://explorer.solana.com/address/35z7X59rtyts557Up1RAwpyYN7x2cFqcDc7RjPuNxFzr)

> `PLATFORM_FEE_BPS = 50`, `MIN_FEE_IDR = 2500`. Nilai-nilai ini terkunci.

---

## Bukti On-Chain

| Aset | Alamat |
|---|---|
| **Treasury Wallet** | [`ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m`](https://explorer.solana.com/address/ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m) |
| **Dev Wallet** | [`35z7X59rtyts557Up1RAwpyYN7x2cFqcDc7RjPuNxFzr`](https://explorer.solana.com/address/35z7X59rtyts557Up1RAwpyYN7x2cFqcDc7RjPuNxFzr) |
| **IDRX Mint** | [`idrxZcP8xiKkYk6XGD4uz1dxEYCWSgKDHqgjsBbwDur`](https://explorer.solana.com/address/idrxZcP8xiKkYk6XGD4uz1dxEYCWSgKDHqgjsBbwDur) |
| **SOL Mint** | `So11111111111111111111111111111111111111112` |
| **USDC Mint** | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| **Jupiter Lite API** | `https://lite-api.jup.ag/swap/v1` |

---

## Tech Stack (ID)

| Layer | Teknologi | Catatan |
|---|---|---|
| **Mobile** | Flutter 3.x (Dart) | Android & iOS |
| **Web App** | Vanilla HTML/JS | PWA — `solq.vercel.app` |
| **Backend** | Node.js 20 + Express + TypeScript | Strict mode |
| **Serverless** | Vercel Functions (ESM) | Tanpa build step |
| **Blockchain** | Solana Mainnet-Beta | `@solana/web3.js` |
| **DEX** | Jupiter v6 Lite API | ExactOut, `platformFeeBps=50` |
| **Stablecoin** | IDRX | Peg 1:1 IDR, 2 desimal |
| **Wallet** | Phantom + Solflare + MWA | ECDH X25519 deep link |
| **Price Oracle** | CoinGecko Pro → Jupiter+FX → Binance+FX | Fallback 3 lapis |
| **Off-Ramp** | IDRX API | BI-FAST / GPN / GoPay / OVO |
| **Database** | PostgreSQL + Prisma | Retensi audit 5 tahun |
| **CI/CD** | GitHub Actions | Auto-mirror ke SOLQV2 |

---

## Quick Start (ID)

### Prasyarat
- Node.js 20+, Flutter 3.x + Android SDK
- PostgreSQL 15+, Redis
- API key: Helius RPC, CoinGecko, IDRX

### 1. Clone
```bash
git clone https://github.com/nayrbryanGaming/SOLQV2.git
cd SOLQV2
```

### 2. Web App (Tanpa Config)
```bash
npx serve . -p 3000
# Buka http://localhost:3000 dengan ekstensi Phantom terpasang
```

### 3. Build APK Flutter
```bash
flutter pub get

# Produksi (mainnet, root detection ON)
bash apk-live/build.sh

# Simulasi (devnet)
bash apk-demo/build.sh

# Demo CEO / Presiden (mainnet, TANPA security check)
bash apk-nosec/build.sh

# Demo Simulasi (devnet, TANPA security check)
bash apk-demo-nosec/build.sh
```

### 4. Backend
```bash
cd backend
cp .env.example .env   # isi HELIUS_RPC_URL, IDRX_API_KEY, DATABASE_URL, REDIS_URL
npm install && npm run db:migrate && npm start
```

### 5. Verifikasi Mainnet
```bash
curl https://solq.vercel.app/health
curl https://solq.vercel.app/v1/simulation/quote | jq .
```

---

## Environment Variables (ID)

**Minimum untuk Mainnet:**
```env
HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
DATABASE_URL=postgresql://user:pass@host:5432/solq_prod?sslmode=require
REDIS_URL=redis://your-redis:6379
IDRX_API_BASE_URL=https://api.idrx.co
IDRX_API_KEY=your_idrx_key
IDRX_SECRET_KEY=your_idrx_secret

# Konfigurasi fee — JANGAN DIUBAH
PLATFORM_SPREAD_BPS=50
MIN_FEE_IDR=2500
SOLQ_FEE_WALLET=ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m
```

---

## Model Keamanan

| Aspek | Implementasi |
|---|---|
| **Non-Custodial** | SOLQ mengorkestrasikan tapi tidak pernah menandatangani. Private key tetap di wallet user. |
| **Validasi CRC-16** | Setiap payload QRIS divalidasi per EMVCo §2.9 — error fatal jika tidak cocok. |
| **Proteksi Replay** | `tx_hash` disimpan dan ditolak permanen jika dikirim ulang. |
| **Payer Mismatch** | Penanda tangan on-chain dicocokkan dengan wallet yang memulai request. |
| **Rate Limiting** | 60 req/menit/IP, in-process, tanpa ketergantungan Redis. |
| **Risk Engine** | OFAC = auto-block. 4 tier: LOW / MEDIUM / HIGH / BLOCK. |
| **Monitor Hot Wallet** | Setiap 15 menit. Auto-pause jika gas wallet < 0,1 SOL. |

---

## Kepatuhan Regulasi

| Standar | Implementasi |
|---|---|
| **OJK APU/PPT** | Hash integritas SHA-256 per event + WORM webhook |
| **Retensi 5 Tahun** | Datadog / Logtail / CloudWatch Object Lock |
| **EMVCo QRCPS MPM** | CRC-16/CCITT-FALSE penuh — tanpa bypass |
| **Non-Custodial** | Private key tidak pernah transit server SOLQ |
| **QRIS Bank Indonesia** | Semua format QRIS valid sesuai spesifikasi BI |

---

## Roadmap (ID)

### Fase 1 — Production Hardening (Selesai)
- [x] Parsing QRIS EMVCo + validasi CRC
- [x] Integrasi Jupiter ExactOut swap
- [x] IDRX off-ramp
- [x] Phantom ECDH deep link non-custodial + MWA Android
- [x] Multi-RPC failover
- [x] Proteksi replay attack & payer mismatch
- [x] Risk Engine (4 tier)
- [x] GitHub Actions auto-mirror
- [x] Deteksi QRIS 100+ bank/e-wallet
- [x] Android phone chrome di web app (status bar + nav bar)

### Fase 2 — Infrastruktur (Dalam Pengerjaan)
- [ ] PostgreSQL persistent store (gantikan in-memory di Vercel)
- [ ] Redis produksi (BullMQ queue)
- [ ] Jito bundle priority inclusion
- [ ] Certificate pinning di HTTP client Flutter

### Fase 3 — Skala (Direncanakan)
- [ ] AI Risk Engine v2
- [ ] Gas sponsorship (SOLQ menanggung Solana fee)
- [ ] Generasi QRIS Dynamic QR untuk merchant kripto
- [ ] Dukungan MWA iOS
- [ ] Framework kepatuhan OJK PJP

---

## Lisensi

MIT © 2026 SOLQ Team — Vincentius Bryan Kwandou
