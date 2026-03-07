#!/bin/bash
# Test SOLQ Vercel Deployment

DOMAIN="solq.my.id"
BASE_URL="https://${DOMAIN}/api"

echo "🧪 Testing SOLQ Vercel Deployment"
echo "Domain: ${DOMAIN}"
echo "=================================="

# Test 1: Health Check
echo ""
echo "1️⃣  Testing Health Endpoint..."
curl -s "${BASE_URL}/health" | jq . 2>/dev/null || curl -s "${BASE_URL}/health"

# Test 2: Stats
echo ""
echo "2️⃣  Testing Stats Endpoint..."
curl -s "${BASE_URL}/v1/stats" | jq . 2>/dev/null || curl -s "${BASE_URL}/v1/stats"

# Test 3: Create Payment Intent
echo ""
echo "3️⃣  Creating Payment Intent..."
INTENT=$(curl -s -X POST "${BASE_URL}/v1/payment-intents" \
  -H "Content-Type: application/json" \
  -d '{"qris_payload":"test_qris","currency":"IDRX","input_amount":100000}')
echo "$INTENT" | jq . 2>/dev/null || echo "$INTENT"

# Extract intent ID if possible
INTENT_ID=$(echo "$INTENT" | jq -r '.intent_id' 2>/dev/null || echo "unknown")

# Test 4: Get Payment Intent
if [ "$INTENT_ID" != "unknown" ]; then
  echo ""
  echo "4️⃣  Getting Payment Intent (ID: ${INTENT_ID})..."
  curl -s "${BASE_URL}/v1/payment-intents?id=${INTENT_ID}" | jq . 2>/dev/null || \
    curl -s "${BASE_URL}/v1/payment-intents?id=${INTENT_ID}"

  # Test 5: Confirm Payment Intent
  echo ""
  echo "5️⃣  Confirming Payment Intent..."
  curl -s -X POST "${BASE_URL}/v1/payment-intents?id=${INTENT_ID}" \
    -H "Content-Type: application/json" \
    -d '{"tx_hash":"test_tx_hash_12345"}' | jq . 2>/dev/null || \
    curl -s -X POST "${BASE_URL}/v1/payment-intents?id=${INTENT_ID}" \
      -H "Content-Type: application/json" \
      -d '{"tx_hash":"test_tx_hash_12345"}'
fi

echo ""
echo "=================================="
echo "✅ Testing Complete!"

