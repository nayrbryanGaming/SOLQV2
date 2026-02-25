# SOLQ PRODUCTION INSTALLATION SCRIPT
# This script ensures a clean slate before deploying to Mainnet.

Write-Host "--- SOLQ PRODUCTION RESET ---" -ForegroundColor Cyan

# 1. Uninstall old version
Write-Host "Uninstalling old com.example.SOLQ..."
adb uninstall com.example.SOLQ

# 2. Clean Flutter
Write-Host "Cleaning Flutter build cache..."
flutter clean

# 3. Get dependencies
Write-Host "Resolving dependencies..."
flutter pub get

# 4. Fresh Run
Write-Host "Preparing Fresh Install..."
Write-Host "READY FOR MAINNET. RUNNING..." -ForegroundColor Green

# Optional: To build release APK
# flutter build apk --release

flutter run
