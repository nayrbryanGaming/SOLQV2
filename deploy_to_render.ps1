# Deploy SOLQ Backend to Render.com (Recommended - Free 24/7)
# Run: .\deploy_to_render.ps1

Write-Host "🚀 SOLQ Backend Deployment to Render.com" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

# Step 1: Check Git
Write-Host "`n1️⃣ Checking Git..." -ForegroundColor Yellow
if (-Not (git --version)) {
    Write-Host "❌ Git not found. Install from https://git-scm.com/" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Git found" -ForegroundColor Green

# Step 2: Commit & Push
Write-Host "`n2️⃣ Pushing code to GitHub..." -ForegroundColor Yellow
git add .
git commit -m "Deploy SOLQ backend: Replace Railway with Render (free tier)"
git push origin main
if ($?) {
    Write-Host "✅ Code pushed to GitHub" -ForegroundColor Green
} else {
    Write-Host "❌ Push failed. Check GitHub credentials." -ForegroundColor Red
    exit 1
}

# Step 3: Manual Steps
Write-Host "`n3️⃣ Manual Steps on Render.com:" -ForegroundColor Yellow
Write-Host @"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Open https://render.com (login/signup)
2. Click "New +" → "Web Service"
3. Select your GitHub repo: "SOLQ"
4. Configure:
   Name: solq-backend
   Environment: Node
   Build Command: npm install && npm run build
   Start Command: node dist/index.js

5. Environment Variables (.env):
   IDRX_API_KEY=xxxxx
   IDRX_SECRET_KEY=xxxxx
   SOLANA_RPC_URL=https://helius-rpc.com/

6. Deploy!
7. Wait ~5 minutes for build
8. Copy URL: https://solq-backend-xxxxx.onrender.com

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"@

Write-Host "`n✅ Code ready for deployment!" -ForegroundColor Green
Write-Host "📝 Next: Update APK with new backend URL if needed" -ForegroundColor Cyan
Write-Host "🌐 Default fallback: Already configured in solq_service.dart" -ForegroundColor Cyan

