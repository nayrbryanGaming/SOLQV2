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
