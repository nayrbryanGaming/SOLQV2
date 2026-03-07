# 🚀 VERCEL DEPLOYMENT - STEP BY STEP GUIDE

## 🎯 Deploy SOLQ Backend to `solq.my.id`

**Estimated time:** 30 minutes  
**Difficulty:** Medium (need to refactor Express → Vercel Functions)  
**Result:** Professional backend at `https://solq.my.id/api/v1/*`

---

## 📋 PREREQUISITES

- ✅ Node.js 16+ installed
- ✅ Vercel account (link GitHub)
- ✅ `solq.my.id` domain on Vercel
- ✅ SOLQ repo pushed to GitHub
- ✅ Environment variables ready:
  - `IDRX_API_KEY`
  - `IDRX_SECRET_KEY`
  - `SOLANA_RPC_URL` (default: helius-rpc.com)

---

## 🔧 STEP 1: PREPARE VERCEL PROJECT STRUCTURE

### 1.1 Create `api/` directory

```bash
cd SOLQ
mkdir -p api/v1
```

### 1.2 Move backend code

```bash
# Copy backend services to lib/
cp -r backend/src/services lib/
cp backend/src/routes/*.ts lib/routes/ (manual refactor)
```

### 1.3 Install Vercel SDK

```bash
npm install @vercel/node
# or
yarn add @vercel/node
```

---

## 📁 STEP 2: STRUCTURE FOR VERCEL

### Create folder structure:

```
SOLQ/
├── api/
│   ├── health.ts                    # Health check endpoint
│   ├── middleware/
│   │   ├── cors.ts                  # CORS handling
│   │   └── auth.ts                  # Rate limiting
│   └── v1/
│       ├── payment-intents/
│       │   ├── index.ts             # POST /api/v1/payment-intents
│       │   └── [id].ts              # GET /api/v1/payment-intents/:id
│       ├── stats.ts                 # GET /api/v1/stats
│       ├── settlement-info.ts        # GET /api/v1/settlement-info
│       ├── settlement-request.ts     # POST settlement
│       ├── confirm.ts               # POST confirm
│       └── solana-pay/
│           └── [intentId].ts        # POST solana-pay
├── lib/
│   ├── services/
│   │   ├── solanaService.ts
│   │   ├── bankPartnerService.ts
│   │   ├── store.ts
│   │   └── ...
├── package.json
├── vercel.json
└── tsconfig.json
```

---

## 🔄 STEP 3: CONVERT EXPRESS ROUTES TO VERCEL FUNCTIONS

### 3.1 Create `api/health.ts`

```typescript
// api/health.ts
import { VercelRequest, VercelResponse } from '@vercel/node';

export default async (req: VercelRequest, res: VercelResponse) => {
  res.status(200).json({ 
    status: 'OK', 
    service: 'SOLQ Orchestrator',
    timestamp: new Date().toISOString()
  });
};
```

### 3.2 Create `api/v1/payment-intents/index.ts`

```typescript
// api/v1/payment-intents/index.ts
import { VercelRequest, VercelResponse } from '@vercel/node';
import { paymentIntents } from '../../../lib/services/store';

export default async (req: VercelRequest, res: VercelResponse) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'POST') {
    const { qris_payload, currency, input_amount } = req.body;

    try {
      // Your logic here (same as Express route)
      const intentId = Math.random().toString(36).substring(7);
      const intent = {
        id: intentId,
        qris_payload,
        currency: currency || 'IDRX',
        input_amount,
        status: 'PENDING',
        created_at: new Date(),
      };

      paymentIntents[intentId] = intent;

      res.status(200).json({
        intent_id: intentId,
        ...intent,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
};
```

### 3.3 Create `api/v1/payment-intents/[id].ts`

```typescript
// api/v1/payment-intents/[id].ts
import { VercelRequest, VercelResponse } from '@vercel/node';
import { paymentIntents } from '../../../lib/services/store';

export default async (req: VercelRequest, res: VercelResponse) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { id } = req.query;

  if (req.method === 'GET') {
    const intent = paymentIntents[id as string];
    if (intent) {
      res.status(200).json(intent);
    } else {
      res.status(404).json({ error: 'Intent not found' });
    }
  } else if (req.method === 'POST') {
    // Confirm payment endpoint
    const { tx_hash } = req.body;
    const intent = paymentIntents[id as string];

    if (!intent) {
      res.status(404).json({ error: 'Intent not found' });
      return;
    }

    // Your confirmation logic
    intent.status = 'COMPLETED';
    intent.tx_hash = tx_hash;

    res.status(200).json(intent);
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
};
```

### 3.4 Create `api/v1/stats.ts`

```typescript
// api/v1/stats.ts
import { VercelRequest, VercelResponse } from '@vercel/node';
import { paymentIntents } from '../../lib/services/store';

export default async (req: VercelRequest, res: VercelResponse) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const successCount = Object.values(paymentIntents).filter(
    (intent) => intent.status === 'COMPLETED'
  ).length;

  res.status(200).json({
    success_count: successCount,
    total_intents: Object.keys(paymentIntents).length,
  });
};
```

---

## ⚙️ STEP 4: CREATE `vercel.json`

```json
{
  "version": 2,
  "buildCommand": "npm run build",
  "env": {
    "IDRX_API_KEY": "@idrx_api_key",
    "IDRX_SECRET_KEY": "@idrx_secret_key",
    "SOLANA_RPC_URL": "@solana_rpc_url"
  },
  "functions": {
    "api/**/*.ts": {
      "maxDuration": 30,
      "memory": 512,
      "runtime": "nodejs18.x"
    }
  },
  "redirects": [
    {
      "source": "/api/v1/(.*)",
      "destination": "/api/v1/$1"
    }
  ]
}
```

