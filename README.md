# WarungPay

Customer-side payment orchestration for QRIS.
Crypto and IDRX in. Rupiah settles to existing QRIS wallets. No merchant change.

## Overview

WarungPay is a customer-side payment orchestration layer that enables users to pay existing QRIS merchants using crypto or IDRX, while settlement flows directly into existing QRIS-linked wallets (GoPay, OVO, bank accounts).

Merchants do not onboard.
Merchants do not install anything.
Merchants do not touch crypto.

QRIS remains the system of record.
WarungPay only orchestrates.

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
