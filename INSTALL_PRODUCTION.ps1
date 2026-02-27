# SOLQ PRODUCTION INSTALLATION SCRIPT
# This script ensures a clean slate before deploying to Mainnet.

Write-Host "--- SOLQ PRODUCTION RESET ---" -ForegroundColor Cyan

# 1. Uninstall old versions (Legacy and Rebranded) across all user profiles
Write-Host "Uninstalling legacy versions..."
adb kill-server
adb start-server

adb shell pm uninstall -k --user 0 com.example.warungpay
adb shell pm uninstall -k --user 0 com.example.SOLQ
adb shell pm uninstall -k --user 0 com.solq.app

adb uninstall com.example.warungpay
adb uninstall com.example.SOLQ
adb uninstall com.solq.app

# 2. Clean Flutter
Write-Host "Cleaning Flutter build cache..."
flutter clean

# 3. Get dependencies
Write-Host "Resolving dependencies..."
flutter pub get

# 4. Fresh Run
Write-Host "Preparing Fresh Install (MAINNET)..."
Write-Host "--- WARNING: THIS IS LIVE MAINNET ---" -ForegroundColor Yellow
Write-Host "READY FOR EXECUTION." -ForegroundColor Green

# Optional: To build release APK
# flutter build apk --release --no-tree-shake-icons

flutter run --release
