# 🌐 SOLQ.MY.ID VERCEL DEPLOYMENT GUIDE

## ✅ OPSI TERBAIK: Gunakan Domain Vercel Anda!

**Anda sudah punya:** `solq.my.id` di Vercel  
**Kami bisa:** Deploy backend Node.js ke Vercel + gunakan domain Anda!

---

## 🎯 STRATEGI: VERCEL + CUSTOM DOMAIN

### APA YANG BISA DILAKUKAN:

1. ✅ **Vercel untuk Frontend** (React, Next.js, Vue)
   - Static files
   - SPAs
   - Serverless functions

2. ✅ **Vercel untuk Backend API** (Node.js, Python)
   - Express.js API
   - Serverless functions
   - SOLQ backend bisa jalan di sini!

3. ✅ **Custom domain** (`solq.my.id`)
   - Point ke Vercel project
   - Gratis SSL/HTTPS
   - Built-in CDN

---

## 🚀 QUICK SETUP: VERCEL + SOLQ BACKEND

### OPSI A: Vercel Functions (RECOMMENDED)

**Cara kerja:**
- Backend jalan sebagai Vercel Functions (serverless)
- Custom domain: `solq.my.id/api/*`
- Gratis + auto-scale

**Kelebihan:**
- ✅ Gratis forever
- ✅ Auto-scale (no downtime)
- ✅ Built-in database (PostgreSQL edge)
- ✅ Environment variables simple
- ✅ No cold start dengan Vercel Pro (tapi free tier OK)

**Kekurangan:**
- ⚠️ Cold start first request (tapi cepat)
- ⚠️ Request timeout: 30 detik (cukup untuk SOLQ)

### OPSI B: Vercel + External Backend

**Cara kerja:**
- Frontend di Vercel (`solq.my.id`)
- Backend di Render/Fly.io/Glitch
- Frontend proxy ke backend
- Custom domain untuk frontend saja

**Kelebihan:**
- ✅ Separation of concerns
- ✅ Frontend cepat (CDN)
- ✅ Backend independent

**Kekurangan:**
- ❌ Multiple providers to manage
- ❌ Not ideal untuk production

---

## 📋 OPSI A: VERCEL FUNCTIONS (RECOMMENDED UNTUK ANDA)

### STEP 1: Structure Backend untuk Vercel

Vercel expects functions di folder `/api/*`

```
SOLQ/
├── api/
│   ├── v1/
│   │   ├── payment-intents/
│   │   │   ├── [id].ts
│   │   │   └── index.ts
│   │   ├── stats.ts
│   │   ├── settlement-info.ts
│   │   └── ...
│   ├── health.ts
│   └── solana-pay/
│       ├── [intentId].ts
├── lib/
│   ├── services/
│   │   ├── solanaService.ts
│   │   ├── bankPartnerService.ts
│   │   └── store.ts
├── vercel.json
├── package.json
├── tsconfig.json
└── .env.local
```

### STEP 2: Convert Express Routes ke Vercel Functions

**BEFORE (Express):**
```typescript
// backend/src/routes/paymentRoutes.ts
router.post('/payment-intents', (req, res) => {
  // ...
});
```

**AFTER (Vercel Function):**
```typescript
// api/v1/payment-intents/index.ts
import { VercelRequest, VercelResponse } from '@vercel/node';

export default async (req: VercelRequest, res: VercelResponse) => {
  if (req.method === 'POST') {
    // Same logic as Express route
    res.status(200).json({ intent_id: '...' });
  }
};
```

### STEP 3: Create `vercel.json` Config

```json
{
  "version": 2,
  "env": {
    "IDRX_API_KEY": "@idrx_api_key",
    "IDRX_SECRET_KEY": "@idrx_secret_key",
    "SOLANA_RPC_URL": "@solana_rpc_url"
  },
  "functions": {
    "api/**/*.ts": {
      "maxDuration": 30,
      "memory": 1024
    }
  }
}
```

### STEP 4: Deploy to Vercel

```bash
# 1. Install Vercel CLI
npm i -g vercel

# 2. Login
vercel login

# 3. Deploy
cd SOLQ
vercel --prod

# 4. Get URL
# Automatically uses: solq.my.id/api/*
```

### STEP 5: Update APK URLs

**File:** `lib/services/solq_service.dart`

```dart
static const List<String> _cloudFallbackUrls = [
  'https://solq.my.id/api/v1',           // ✅ YOUR VERCEL!
  'https://solq-backend.onrender.com/v1', // Fallback
  'https://solq-backend.fly.dev/v1',      // Fallback
];
```

---

## 🎁 BONUS: Integrated Frontend + Backend

Anda bisa juga host frontend di Vercel + backend functions:

```
solq.my.id/           → Frontend (React/Next.js)
solq.my.id/api/v1/*   → Backend (Node.js Functions)
```

