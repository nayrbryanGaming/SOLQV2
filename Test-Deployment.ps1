# Test SOLQ Vercel Deployment (PowerShell)

param(
    [string]$Domain = "solq.my.id",
    [string]$Environment = "production"
)

$baseUrl = "https://$Domain/api"

Write-Host "🧪 Testing SOLQ Vercel Deployment" -ForegroundColor Cyan
Write-Host "Domain: $Domain" -ForegroundColor Cyan
Write-Host "Environment: $Environment" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

# Test 1: Health Check
Write-Host ""
Write-Host "1️⃣  Testing Health Endpoint..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/health" -Method GET
    Write-Host "✅ Health Check Passed" -ForegroundColor Green
    $response | ConvertTo-Json
} catch {
    Write-Host "❌ Health Check Failed: $_" -ForegroundColor Red
}

# Test 2: Stats
Write-Host ""
Write-Host "2️⃣  Testing Stats Endpoint..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/v1/stats" -Method GET
    Write-Host "✅ Stats Endpoint Working" -ForegroundColor Green
    $response | ConvertTo-Json
} catch {
    Write-Host "❌ Stats Endpoint Failed: $_" -ForegroundColor Red
}

# Test 3: Create Payment Intent
Write-Host ""
Write-Host "3️⃣  Creating Payment Intent..." -ForegroundColor Yellow
try {
    $body = @{
        qris_payload = "test_qris"
        currency = "IDRX"
        input_amount = 100000
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Uri "$baseUrl/v1/payment-intents" `
        -Method POST `
        -ContentType "application/json" `
        -Body $body

    Write-Host "✅ Payment Intent Created" -ForegroundColor Green
    $response | ConvertTo-Json

    $intentId = $response.intent_id

    # Test 4: Get Payment Intent
    if ($intentId) {
        Write-Host ""
        Write-Host "4️⃣  Getting Payment Intent (ID: $intentId)..." -ForegroundColor Yellow
        try {
            $getResponse = Invoke-RestMethod -Uri "$baseUrl/v1/payment-intents?id=$intentId" -Method GET
            Write-Host "✅ Payment Intent Retrieved" -ForegroundColor Green
            $getResponse | ConvertTo-Json

            # Test 5: Confirm Payment Intent
            Write-Host ""
            Write-Host "5️⃣  Confirming Payment Intent..." -ForegroundColor Yellow
            $confirmBody = @{
                tx_hash = "test_tx_hash_12345"
            } | ConvertTo-Json

            $confirmResponse = Invoke-RestMethod -Uri "$baseUrl/v1/payment-intents?id=$intentId" `
                -Method POST `
                -ContentType "application/json" `
                -Body $confirmBody

            Write-Host "✅ Payment Intent Confirmed" -ForegroundColor Green
            $confirmResponse | ConvertTo-Json
        } catch {
            Write-Host "❌ Payment Intent Operation Failed: $_" -ForegroundColor Red
        }
    }
} catch {
    Write-Host "❌ Payment Intent Creation Failed: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "================================" -ForegroundColor Cyan
Write-Host "✅ Testing Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "  Domain: $Domain" -ForegroundColor White
Write-Host "  Health: /api/health" -ForegroundColor White
Write-Host "  Stats: /api/v1/stats" -ForegroundColor White
Write-Host "  Create Intent: POST /api/v1/payment-intents" -ForegroundColor White
Write-Host "  Get Intent: GET /api/v1/payment-intents?id=<id>" -ForegroundColor White
Write-Host "  Confirm Intent: POST /api/v1/payment-intents?id=<id>" -ForegroundColor White

