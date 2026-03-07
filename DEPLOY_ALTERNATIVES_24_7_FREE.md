# 🚀 SOLQ BACKEND — DEPLOY GRATIS 24/7 (Railway Sekarang Bayar!)

## 📋 Status Update
- ❌ **Railway** — Sekarang bayar (tidak ada free tier lagi)
- ✅ **Render.com** — RECOMMENDED (free tier, 24/7, unlimited)
- ✅ **Fly.io** — GRATIS (3 shared-cpu-1x 256MB instances)
- ✅ **Koyeb** — GRATIS (24/7, 5 minute deployments max)
- ✅ **Glitch.com** — GRATIS (24/7 dengan project activity)

---

## 🎯 OPSI 1: RENDER.COM (PALING GAMPANG & STABIL) ⭐ RECOMMENDED

### Keuntungan:
- ✅ Free tier unlimited uptime
- ✅ PostgreSQL free 90 hari
- ✅ Build otomatis dari Git
- ✅ Tidak perlu kartu kredit untuk basic usage
- ✅ Performa stabil

### Langkah Deploy:

1. **Push kode ke GitHub:**
```bash
git add .
git commit -m "Deploy to Render free tier"
git push origin main
```

2. **Buka [render.com](https://render.com)**
   - Klik "New +" → "Web Service"
   - Pilih repository GitHub `SOLQ`
   - Configure:
     ```
     Name: solq-backend
     Environment: Node
     Build Command: npm install && npm run build
     Start Command: node dist/index.js
     ```

3. **Deploy & dapatkan URL:**
   ```
   https://solq-backend.onrender.com
   ```

4. **Update dalam APK:**
   Di `lib/services/solq_service.dart`:
   ```dart
   'https://solq-backend.onrender.com/v1',
   ```

---

## 🎯 OPSI 2: FLY.IO (PALING CEPAT UNTUK SEBARAN GLOBAL)

### Keuntungan:
- ✅ 3 shared instances gratis (2 shared-cpu-1x 256MB + 1 config)
- ✅ Deploy ke 6 regions Worldwide
- ✅ CLI yang super simpel
- ✅ WebSocket & Real-time support

### Langkah Deploy:

1. **Install Fly CLI:**
```powershell
iwr https://fly.io/install.ps1 -useb | iex
```

2. **Login & Create App:**
```bash
fly auth login
cd backend
fly launch
```
   - Saat ditanya region, pilih: `sin` (Singapore) untuk Asia
   - Skip Postgres (kita pakai in-memory)

3. **Deploy:**
```bash
fly deploy
```
   URL akan jadi: `https://solq-backend.fly.dev`

4. **Update APK:**
   ```dart
   'https://solq-backend.fly.dev/v1',
   ```

---

## 🎯 OPSI 3: KOYEB (GRATIS DENGAN CUSTOM DOMAIN)

### Keuntungan:
- ✅ Free tier generous
- ✅ Support custom domain gratis
- ✅ GitOps otomatis

### Langkah Deploy:

1. **Buka [koyeb.com](https://koyeb.com)**
   - Login/Create account (email atau GitHub)

2. **Deploy dari GitHub:**
   - New App → GitHub → Select `SOLQ` repository
   - Settings:
     ```
     Build Command: npm install && npm run build
     Run Command: node dist/index.js
     Port: 3000
     ```

3. **Dapatkan URL:**
   ```
   https://solq-backend-xxxxxx.koyeb.app
   ```

---

## 🎯 OPSI 4: GLITCH.COM (SUPER SIMPEL, NO CLI NEEDED)

### Keuntungan:
- ✅ Edit code langsung di browser
- ✅ Gratis, 24/7, unlimited
- ✅ GitHub sync otomatis

### Langkah Deploy:

1. **Buka [glitch.com](https://glitch.com)**
   - "New Project" → "Import from GitHub"
   - Pilih `SOLQ` repository

2. **Konfigurasi .env:**
   - Klik `.env` di project
   - Paste environment variables:
   ```
   IDRX_API_KEY=xxxxx
   IDRX_SECRET_KEY=xxxxx
   SOLANA_RPC_URL=https://helius-rpc.com/
   ```

3. **Auto-deploy & dapatkan URL:**
   ```
   https://solq-glitch.glitch.me/v1
   ```

---

## 🔄 APK UPDATE: AUTOMATIC FALLBACK (SUDAH DI-SETUP!)

File: `lib/services/solq_service.dart`

Kode sudah diupdate dengan fallback otomatis:

```dart
static const List<String> _cloudFallbackUrls = [
  'https://solq-backend.onrender.com/v1',       // ✅ Try Render first
  'https://solq-backend.fly.dev/v1',            // ✅ Try Fly.io next
  'https://solq-backend.koyeb.app/v1',          // ✅ Try Koyeb
  'https://solq-glitch.glitch.me/v1',           // ✅ Try Glitch
];
```

**Cara kerja:**
1. Coba lokal dulu (3 detik)
2. Jika lokal fail, coba Render
3. Jika Render fail, coba Fly.io
4. Jika Fly.io fail, coba Koyeb
5. Jika semua fail, coba Glitch
6. Auto-save URL mana yang berhasil untuk kali berikutnya

---

## 🌐 HELIUS.DEV INTEGRATION (RPC ENDPOINT GRATIS)

Sudah di-setup di:
- `backend/src/services/solanaService.ts` → RPC_ENDPOINTS
- `lib/services/solana_service.dart` → _rpcEndpoints

**Helius.dev** digunakan untuk:
- ✅ Fallback RPC (gratis 24/7)
- ✅ Transaction verification
- ✅ Balance checking
- ✅ High availability untuk Solana queries

**Tidak digunakan untuk:**
- ❌ Backend orchestration (hanya RPC provider)
- ❌ Payment settlement
- ❌ Business logic

---

## 📱 QUICK SETUP (PILIH SALAH SATU):

### Render (RECOMMENDED - Paling Stabil):
```bash
# Push ke GitHub
git push origin main

# Deploy manual di render.com atau auto-deploy saat push
# URL: https://solq-backend.onrender.com
```

### Fly.io (Paling Cepat):
```bash
fly deploy
# URL: https://solq-backend.fly.dev
```

### Glitch (Paling Mudah):
```
1. Buka glitch.com
2. New Project → Import from GitHub
3. Done! (auto-deploy)
```

---

## 🔒 ENVIRONMENT VARIABLES (Sama Untuk Semua)

Buat `.env` atau set di dashboard provider:

```env
# Solana
SOLANA_RPC_URL=https://helius-rpc.com/

# IDRX (off-ramp)
IDRX_API_KEY=your_key_here
IDRX_SECRET_KEY=your_secret_here
IDRX_API_URL=https://api.idrx.co

# Port
PORT=3000
```

---

## ✅ TESTING DEPLOYMENT

Setelah deploy, test dengan:

```bash
# Health check
curl https://your-domain.com/health

# Stats endpoint
curl https://your-domain.com/v1/stats
```

Expected response:
```json
{
  "status": "OK",
  "service": "SOLQ Orchestrator"
}
```

---

## 🚨 TROUBLESHOOTING

### "Backend tidak bisa diakses"
1. Check di dashboard provider (build logs)
2. Verify `.env` variables ada
3. Check port binding (harus 3000 atau `process.env.PORT`)
4. Restart deployment

### "RPC rate limit"
- Helius free tier: ~100 req/s
- Jika limit, upgrade atau tambah RPC lain

### "Settlement timeout"
- Render/Fly.io memiliki cold start
- Solusi: Keep-alive ping setiap 5 menit

---

## 📊 PRICING COMPARISON

| Provider | Free | Uptime | Cold Start | Recommended |
|----------|------|--------|-----------|-------------|
| Render   | ✅   | 24/7   | 10-20s    | ⭐⭐⭐      |
| Fly.io   | ✅   | 24/7   | 2-5s      | ⭐⭐       |
| Koyeb    | ✅   | 24/7   | 30s       | ⭐        |
| Glitch   | ✅   | 24/7   | 5s        | ⭐        |
| Railway  | ❌   | 24/7   | 1-2s      | ❌ BAYAR   |

---

## 🔗 QUICK LINKS

- Render: https://render.com
- Fly.io: https://fly.io
- Koyeb: https://koyeb.com
- Glitch: https://glitch.com
- Helius: https://helius.dev

---

**Last Updated:** 7 Maret 2026  
**Status:** READY FOR PRODUCTION (Multiple 24/7 Free Alternatives)

