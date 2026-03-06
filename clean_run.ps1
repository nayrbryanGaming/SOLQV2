# ============================================================
# SOLQ - clean_run.ps1
# Workaround: adb install fails with spaces in path.
# Solution: build -> copy APK to C:\tmp -> push -> pm install -> launch
# ============================================================

$ADB   = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$PKG   = "com.example.solq"
$APK_SRC = "E:\000VSCODE PROJECT MULAI DARI DESEMBER 2025\SOLQ - 3 MAR 2026 ANDROID STUDIO OPUS\build\app\outputs\flutter-apk\app-debug.apk"
$APK_TMP = "C:\tmp\solq.apk"
$ROOT  = "E:\000VSCODE PROJECT MULAI DARI DESEMBER 2025\SOLQ - 3 MAR 2026 ANDROID STUDIO OPUS"

Set-Location $ROOT

# ── 1. CLEAN OLD PACKAGES OFF DEVICE ────────────────────────
Write-Host "`n[1/5] Uninstalling old packages from device..." -ForegroundColor Yellow
& "$ADB" uninstall com.example.solq        2>$null
& "$ADB" uninstall com.example.SOLQ        2>$null
& "$ADB" uninstall com.example.warungpay   2>$null
& "$ADB" shell pm uninstall --user 0 com.example.solq      2>$null
& "$ADB" shell pm uninstall --user 0 com.example.SOLQ      2>$null
& "$ADB" shell pm uninstall --user 0 com.example.warungpay 2>$null
Write-Host "   Done." -ForegroundColor Green

# ── 2. BUILD DEBUG APK ───────────────────────────────────────
Write-Host "`n[2/5] Building debug APK..." -ForegroundColor Cyan
flutter build apk --debug
if ($LASTEXITCODE -ne 0) { Write-Host "BUILD FAILED" -ForegroundColor Red; exit 1 }
Write-Host "   Build OK." -ForegroundColor Green

# ── 3. COPY APK TO SHORT PATH (no spaces) ───────────────────
Write-Host "`n[3/5] Copying APK to C:\tmp\solq.apk ..." -ForegroundColor Cyan
New-Item -ItemType Directory -Path C:\tmp -Force | Out-Null
Copy-Item -LiteralPath $APK_SRC -Destination $APK_TMP -Force
Write-Host "   Copied." -ForegroundColor Green

# ── 4. PUSH + INSTALL ON DEVICE ─────────────────────────────
Write-Host "`n[4/5] Pushing APK to device..." -ForegroundColor Cyan
& "$ADB" push $APK_TMP /data/local/tmp/solq.apk
Write-Host "   Installing via pm install..." -ForegroundColor Cyan
$result = & "$ADB" shell pm install -r -d -g /data/local/tmp/solq.apk
Write-Host "   pm result: $result"
if ($result -notmatch "Success") {
    Write-Host "INSTALL FAILED: $result" -ForegroundColor Red
    exit 1
}
Write-Host "   Installed OK." -ForegroundColor Green

# ── 5. LAUNCH APP ────────────────────────────────────────────
Write-Host "`n[5/5] Launching $PKG ..." -ForegroundColor Cyan
& "$ADB" shell monkey -p $PKG -c android.intent.category.LAUNCHER 1

Write-Host "`nSOLQ is running on device." -ForegroundColor Green
Write-Host "To see logs: adb logcat -s flutter" -ForegroundColor White
