# SOLQ

**SOLQ** is a non-custodial payment orchestrator that enables users to pay any existing **QRIS merchant** using **Solana-based assets**, without onboarding merchants and without holding funds.

SOLQ bridges **on-chain authorization** with **Indonesia’s national payment rails (QRIS)** by orchestrating wallet signatures, on-chain swaps, and off-chain rupiah settlement in a single seamless flow.

---

## Why SOLQ Exists

Indonesia has millions of QRIS-enabled merchants, yet crypto users still face a broken payment experience:

- Off-ramping crypto to rupiah is slow and fragmented
- Merchants must be onboarded individually in most crypto payment solutions
- Existing systems force users to leave their wallet, swap manually, then pay

**SOLQ removes all of that friction.**

Users simply scan an existing QRIS code and authorize payment from their Solana wallet.  
Merchants receive rupiah as usual.  
No merchant onboarding. No custody. No behavior change.

---

## Core Principles

- **Consumer-side only** — SOLQ runs on the payer’s device
- **Non-custodial by design** — SOLQ never holds user or merchant funds
- **QRIS-native** — works with existing physical QRIS codes
- **Regulator-conscious architecture** — authorization and settlement are delegated, not centralized

---

## High-Level Architecture

```mermaid
graph TD
    A[User Wallet (Solana)] -->|Signature| B[Wallet Authorization]
    B -->|Jupiter| C[On-chain Swap]
    C -->|IDRX| D[Rupiah Stablecoin]
    D --> E[Partner Settlement Rail]
    E --> F[Merchant Bank / E-money Account (QRIS)]
```

SOLQ acts purely as an **orchestrator** between these components.

---

## Payment Flow (End-to-End)

1. User opens SOLQ and connects a Solana wallet (e.g. Phantom)
2. User scans a physical QRIS code at a merchant
3. SOLQ parses QRIS payload (EMVCo standard)
4. SOLQ determines payment amount:
   - Dynamic QRIS → amount locked
   - Static QRIS → user inputs amount manually
5. SOLQ requests a real-time swap quote (SOL/USDC → IDRX)
6. User authorizes payment by signing a wallet transaction
7. Swap executes on-chain
8. Settlement is delegated to partner rails
9. Merchant receives rupiah as normal
10. SOLQ confirms settlement via event-based callback

---

## QRIS Intelligence (“Mata Pinter”)

SOLQ implements a QRIS parser compliant with EMVCo specifications.

- **Dynamic QRIS**
  - Detects presence of Tag 54 (Transaction Amount)
  - Amount is locked and cannot be overridden
- **Static QRIS**
  - Detects missing Tag 54
  - Prompts user to input amount manually
- **Merchant Resolution**
  - Extracts merchant PAN / account identifiers (Tag 26/27)
  - Routes settlement automatically

This allows SOLQ to work with **any existing QRIS sticker**.

---

## Wallet Integration

SOLQ uses non-custodial wallet authorization.

- Wallets are connected via Solana Mobile Wallet Adapter
- Private keys never leave the wallet application
- SOLQ generates a **payment intent**
- User authorizes intent via cryptographic signature

SOLQ cannot move funds without explicit user consent.

---

## On-Chain Execution

- Real-time routing via DEX aggregation
- Atomic swap logic to ensure sufficient IDRX output
- Slippage-protected execution
- Solana-native low latency and low fees

---

## Settlement & Confirmation

- IDRX is routed to partner settlement infrastructure
- SOLQ does not custody funds at any stage
- Settlement confirmation is event-driven (webhook-based)
- UI updates only on confirmed settlement signal

This avoids polling and ensures deterministic transaction state.

---

## State Machine

All payments follow a strict, auditable state machine:

```
CREATED
→ AUTHORIZATION_REQUESTED
→ AUTHORIZED
→ AWAITING_SETTLEMENT
→ COMPLETED
```

No state skipping. No ambiguous transitions.

---

## Non-Custodial & Regulatory Posture

SOLQ:
- Does **not** store balances
- Does **not** custody funds
- Does **not** act as an e-wallet
- Does **not** issue QR codes

SOLQ only:
- Requests authorization
- Orchestrates execution
- Delegates settlement to licensed partners

This architecture is designed to align with regulatory expectations for payment intermediaries.

---

## Target Users (Initial)

- Crypto-native users
- High-frequency QRIS users
- Payments above micro-transaction thresholds
- Users seeking instant crypto-to-fiat utility

---

## Roadmap (High-Level)

**Phase 1 — MVP**
- QRIS scanning & parsing
- Wallet authorization
- On-chain swap execution
- Sandbox settlement

**Phase 2 — Accelerator**
- Partner settlement integration
- Reliability hardening
- UX latency optimization
- Compliance review

**Phase 3 — Scale**
- Multi-wallet support
- Multi-chain routing
- International QR expansion

---

## What SOLQ Is Not

- Not a POS system
- Not a merchant app
- Not a custodial wallet
- Not an exchange
- Not a payment gateway replacing QRIS

SOLQ is **infrastructure**, not a surface product.

---

## One-Sentence Summary

> **SOLQ scans QRIS, orchestrates wallet authorization and on-chain swaps, and delegates rupiah settlement — without holding funds.**

---

## Status

SOLQ is under active development and currently in MVP stage.

This repository represents the core orchestration logic and system design used for validation, accelerator evaluation, and ecosystem collaboration.

---