**Structure:**
```
├── pages/           # Frontend (React)
├── api/             # Backend (Functions)
├── public/
├── package.json
└── vercel.json
```

---

## ⚡ PERFORMANCE: VERCEL vs ALTERNATIVES

| Provider | Platform | Uptime | Speed | Cold Start | Cost |
|----------|----------|--------|-------|-----------|------|
| **Vercel** | Serverless Functions | 99.99% | Very Fast | 1-3s | FREE |
| Render | Container | 99% | Good | 10-20s | FREE |
| Fly.io | Container | 99.95% | Very Fast | 2-5s | FREE |
| Glitch | Node.js | 99% | Medium | 5s | FREE |
| Helius | RPC Only | 99.9% | Very Fast | <100ms | FREE |

---

## 🚨 REQUIREMENTS FOR VERCEL FUNCTIONS

### What Works:
- ✅ Node.js (Express-like routing)
- ✅ TypeScript
- ✅ Database (PostgreSQL, Redis)
- ✅ Third-party APIs (IDRX, Jupiter, etc.)
- ✅ Long-running tasks (up to 30 seconds)
- ✅ Environment variables
- ✅ CORS

### What Doesn't Work:
- ❌ Background jobs (Reconciliation Worker)
  - Solution: Use Vercel Cron (paid) or separate service
- ❌ WebSocket (real-time)
  - Solution: Use Vercel's real-time features (paid) or polling

---

## 📝 VERCEL MIGRATION PATH

### Current Setup:
```
APK → Railway/Render/Fly.io/Koyeb/Glitch (backend)
    → Helius (RPC)
```

### After Vercel:
```
APK → solq.my.id/api/v1 (backend functions)
    → Helius (RPC)

BONUS: solq.my.id (frontend, if you want)
```

---

## 🎯 DECISION: VERCEL vs RENDER?

### VERCEL (`solq.my.id`)
**PROS:**
- ✅ Domain Anda sudah ada!
- ✅ Gratis selamanya
- ✅ Very fast (CDN)
- ✅ Scalable otomatis
- ✅ Easy environment setup
- ✅ One provider (less to manage)

**CONS:**
- ⚠️ Reconciliation worker perlu workaround
- ⚠️ Cold start first request
- ⚠️ 30 second timeout per request

### RENDER
**PROS:**
- ✅ Container (more flexible)
- ✅ Background jobs easy
- ✅ No cold start (always warm)
- ✅ Simpler migration

**CONS:**
- ❌ 10-20 second cold start
- ❌ Need separate domain setup

---

## ⭐ RECOMMENDATION

**Gunakan VERCEL untuk SOLQ:**

1. ✅ Domain Anda sudah ready
2. ✅ Gratis selamanya
3. ✅ Better performance (CDN)
4. ✅ One provider = less complexity
5. ✅ Sesuai untuk APK backend + optional frontend

**Untuk Reconciliation Worker:**
- Pilihan A: Deploy cron job ke Render (free tier)
- Pilihan B: Use external service (AWS Lambda, etc.)
- Pilihan C: Trigger via external endpoint

---

## 🚀 QUICK START: VERCEL DEPLOYMENT

### Step 1: Prepare Code
```bash
cd SOLQ
npm install @vercel/node
```

### Step 2: Create `api/v1/health.ts`
```typescript
import { VercelRequest, VercelResponse } from '@vercel/node';

export default async (req: VercelRequest, res: VercelResponse) => {
  res.status(200).json({ status: 'OK', service: 'SOLQ Orchestrator' });
};
```

### Step 3: Deploy
```bash
vercel --prod
```

### Step 4: Get URL
```
https://solq.my.id/api/v1/health
```

### Step 5: Update APK
```dart
'https://solq.my.id/api/v1',  // Your Vercel domain!
```

---

## 📚 RESOURCES

- Vercel Docs: https://vercel.com/docs
- Node.js Functions: https://vercel.com/docs/functions/nodejs
- Environment Variables: https://vercel.com/docs/projects/environment-variables
- Cron Jobs: https://vercel.com/docs/cron-jobs (pro feature)

---

## 🎯 FINAL RECOMMENDATION

**Status:** ✅ VERCEL + `solq.my.id` IS YOUR BEST OPTION

**Why:**
- Domain already owned
- Gratis selamanya
- High performance
- Auto-scaling
- One provider

**Next Steps:**
1. Convert backend to Vercel functions
2. Deploy to `solq.my.id/api/v1`
3. Update APK URLs
4. Go live!

---

**Estimated Migration Time:** 30 minutes  
**Complexity:** Medium (need to refactor Express → Vercel Functions)  
**Benefit:** Professional, fast, reliable backend on YOUR domain!

---

*"solq.my.id - bukan hanya domain, tapi backend lengkap! 🚀"*

