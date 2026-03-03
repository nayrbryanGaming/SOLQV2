<p align="center">
  <img src="assets/logos/solq_logo_wordmark_transparent.png" alt="SOLQ - Solana-Based Payments" width="480"/>
</p>

<p align="center">
  <img src="assets/logos/solq_logo_icon_transparent.png" alt="SOLQ Icon" width="100"/>
</p>

# SOLQ — Non-Custodial Solana Payment Orchestrator

SOLQ is a consumer-side, non-custodial payment orchestrator designed to bridge Solana-based digital assets with Indonesia’s national QRIS payment rails.

It enables users to initiate authorized on-chain transactions for real-world merchant payments — without merchant-side infrastructure changes and without asset custody.

---

## Overview

SOLQ focuses on infrastructure correctness, deterministic settlement flow, and regulatory-aligned orchestration.

The system is engineered to:

- Orchestrate user-authorized on-chain payment intents
- Interact with public blockchain state only
- Delegate fiat settlement to regulated financial infrastructure partners
- Maintain strict non-custodial boundaries

SOLQ does **not** hold, transmit, or store user funds.

---

## Core Architecture Principles

### 1. Non-Custodial by Design
- Users retain full control of private keys.
- All blockchain interactions require explicit wallet authorization.
- SOLQ interacts exclusively with public keys and signed transaction payloads.

### 2. Deterministic Payment Lifecycle
- State-driven orchestration model
- On-chain confirmation verification
- Structured event-based reconciliation logic

### 3. Infrastructure Separation
- Wallet layer isolated from orchestration layer
- Settlement delegation abstracted from user authorization layer
- No internal access to user-controlled assets

---

## Regulatory Positioning

SOLQ operates strictly as a technical orchestration layer.

- No custody of digital or fiat assets
- No direct handling of settlement funds
- Execution delegated to licensed and regulated partners where required

---

## Repository Notice

This repository contains selected components related to the SOLQ orchestration system.

Certain internal infrastructure modules, routing logic, and proprietary mechanisms are not included in this repository.

All trademarks, brand assets, and intellectual property associated with SOLQ remain the exclusive property of SOLQ Technologies.

---

## Intellectual Property

© 2026 SOLQ Technologies. All Rights Reserved.

Unauthorized reproduction, commercial usage, or derivative redistribution of proprietary components is strictly prohibited.

---

## Status

Infrastructure development phase.  
Production release versioning follows internal deployment cycles.

---

## About

SOLQ enables users to initiate QRIS merchant payments using Solana-based assets through a non-custodial orchestration framework.

The system prioritizes reliability, compliance alignment, and infrastructure integrity before scale.

---

## 🏢 Brand Assets

| Version | Format | Usage |
|------|--------|-------|
| [**Wordmark (Transparent)**](assets/logos/solq_logo_wordmark_transparent.png) | PNG | Digital, Web, App Header |
| [**Icon (Transparent)**](assets/logos/solq_logo_icon_transparent.png) | PNG | Favicons, Avatars |
| [**Wordmark (Standard)**](assets/logos/solq_logo_wordmark.jpg) | JPEG | Print, PDF, Standard Backgrounds |
| [**Icon (Standard)**](assets/logos/solq_logo_icon.jpg) | JPEG | Print, Branding Collateral |
