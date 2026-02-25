# SOLQ Connectivity Fix Script
# Run this as Administrator to open Ports 3000 (Backend) and 8080 (Webhook)

Write-Host "--- SOLQ CONNECTIVITY LOCKDOWN ---" -ForegroundColor Cyan

# 1. Open Port 3000 (Backend)
Write-Host "Opening Port 3000 (SOLQ Orchestrator)..."
New-NetFirewallRule -DisplayName "SOLQ_Backend" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow -ErrorAction SilentlyContinue

# 2. Open Port 8080 (Webhook)
Write-Host "Opening Port 8080 (Webhook Service)..."
New-NetFirewallRule -DisplayName "SOLQ_Webhook" -Direction Inbound -LocalPort 8080 -Protocol TCP -Action Allow -ErrorAction SilentlyContinue

Write-Host "--- DONE ---" -ForegroundColor Green
Write-Host "Your IP is likely 192.168.18.15. Ensure your phone is on the same WiFi."
