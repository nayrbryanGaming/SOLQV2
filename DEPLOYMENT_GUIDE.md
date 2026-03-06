# SOLQ Deployment Guide - Mainnet Production

## ✅ System Requirements

- **Flutter**: 3.3.0+
- **Node.js**: 18+
- **Android Studio** / ADB (for mobile deployment)
- **Solana Wallet**: Phantom, Solflare, Jupiter, or any MWA-compatible wallet

---

## 🚀 Quick Deploy (5 Minutes)

### Step 1: Backend Setup
```powershell
cd backend
npm install
npm run build
npm start
```

Backend akan berjalan di `http://localhost:3000`

### Step 2: Flutter Build
```powershell
flutter pub get
flutter build apk --release
```

### Step 3: Install APK
```powershell
adb install -r build\app\outputs\flutter-apk\app-release.apk
```

---

## 🔧 Configuration

### Backend Environment (backend/.env)
```env
PORT=3000
NODE_ENV=production
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
IDRX_API_KEY=your_stabelify_api_key
IDRX_API_URL=https://api.stabelify.id/v1/disbursements
```

### Treasury Wallet (Revenue Collection)
All platform fees (1.0%) are automatically routed to:
```
ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m
```

---

## 💰 Fee Structure

| Component | Rate | Description |
|-----------|------|-------------|
| Platform Fee | 1.0% | SOLQ revenue (to Treasury) |
| Network Gas | ~0.000005 SOL | Solana blockchain fee |
| Slippage | 0.5% | Liquidity protection |
| **TOTAL** | **~1.5%** | **Beats credit card 2-3%** |

---

## 🔐 Security Features

1. **Non-Custodial**: SOLQ never touches private keys
2. **On-Chain Verification**: All transactions verified on Mainnet
3. **Multi-Oracle Pricing**: CoinGecko + Jupiter + ExchangeRate-API
4. **Circuit Breaker**: Blocks transactions if price deviation > 2.5%
5. **Multi-RPC Failover**: 3 backup RPC endpoints

---

## 📱 Supported Wallets

- ✅ Phantom
- ✅ Solflare
- ✅ Jupiter
- ✅ Backpack
- ✅ MetaMask (via Solana Snap)
- ✅ Trust Wallet
- ✅ OKX Wallet
- ✅ Binance Web3 Wallet

---

## 🔄 Transaction Flow

1. **User scans QRIS** → EMVCo-compliant parsing
2. **Price fetched** → Real-time from CoinGecko/Jupiter
3. **Quote generated** → Jupiter Aggregator (ExactOut)
4. **User authorizes** → Wallet signature (non-custodial)
5. **Swap executed** → SOL/USDC → IDRX on Mainnet
6. **Settlement** → IDRX → IDR via licensed partner
7. **Verification** → On-chain finalization confirmed

---

## 🆘 Troubleshooting

### Backend Not Reachable
1. Check firewall settings
2. Verify backend IP in app settings
3. Ensure port 3000 is open

### Wallet Connection Failed
1. Ensure wallet app is installed
2. Try different connection method (Universal Link vs Deep Link)
3. Check if wallet supports Solana Mainnet

### Transaction Stuck
1. Check Solana network status
2. Verify RPC endpoint is responsive
3. Wait for network congestion to clear

---

## 📊 Monitoring

- **Health Check**: `GET /health`
- **Stats**: `GET /v1/stats`
- **Transaction Status**: `GET /v1/transactions/:id/status`

---

## 📄 License

Proprietary - SOLQ Technologies. All rights reserved.

