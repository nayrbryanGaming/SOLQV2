# SOLQ AGGRESSIVE CONNECTIVITY RESET
# Run as Administrator

Write-Host "--- SOLQ AGGRESSIVE RESET ---" -ForegroundColor Cyan

# 1. Force Network Category to Private for Wi-Fi
Write-Host "Forcing Wi-Fi to Private profile..."
Get-NetConnectionProfile -InterfaceAlias "Wi-Fi" | Set-NetConnectionProfile -NetworkCategory Private

# 2. Reset and Re-apply Firewall Rules
Write-Host "Re-applying SOLQ Firewall Rules (Any-Any for Ports 3000, 8080)..."
Remove-NetFirewallRule -DisplayName "SOLQ_*" -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName "SOLQ_Backend" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow -Profile Any
New-NetFirewallRule -DisplayName "SOLQ_Webhook" -Direction Inbound -LocalPort 8080 -Protocol TCP -Action Allow -Profile Any

# 3. Restart ADB (Ensures phone visibility for install)
Write-Host "Restarting ADB Server..."
adb kill-server
adb start-server

# 4. Show current IP for confirmation
$ip = (Get-NetIPAddress -InterfaceAlias "Wi-Fi" -AddressFamily IPv4).IPAddress
Write-Host "YOUR IP: $ip" -ForegroundColor Green
Write-Host "Ensure app is hitting: http://$ip:3000/v1"

Write-Host "--- DONE ---" -ForegroundColor Green