---

## 🔐 STEP 5: SET ENVIRONMENT VARIABLES IN VERCEL

### 5.1 Login to Vercel Dashboard

Visit: https://vercel.com/dashboard

### 5.2 Select Your Project

Find `solq` project

### 5.3 Go to Settings → Environment Variables

### 5.4 Add Variables:

```
IDRX_API_KEY = your_idrx_key_here
IDRX_SECRET_KEY = your_idrx_secret_here
SOLANA_RPC_URL = https://helius-rpc.com/
```

---

## 📤 STEP 6: DEPLOY TO VERCEL

### Option A: Deploy via Vercel CLI (Recommended)

```bash
# 1. Install Vercel CLI
npm install -g vercel

# 2. Login
vercel login

# 3. Go to project directory
cd SOLQ

# 4. Deploy to production
vercel --prod

# 5. Wait for deployment
# Should see: ✓ Deployed to production
```

### Option B: Deploy via GitHub Push

```bash
# 1. Just push to GitHub
git add .
git commit -m "Deploy SOLQ backend to Vercel"
git push origin main

# 2. Vercel auto-deploys
# Check Vercel dashboard for progress
```

---

## 🧪 STEP 7: TEST DEPLOYMENT

### 7.1 Test Health Endpoint

```bash
curl https://solq.my.id/api/health
# Expected: {"status":"OK","service":"SOLQ Orchestrator","timestamp":"..."}
```

### 7.2 Test Stats

```bash
curl https://solq.my.id/api/v1/stats
# Expected: {"success_count":0,"total_intents":0}
```

### 7.3 Test Payment Intent Creation

```bash
curl -X POST https://solq.my.id/api/v1/payment-intents \
  -H "Content-Type: application/json" \
  -d '{
    "qris_payload": "test",
    "currency": "IDRX",
    "input_amount": 100000
  }'
# Expected: JSON with intent_id
```

---

## 📱 STEP 8: UPDATE APK CONFIGURATION

### Update `lib/services/solq_service.dart`

```dart
static const List<String> _cloudFallbackUrls = [
  'https://solq.my.id/api/v1',              // ✅ YOUR VERCEL!
  'https://solq-backend.onrender.com/v1',   // Fallback 1
  'https://solq-backend.fly.dev/v1',        // Fallback 2
];
```

---

## ✅ VERIFICATION CHECKLIST

- [ ] `api/` folder created with all endpoints
- [ ] `vercel.json` configured
- [ ] Environment variables set in Vercel dashboard
- [ ] Deploy successful (no errors)
- [ ] Health endpoint returns 200
- [ ] Stats endpoint works
- [ ] Payment intents creation works
- [ ] APK URLs updated
- [ ] CORS working (requests from mobile)

---

## 🚨 TROUBLESHOOTING

### "Build failed"
```
Solution:
1. Check build logs in Vercel dashboard
2. npm run build locally: npm run build
3. Check TypeScript errors: npx tsc --noEmit
```

### "Environment variables not found"
```
Solution:
1. Set in Vercel dashboard (Settings → Environment Variables)
2. Deploy again: vercel --prod
3. Check with: echo $IDRX_API_KEY (in function)
```

### "CORS errors from APK"
```
Solution:
Add CORS headers in each function:
res.setHeader('Access-Control-Allow-Origin', '*');
res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
```

### "Function timeout"
```
Solution:
Increase maxDuration in vercel.json (max 30s for pro):
"functions": {
  "api/**/*.ts": {
    "maxDuration": 30
  }
}
```

### "Cold start too slow"
```
Solution:
1. Normal for Vercel functions (1-3 detik)
2. Subsequent requests fast
3. If critical, use Vercel pro for warm functions
4. Or keep Render as alternative
```

---

## 📊 EXPECTED PERFORMANCE

| Metric | Expected |
|--------|----------|
| Health endpoint | <100ms |
| First request | 1-3 seconds (cold start) |
| Subsequent requests | <100ms |
| Uptime | 99.99% |
| Global latency | 50-200ms depending on location |

---

## 🎯 WHAT'S NEXT

1. ✅ Backend deployed to Vercel
2. ✅ APK configured with new URL
3. ✅ Fallback providers still available (Render, Fly.io, Koyeb, Glitch)
4. ✅ Helius RPC as final fallback
5. ✅ Ready for production!

---

## 📚 RESOURCES

- Vercel Docs: https://vercel.com/docs
- Serverless Functions: https://vercel.com/docs/functions/serverless-functions
- Environment Variables: https://vercel.com/docs/projects/environment-variables
- Deployment: https://vercel.com/docs/deployments/overview

---

## 🎉 SUCCESS INDICATORS

✅ All endpoints responding  
✅ Health check returns 200 OK  
✅ Stats endpoint has data  
✅ Payment intents can be created  
✅ APK connects and works  
✅ CORS working for mobile  
✅ Logs show successful requests  

---

**Congratulations! 🎊 Your SOLQ backend is now live on `solq.my.id/api/v1`!**

*Professional, fast, reliable, and completely FREE! 🚀*

---

**Estimated Total Time:** 30-45 minutes  
**Complexity:** Medium (refactoring required)  
**Result:** Production-ready backend on YOUR domain!

