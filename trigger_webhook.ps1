$ErrorActionPreference = "Stop"

Write-Host "🔥 WARUNGPAY WEBHOOK TRIGGER (HARD PROOF #2)" -ForegroundColor Green
Write-Host "Use this to prove ASYNC CONTROL of the Orchestrator." -ForegroundColor Gray
Write-Host ""

$ip = Read-Host "Enter Phone IP Address (e.g. 192.168.1.5)"
if ([string]::IsNullOrWhiteSpace($ip)) { Write-Error "IP Address is required."; exit }

$intentId = Read-Host "Enter ACTIVE Intent UUID (from App Screen)"
if ([string]::IsNullOrWhiteSpace($intentId)) { Write-Error "Intent ID is required."; exit }

$refId = "REF-REAL-WEBHOOK-" + (Get-Random -Minimum 1000 -Maximum 9999)

$body = @{
    intentId = $intentId
    status   = "SETTLED"
    refId    = $refId
} | ConvertTo-Json

$url = "http://$($ip):8080/webhook/settlement"

Write-Host "Sending POST to $url..." -ForegroundColor Yellow
Write-Host "Payload: $body" -ForegroundColor Gray

try {
    $response = Invoke-RestMethod -Uri $url -Method Post -Body $body -ContentType "application/json"
    Write-Host "✅ SUCCESS! Response: $($response | ConvertTo-Json)" -ForegroundColor Green
    Write-Host "👉 CHECK YOUR PHONE SCREEN NOW via local network." -ForegroundColor Green
} catch {
    Write-Host "❌ FAILED: $_" -ForegroundColor Red
    Write-Host "Tip: Ensure phone and PC are on SAME WIFI."
    Write-Host "Tip: Ensure app is OPEN and server is running."
}

Pause
