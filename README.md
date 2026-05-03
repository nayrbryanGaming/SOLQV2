# SOLQ 2.0 — Solana × QRIS Payment Orchestrator

> **Pay any Indonesian QRIS merchant with SOL, USDC, or IDRX — instantly, non-custodially, on Solana Mainnet.**

[![Solana Mainnet](https://img.shields.io/badge/Solana-Mainnet--Beta-9945FF?logo=solana&logoColor=white)](https://explorer.solana.com/address/ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m)
[![Jupiter ExactOut](https://img.shields.io/badge/Jupiter-ExactOut%20Swap-00D18C)](https://jup.ag)
[![IDRX Stablecoin](https://img.shields.io/badge/IDRX-1%3A1%20IDR%20Peg-0066CC)](https://idrx.co)
[![Flutter](https://img.shields.io/badge/Flutter-3.x-02569B?logo=flutter&logoColor=white)](https://flutter.dev)
[![OJK Compliant](https://img.shields.io/badge/Audit-OJK%20APU%2FPPT-green)](https://ojk.go.id)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## What Is SOLQ?

SOLQ bridges the gap between Solana's DeFi ecosystem and Indonesia's 30+ million QRIS merchants.

A user **scans any QRIS code** → SOLQ decodes it, calls Jupiter for an **ExactOut swap** to compute exactly how much SOL/USDC they need → the user **signs once in Phantom** → SOLQ verifies the on-chain transaction → IDRX is disbursed to the merchant via the off-ramp API → **merchant receives IDR in their bank/e-wallet in seconds**.

No private keys ever leave the user's wallet. SOLQ is fully non-custodial.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  Flutter App (non-custodial)                                        │
│                                                                     │
│  [QR Scanner] → [QRIS Decoder/CRC] → [Payment Intent API]          │
│       ↓                                                             │
│  [Jupiter Quote Display]  →  [Phantom Deep Link Sign]               │
│       ↓                                                             │
│  [Confirm TX Hash to Backend]                                       │
└────────────────────┬────────────────────────────────────────────────┘
                     │ HTTPS
┌────────────────────▼────────────────────────────────────────────────┐
│  Node.js Backend (Express + TypeScript)                             │
│                                                                     │
│  POST /v1/payment-intents    → QRIS decode + Jupiter ExactOut quote │
│  POST /solana-pay/:id        → Build unsigned Solana transaction     │
│  POST /v1/payment-intents/:id/confirm                               │
│    ├─ On-chain verify (Multi-RPC failover)                          │
│    ├─ Payer mismatch check                                          │
│    ├─ Replay attack block                                           │
│    └─ IDRX off-ramp → merchant IDR                                  │
└────────────────────┬────────────────────────────────────────────────┘
                     │
         ┌───────────┼───────────┐
         ▼           ▼           ▼
    Jupiter API   IDRX API   Solana RPC
  (ExactOut swap) (off-ramp) (multi-failover)
```

---

## Key Features

| Feature | Detail |
|---|---|
| **EMVCo QRIS Parsing** | Full TLV decoder, CRC-16/CCITT-FALSE per §2.9, static & dynamic QR |
| **Jupiter ExactOut** | Real-time quote — exact SOL/USDC input for exact IDR output |
| **Non-Custodial** | Phantom/Solflare ECDH deep link; private key never leaves wallet |
| **Multi-RPC Failover** | Helius → Alchemy → Ankr → public fallback |
| **Replay Attack Protection** | tx_hash uniqueness enforced per intent |
| **Payer Mismatch Detection** | On-chain signer vs. wallet callback cross-check |
| **IDRX Off-Ramp** | 1:1 IDR stablecoin → merchant bank / GoPay / OVO |
| **Reconciliation Worker** | Auto-detects stuck TX every 60s; AWAITING_SETTLEMENT never auto-fails |
| **OJK Audit Log** | SHA-256 integrity hash per event, 3-tier (console / file / WORM webhook) |
| **Rate Limiting** | 60 req/min/IP, in-memory, no Redis dependency |
| **QRIS Scanner Watchdog** | Auto-resets camera if no frame detected in 8s |
| **Haptic Feedback** | Instant tactile confirmation on QR detection |

---

## Fee Structure

| Layer | Cost | Who Pays |
|---|---|---|
| Solana network fee | ~Rp 0.02 (0.000005 SOL) | User |
| Jupiter swap slippage | ≤1% | User |
| SOLQ platform fee | 1% | User |
| Legacy QRIS MDR (old) | 0.3–2% | Merchant (SOLQ eliminates this) |
| **Net saving vs. legacy** | **~2%** | Merchant keeps more |

---

## On-Chain Proof

| Asset | Address |
|---|---|
| Treasury Wallet | [`ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m`](https://explorer.solana.com/address/ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m) |
| IDRX Mint | [`idrxZcP8xiKkYk6XGD4uz1dxEYCWSgKDHqgjsBbwDur`](https://explorer.solana.com/address/idrxZcP8xiKkYk6XGD4uz1dxEYCWSgKDHqgjsBbwDur) |
| SOL Mint | `So11111111111111111111111111111111111111112` |
| USDC Mint | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| Jupiter API | `https://lite-api.jup.ag/swap/v1` |
| Mainnet proof endpoint | `GET /v1/system/proof` |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile | Flutter 3.x (Dart) |
| Backend | Node.js 20 + Express + TypeScript |
| Blockchain | Solana Mainnet-Beta (`@solana/web3.js`) |
| DEX Aggregator | Jupiter v6 (ExactOut swap) |
| Stablecoin | IDRX (1:1 IDR peg, 2 decimals) |
| Wallet | Phantom + Solflare (ECDH deep link, non-custodial) |
| Price Oracle | CoinGecko Pro (45s cache fallback) |
| Off-Ramp | IDRX API → BI-FAST / GPN / GoPay / OVO |
| Audit | SHA-256 JSONL + Datadog/Logtail WORM webhook |

---

## Quick Start

### Backend

```bash
cd backend
cp .env.example .env          # fill in SOLANA_RPC_URL, IDRX_API_KEY, etc.
npm install
npm run dev                   # ts-node watch
# or
npm run build && npm start    # production
```

Verify mainnet connection:
```bash
curl http://localhost:3000/v1/system/proof | jq .
curl http://localhost:3000/health
```

### Flutter App

```bash
flutter pub get
flutter run --release         # Android: connects to backend via lib/services/api_service.dart
```

For physical device testing, update `ApiService.baseUrl` in [lib/services/api_service.dart](lib/services/api_service.dart) to your backend host.

---

## Environment Variables

See [backend/.env.example](backend/.env.example) for full documentation. Minimum required for mainnet:

```env
SOLANA_RPC_URL=https://your-rpc.helius.xyz/v0?api-key=YOUR_KEY
IDRX_API_KEY=your_idrx_api_key
IDRX_SECRET_KEY=your_idrx_secret_base64
```

---

## Security Model

- **Non-custodial**: SOLQ orchestrates but never signs. The user's wallet holds all private keys.
- **CRC-16 validation**: Every QRIS payload is validated per EMVCo §2.9 before processing.
- **Replay protection**: Each `tx_hash` is stored and rejected if resubmitted for a different intent.
- **Payer mismatch**: On-chain signer is compared against the wallet that initiated the payment request.
- **Input validation**: All API inputs validated (length, format, charset, range) before any processing.
- **Rate limiting**: 60 req/min/IP enforced in-process without external dependencies.
- **Audit logging**: Every security event (replay blocked, payer mismatch, settlement) is hashed and logged to three independent tiers.

---

## Repository Mirror

Both repositories are 100% identical. Primary source is `nayrbryanGaming/solq`.

| Repository | Role |
|---|---|
| `github.com/nayrbryanGaming/solq` | Primary source |
| `github.com/nayrbryanGaming/SOLQV2` | Auto-mirror (GitHub Actions on every push to `main`) |

Mirror pipeline: [.github/workflows/mirror.yml](.github/workflows/mirror.yml)

To configure: add an SSH deploy key to SOLQV2 and store the private key as `MIRROR_SSH_KEY` secret in the source repository settings.

---

## Compliance

- **OJK APU/PPT**: Audit events include SHA-256 integrity hash; webhook to WORM log store configured via `AUDIT_WEBHOOK_URL`
- **Data retention**: 5-year requirement met via external log aggregator (Datadog / Logtail / CloudWatch Object Lock)
- **EMVCo QRCPS MPM**: Full CRC-16/CCITT-FALSE validation on every QRIS payload
- **Non-custodial declaration**: User private key never transits SOLQ servers; enforced architecturally

---

## Roadmap

- [ ] PostgreSQL persistent store (replace in-memory paymentIntents)
- [ ] BullMQ/Redis dual-track settlement queue (fast >Rp500K, batch <Rp500K)
- [ ] AI Risk Engine v1 (wallet age, NMID validity, amount anomaly detection)
- [ ] Certificate pinning in Flutter HTTP client
- [ ] Jito bundle priority inclusion
- [ ] Gas sponsorship (SOLQ absorbs Solana fee as COGS)
- [ ] Multi-language expansion (EN / ID / ZH)

---

## License

MIT © 2026 SOLQ Team
