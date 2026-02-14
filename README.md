# WarungPay V2

Customer-Side Payment Orchestrator for QRIS.

## Project Structure

- `lib/`: Flutter Consumer App
- `backend/`: Node.js/TypeScript Backend Orchestrator

## Prerequisites

- Node.js (v16+)
- Flutter (v3.0+)
- Android Studio / VS Code

## Setup Instructions

### 1. Backend

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
   Server will start on `http://localhost:3000`.

### 2. Consumer App (Flutter)

1. Get dependencies:
   ```bash
   flutter pub get
   ```
2. Run the app (ensure an emulator or device is connected):
   ```bash
   flutter run
   ```

## Key Features Implemented (Phase 1, 2, & 3)

- **Payment Orchestrator**: `backend` (Decodes QRIS, maps to intents, routes without holding funds)
- **External Wallet Trigger**: `lib/screens/payment_confirmation_screen.dart` (Signals external signing events)
- **Settlement Request Engine**: `backend/src/services/bankPartnerService.ts` (Requests licensed partners to settle IDR)
- **Signal-Truth Separation**: `POST /confirm` accepts signals; Backend independently verifies on-chain truth.
- **Static QR / Manual Input**: Auto-detects 0-value QRs and prompts for amount (compliant user input flow).
- **Compliance Logs**: `backend/src/services/auditLogger.ts` (Immutable record of orchestration steps).

## How to Test

### Development Mode
1. Start Backend: `npm run dev`
2. Start Frontend: `flutter run`

### Production Mode (Docker)
1. Run containers:
   ```bash
   docker-compose up --build
   ```
2. Backend will be available at `http://localhost:3000`.

### Verification Steps
1. Scan a valid QRIS (Static).
2. See payment details in App (including Crypto Rate).
3. Click **Confirm Payment**.
4. Observe status change: `processing` -> `settling` -> `completed`.
5. Check `backend/audit_logs.jsonl` for compliance records.
