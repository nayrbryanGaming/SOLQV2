# SOLQ ABSOLUTE CONNECTIVITY LOCKDOWN
# Run as Administrator

Write-Host "--- SOLQ MILITARY-GRADE CONNECTIVITY FIX ---" -ForegroundColor Cyan

# 1. Force Private Network Profile (Necessary for standard inbound rules)
Write-Host "Enforcing Private Network Category..."
Get-NetConnectionProfile | Set-NetConnectionProfile -NetworkCategory Private -ErrorAction SilentlyContinue

# 2. Reset and Apply Global Rules
Write-Host "Resetting SOLQ Firewall Rules..."
Remove-NetFirewallRule -DisplayName "SOLQ_*" -ErrorAction SilentlyContinue

Write-Host "Applying Global Access for Port 3000 (Backend)..."
New-NetFirewallRule -DisplayName "SOLQ_Backend" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow -Profile Any -EdgeTraversalPolicy Allow

Write-Host "Applying Global Access for Port 8080 (Webhook)..."
New-NetFirewallRule -DisplayName "SOLQ_Webhook" -Direction Inbound -LocalPort 8080 -Protocol TCP -Action Allow -Profile Any -EdgeTraversalPolicy Allow

# 3. Verify
Write-Host "--- FIX APPLIED ---" -ForegroundColor Green
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127*" -and $_.InterfaceAlias -notlike "*Loopback*" }).IPAddress[0]
Write-Host "DEPLOYMENT IP: $ip" -ForegroundColor Yellow
Write-Host "Ensure your phone is on the same Wi-Fi and the Backend is RUNNING."
