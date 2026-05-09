#!/usr/bin/env bash
# SOLQ APK — NO-SECURITY build (demo / CEO presentation)
# No jailbreak detection, no developer-mode gate, no screenshot prevention.
# Connects to REAL mainnet — real Solana transactions.
#
# Run from repo root:  bash apk-nosec/build.sh

set -e
cd "$(dirname "$0")/.."   # run from repo root regardless of CWD
mkdir -p ./debug-info      # BUG-C005 fix: required by --split-debug-info

echo "============================================"
echo "  SOLQ NO-SECURITY APK  (mainnet / demo)"
echo "============================================"

flutter build apk \
  --release \
  --target=lib/main_nosec.dart \
  --dart-define=APP_ENV=nosec \
  --dart-define=API_BASE=https://solq.vercel.app \
  --dart-define=RPC_ENDPOINT=https://api.mainnet-beta.solana.com \
  --dart-define=IS_SIMULATION=false \
  --dart-define=SOLANA_CLUSTER=mainnet-beta \
  --dart-define=SECURITY_ENABLED=false

OUTPUT="apk-nosec/solq-nosec-$(date +%Y%m%d).apk"
cp build/app/outputs/flutter-apk/app-release.apk "$OUTPUT"

echo ""
echo "Done: $OUTPUT"
echo "Install on any Android device:"
echo "  adb install -r $OUTPUT"
