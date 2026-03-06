# ═══════════════════════════════════════════════════════════════════════════════
#  SOLQ DEPLOYMENT SCRIPT - MAINNET PRODUCTION
#  Sam Altman Challenge: 100% Real, No Fake, No Demo
# ═══════════════════════════════════════════════════════════════════════════════

Write-Host "╔══════════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║           SOLQ - SOLANA PAYMENT ORCHESTRATOR                     ║" -ForegroundColor Green
Write-Host "║           MAINNET DEPLOYMENT - PRODUCTION READY                  ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# ─── STEP 1: Flutter Clean & Get Dependencies ─────────────────────────────────
Write-Host "[1/5] Cleaning Flutter project..." -ForegroundColor Cyan
Set-Location $ProjectDir
flutter clean 2>$null
flutter pub get

# ─── STEP 2: Backend Dependencies ─────────────────────────────────────────────
Write-Host "[2/5] Installing backend dependencies..." -ForegroundColor Cyan
Set-Location "$ProjectDir\backend"
npm install 2>$null

# ─── STEP 3: Build Backend ────────────────────────────────────────────────────
Write-Host "[3/5] Building backend TypeScript..." -ForegroundColor Cyan
npm run build 2>$null

# ─── STEP 4: Build Flutter APK (Release) ──────────────────────────────────────
Write-Host "[4/5] Building Flutter APK (Release)..." -ForegroundColor Cyan
Set-Location $ProjectDir
flutter build apk --release

# ─── STEP 5: Show Results ─────────────────────────────────────────────────────
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║                    DEPLOYMENT COMPLETE!                          ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

$ApkPath = "$ProjectDir\build\app\outputs\flutter-apk\app-release.apk"
if (Test-Path $ApkPath) {
    $ApkSize = (Get-Item $ApkPath).Length / 1MB
    Write-Host "✅ APK READY: $ApkPath" -ForegroundColor Green
    Write-Host "   Size: $([math]::Round($ApkSize, 2)) MB" -ForegroundColor Yellow
} else {
    Write-Host "❌ APK not found. Check build errors." -ForegroundColor Red
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "TO START BACKEND:" -ForegroundColor White
Write-Host "  cd backend && npm start" -ForegroundColor Yellow
Write-Host ""
Write-Host "TO INSTALL APK:" -ForegroundColor White
Write-Host "  adb install -r build\app\outputs\flutter-apk\app-release.apk" -ForegroundColor Yellow
Write-Host "═══════════════════════════════════════════════════════════════════" -ForegroundColor Cyan

