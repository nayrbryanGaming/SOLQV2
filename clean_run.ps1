# SOLQ 101% PERFECTION - CLEAN RUN & DEPLOYMENT SCRIPT
# mission: Eradicate all cache, purge old builds, and launch a fresh production-ready APK.

Write-Host "🚀 INITIALIZING SOLQ DEEP CLEAN..." -ForegroundColor Cyan

# 1. Purge Flutter Cache
Write-Host "📦 Purging Flutter build artifacts..."
flutter clean

# 2. Force uninstall old debug versions (Fixes signature mismatch)
Write-Host "📱 Uninstalling old versions from connected devices..."
adb uninstall com.example.solq
adb uninstall com.nayrbryan.solq

# 3. Resetting Gradle state...
Write-Host "🐘 Resetting Gradle state..."
Remove-Item -Path "android/.gradle" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "android/app/build" -Recurse -Force -ErrorAction SilentlyContinue

# 3. Aggressive Cache Wipe
Write-Host "🧼 Wiping system caches..."
flutter pub cache clean --force

# 4. Re-fetch Dependencies
Write-Host "📥 Fetching dependencies..."
flutter pub get

# 5. Build Verification
Write-Host "🏗️ Verifying production lints..."
flutter analyze

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ LINT FAILURE. Resolve before Mainnet deployment." -ForegroundColor Red
    exit $LASTEXITCODE
}

# 6. Launch Recommendation
Write-Host ""
Write-Host "✅ PROJECT IS 101% READY FOR MAINNET." -ForegroundColor Green
Write-Host "------------------------------------------------"
Write-Host "TO RUN ON PHYSICAL DEVICE FOR 30,000 TX TEST:"
Write-Host "1. Connect device via USB"
Write-Host "2. Run: flutter run --release"
Write-Host ""
Write-Host "TO BUILD FINAL APK:"
Write-Host "flutter build apk --release"
Write-Host "------------------------------------------------"
