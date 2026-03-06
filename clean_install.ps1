# TAHAPAN RELEASE APK WAJIB HAPUS APP DEBUG LAMA SEBELUM INSTALL BARU
Write-Host "Uninstalling old debug app: com.example.solq"
adb uninstall com.example.solq
Start-Sleep -Seconds 2
Write-Host "Old app uninstalled. Proceeding..."
