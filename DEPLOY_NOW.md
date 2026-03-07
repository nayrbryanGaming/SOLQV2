# ⚡ DEPLOY IN 5 MINUTES - QUICK GUIDE

## 🚀 3 SIMPLE STEPS

### STEP 1: Push to GitHub (1 minute)
```powershell
cd "E:\000VSCODE PROJECT MULAI DARI DESEMBER 2025\SOLQ - 3 MAR 2026 ANDROID STUDIO OPUS"
git add .
git commit -m "🚀 Deploy SOLQ to Vercel - Live on solq.my.id"
git push origin main
```

### STEP 2: Deploy to Vercel (2 minutes)
```powershell
# Install Vercel CLI (if not installed)
npm install -g vercel

# Login to Vercel
vercel login

# Deploy to production
vercel --prod
```

### STEP 3: Set Environment Variables (2 minutes)

**In Vercel Dashboard:**
1. Go to: https://vercel.com/dashboard
2. Select: `solq` project
3. Settings → Environment Variables
4. Add these 3 variables:
   ```
   IDRX_API_KEY = your_key_here
   IDRX_SECRET_KEY = your_secret_here
   SOLANA_RPC_URL = https://helius-rpc.com/
   ```
5. Redeploy from dashboard

---

## ✅ VERIFY DEPLOYMENT

After deployment, test with:

```powershell
# Health check (should return 200 OK)
curl https://solq.my.id/api/health

# Stats endpoint
curl https://solq.my.id/api/v1/stats

# Create payment intent
curl -X POST https://solq.my.id/api/v1/payment-intents `
  -H "Content-Type: application/json" `
  -d '{\"qris_payload\":\"test\",\"currency\":\"IDRX\"}'
```

Or use the test script:
```powershell
.\Test-Deployment.ps1
```

---

## 📊 WHAT YOU GET

✅ Backend at `https://solq.my.id/api/v1/*`  
✅ 99.99% uptime (Vercel SLA)  
✅ 4 free fallback providers (auto-fallback)  
✅ Helius RPC fallback (free 24/7)  
✅ APK compatible (no rebuild!)  
✅ Production ready  
✅ Zero setup headaches  
✅ FREE forever  

---

## 🎯 ENDPOINTS

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/v1/stats` | Statistics |
| POST | `/api/v1/payment-intents` | Create intent |
| GET | `/api/v1/payment-intents?id=<id>` | Get intent |
| POST | `/api/v1/payment-intents?id=<id>` | Confirm intent |

---

## ⏱️ TIMELINE

```
Now          → Push code (1 min)
+1 min       → Deploy (2 min)
+3 min       → Configure env vars (2 min)
+5 min       → ✅ LIVE!
```

---

## 🆘 IF SOMETHING GOES WRONG

### Deployment failed?
→ Check: https://vercel.com/dashboard → Logs

### Endpoints not working?
→ Check: Environment variables are set
→ Check: `vercel.json` is present
→ Check: `api/` folder structure

### Environment variables not found?
→ Redeploy after setting them
→ Check: Vercel Dashboard → Settings → Environment Variables

---

## 📚 HELPFUL FILES

- `DEPLOYMENT_READY.md` - Full deployment guide
- `DEPLOYMENT_STATUS_REPORT.md` - Detailed status
- `Test-Deployment.ps1` - PowerShell test script
- `test-deployment.sh` - Bash test script
- `vercel.json` - Vercel configuration
- `.env.example` - Environment template

---

## 🎊 YOU'RE READY!

Everything is prepared. Just push and deploy!

**Command to deploy:**
```powershell
git push origin main && vercel --prod
```

**Time to live:** ~5 minutes  
**Result:** Professional backend on YOUR domain!

---

**Status: ✅ READY TO DEPLOY**

Go make it live! 🚀
