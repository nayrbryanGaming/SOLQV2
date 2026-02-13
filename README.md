<<<<<<< HEAD
<<<<<<< HEAD
# warungpay-core
Core payment orchestration system enabling crypto and IDRX-based customer payments to settle over existing QRIS and e-wallet rails, without merchant onboarding, system changes, or fund custody.
=======
# warungpay
=======
# WarungPay
>>>>>>> 4d11e37 (Upload WarungPay V2 and update README)

Customer-side payment orchestration for QRIS.
Crypto and IDRX in. Rupiah settles to existing QRIS wallets. No merchant change.

## Overview

WarungPay is a customer-side payment orchestration layer that enables users to pay existing QRIS merchants using crypto or IDRX, while settlement flows directly into existing QRIS-linked wallets (GoPay, OVO, bank accounts).

Merchants do not onboard.
Merchants do not install anything.
Merchants do not touch crypto.

QRIS remains the system of record.
WarungPay only orchestrates.

<<<<<<< HEAD
For help getting started with Flutter development, view the
[online documentation](https://docs.flutter.dev/), which offers tutorials,
samples, guidance on mobile development, and a full API reference.
>>>>>>> 6a465ab (Initial commit: WarungPay — Solana Pay POS for Indonesian MSMEs 🇮🇩)
=======
## Problem

Indonesia already solved retail payments with QRIS.

But crypto cannot enter the system because:

Merchants refuse new apps, vendors, or workflows

Regulations prevent merchants from accepting crypto directly

Existing crypto payments require behavior change on at least one side

The bottleneck is not payment rails.
The bottleneck is orchestration without disruption.

## Solution

WarungPay introduces a customer-side orchestration layer that:

Reads existing QRIS payloads

Identifies the QRIS-linked settlement destination

Accepts crypto or IDRX from the customer

Routes conversion via licensed partners

Settles Rupiah directly into existing QRIS wallets

No merchant integration.
No QRIS modification.
No behavioral change.

## What WarungPay Is

Customer-side payment orchestrator

QRIS payload reader and routing engine

Crypto / IDRX → QRIS wallet settlement bridge

Backend-first, non-custodial infrastructure

## What WarungPay Is Not

Not a POS system

Not a merchant application

Not a wallet

Not a bank or e-money issuer

Not a QRIS issuer

Not an off-ramp provider

## Payment Flow

**Merchant**

Displays existing QRIS (bank or e-wallet issued)

No interaction with WarungPay

**Customer**

Scans QRIS using WarungPay

Chooses crypto or IDRX

**Orchestration**

QRIS payload decoded

Payment intent created

Asset and route selected via policy engine

**Execution**

User signs transaction in own wallet

Crypto → IDRX (if required)

Conversion executed by licensed partner

**Settlement**

Rupiah settles directly into QRIS-linked wallet

Merchant receives payment as usual

## Role of IDRX

IDRX is a backend settlement anchor, not a payment UI.

It is used for:

IDR-denominated accounting

Liquidity normalization

Regulatory compatibility

Off-ramp execution via licensed partners

IDRX is never exposed to merchants.

## Architecture (High Level)
```
Customer Wallet (Solana / IDRX)
        ↓
WarungPay Consumer App (QRIS Scan)
        ↓
WarungPay Backend Orchestrator
   - QRIS Decoder
   - Payment Intent Engine
   - Asset Detection
   - Routing Policy Engine
   - Swap Abstraction
   - IDRX Handler
   - Settlement Router
        ↓
Licensed Off-ramp & QRIS Acquirer
        ↓
GoPay / OVO / Bank Wallet
```

## Security & Compliance Boundaries

**WarungPay:**

Does not store private keys

Does not custody fiat

Does not custody merchant funds

Does not issue money

Does not modify QRIS

**WarungPay only:**

Orchestrates

Routes

Monitors

Reconciles

Fiat conversion and settlement are executed exclusively by licensed partners.

## Development Status

**Phase 1 — Validation**

QRIS decoding

Payment intent simulation

Mock settlement

**Phase 2 — Sandbox**

Limited IDRX partner

Controlled QRIS wallet settlement

Reconciliation and monitoring

**Phase 3 — Production**

Regulatory sandbox

Compliance hardening

Scalable orchestration

## Positioning

WarungPay does not compete with QRIS.
It makes QRIS programmable from the customer side.

## One Sentence

WarungPay enables crypto payments over QRIS by moving all complexity to the backend and leaving merchant systems untouched.

---

# 🏪 WarungPay — Solana Pay POS for Indonesian MSMEs 🇮🇩

**WarungPay** is a Solana Pay-based Point of Sale (POS) application specifically designed to accelerate crypto adoption among MSMEs (Micro, Small, and Medium Enterprises) in Indonesia. With WarungPay, business owners can accept digital payments instantly, securely, and without the burden of expensive intermediary fees.

---

## 🚀 Product Vision
Bridging the gap between blockchain technology and daily transactions in Indonesia. We deliver a payment experience as seamless as QRIS (Indonesian Standard QR) combined with the efficiency and transparency of the Solana network.

---

## ✨ Key Features
* **Native IDR Input:** Merchants can simply enter the transaction amount in Indonesian Rupiah (IDR).
* **Real-time Conversion:** Automatic conversion from IDR to USDC/SOL based on the latest market exchange rates.
* **Dynamic Solana Pay QR:** Generates instant QR codes compatible with Phantom, Solflare, and other Solana-standard wallets.
* **Transaction Monitoring:** Real-time payment status tracking (from "Pending" to "Settled") directly on the merchant's screen.
* **Merchant-Centric UI:** An intuitive, lightweight interface optimized for Android devices commonly used by local vendors.

---

## 🛠️ Tech Stack
* **Frontend:** Flutter (Cross-platform Mobile & Web)
* **Blockchain Protocol:** Solana Pay Protocol
* **State Management:** BLoC / Clean Architecture
* **Price Discovery:** CoinGecko API Integration (Planned)

---

## 📊 Business Roadmap (Milestones)

### ✅ Milestone 1: Prototype UI & QR Engine (Completed)
* [x] Development of Merchant UI (Numpad & IDR Input system).
* [x] Integration of QR Code Generator based on Solana Pay URL Scheme.

### ⚙️ Milestone 2: Real-time Data & Logic (Q1 2026)
* [ ] Live API integration for IDR -> USDC price conversion.
* [ ] Robust input validation and error handling systems.

### 🔗 Milestone 3: Blockchain Connectivity (Q1 2026)
* [ ] Implementation of Payment Listeners via Solana RPC for automated transaction detection.
* [ ] Local database integration for transaction history.

### 🚀 Milestone 4: Mainnet Launch & User Education (Q1 2026)
* [ ] Deployment to Google Play Store.
* [ ] Creation of comprehensive documentation and onboarding guides for MSME merchants.

---

## 🛡️ Open Source & Security
We believe in the power of the community. **WarungPay** will be released as an open-source project following the completion of Mainnet testing to foster further innovation within the Solana Indonesia ecosystem.

---

## 👨‍💻 Contributor
**Vincentius Bryan Kwandou** ([@nayrbryanGaming](https://github.com/nayrbryanGaming))

---

## 💬 Contact Us
Interested in collaborating or supporting the development of WarungPay? Reach out to us through the **Superteam Indonesia** community channels.
>>>>>>> 4d11e37 (Upload WarungPay V2 and update README)
