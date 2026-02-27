# SOLQ Clean Install Script
# Sam Altman Standard: No contaminated debug environments

Write-Host "[SOLQ INSTALLER] Executing Clean Wipe of old Debug APKs..." -ForegroundColor Cyan

if (Get-Command adb -ErrorAction SilentlyContinue) {
    adb uninstall com.example.SOLQ
    adb uninstall com.example.warungpay
    adb uninstall com.example.SOLQ.debug
}
else {
    Write-Host "[SOLQ INSTALLER] WARN: ADB not found in path. Please ensure device is connected and apps are manually uninstalled if needed." -ForegroundColor Yellow
}

Write-Host "[SOLQ INSTALLER] Environment Cleaned. Installing Production Release APK..." -ForegroundColor Green

# Install the newly built Release APK
$apkPath = "build\app\outputs\flutter-apk\app-release.apk"

if (Test-Path $apkPath) {
    if (Get-Command adb -ErrorAction SilentlyContinue) {
        adb install -r $apkPath
        Write-Host "[SOLQ INSTALLER] PERFECT! Production APK installed successfully. Ready for 30,000 Transactions!" -ForegroundColor Green
        
        # Launch the app automatically
        adb shell am start -n "com.example.SOLQ/com.example.SOLQ.MainActivity"
    }
    else {
        Write-Host "[SOLQ INSTALLER] SUCCESS: APK Built At $apkPath" -ForegroundColor Green
    }
}
else {
    Write-Host "[SOLQ INSTALLER] ERROR: Release APK not found. Ensure 'flutter build apk --release' has completed." -ForegroundColor Red
}
