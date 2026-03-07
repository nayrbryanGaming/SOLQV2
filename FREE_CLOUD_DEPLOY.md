# 🚀 DEPLOY SOLQ BACKEND — FREE 24/7 CLOUD

> Tidak butuh laptop nyala terus! Deploy sekali, jalan selamanya gratis.

---

## ✅ OPSI 1: RAILWAY (RECOMMENDED — Paling Gampang)

**Free:** 500 jam/bulan (cukup 24/7 satu service)
**No credit card needed untuk tier awal**

### Cara Deploy:
1. Buka: https://railway.app
2. Sign up pakai GitHub
3. Klik **"New Project" → "Deploy from GitHub repo"**
4. Pilih repo SOLQ ini
5. Railway auto-detect Dockerfile di `backend/` folder
6. Set **Root Directory** = `backend`
7. Add Environment Variables:
   ```
   NODE_ENV=production
   PORT=3000
   SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
   TREASURY_WALLET=ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m
   ```
8. Deploy! Railway kasih URL: `https://nayrbryanGaming.up.railway.app`

### Update Flutter App:
Di `lib/services/solq_service.dart`, ganti URL Railway:
```dart
'https://nayrbryanGaming.up.railway.app/v1',  // ✅ LIVE
```

---

## ✅ OPSI 2: RENDER (Backup)

**Free:** 750 jam/bulan, cold start 50 detik
**No credit card**

### Cara Deploy:
1. Buka: https://render.com
2. Sign up pakai GitHub
3. Klik **"New" → "Web Service"**
4. Connect repo SOLQ
5. Settings:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `node dist/index.js`
   - **Environment:** Node
6. Add env vars sama seperti Railway
7. Deploy! URL: `https://solq-backend.onrender.com`

---

## ✅ OPSI 3: KOYEB (Backup ke-2)

**Free:** 1 nano instance, always on
**No credit card** 

### Cara Deploy:
1. Buka: https://www.koyeb.com
2. Sign up
3. **"Create App" → "GitHub"**
4. Pilih repo, set:
   - **Root path:** `backend`  
   - **Build command:** `npm install && npm run build`
   - **Run command:** `node dist/index.js`
5. URL: `https://solq-backend.koyeb.app`

---

## ✅ OPSI 4: FLY.IO (Best Performance Free)

**Free:** 3 shared VMs, 160GB bandwidth/bulan

### Install flyctl:
```powershell
iwr https://fly.io/install.ps1 -useb | iex
```

### Deploy:
```powershell
cd backend
fly auth login
fly launch --name solq-backend --region sin  # Singapore closest to Indonesia
fly deploy
```

URL: `https://solq-backend.fly.dev`

---

## 🔧 AUTO-FAILOVER SUDAH AKTIF DI FLUTTER

File `lib/services/solq_service.dart` sudah update:
- Coba **local backend** (3 detik timeout)
- Kalau gagal → coba **Railway**
- Kalau gagal → coba **Render**  
- Kalau gagal → coba **Koyeb**
- Auto-save URL yang berhasil ke SharedPreferences

---

## 📱 SETELAH DEPLOY — Update URL di Flutter

Edit `lib/services/solq_service.dart`:
```dart
static const List<String> _cloudFallbackUrls = [
  'https://nayrbryanGaming.up.railway.app/v1',  // ✅ RAILWAY — LIVE
  'https://solq-backend.onrender.com/v1',         // ← ganti kalau udah deploy Render
  'https://solq-backend.koyeb.app/v1',             // ← ganti kalau udah deploy Koyeb
];
```

---

## ⚡ REKOMENDASI CEPAT

Sekarang langsung:
1. **Railway** → https://railway.app/new → GitHub → deploy
2. Ambil URL nya
3. Update `_cloudFallbackUrls[0]` di Flutter
4. Build APK baru
5. **DONE — Backend 24/7 tanpa laptop!**



