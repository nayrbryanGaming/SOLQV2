#!/usr/bin/env bash
# SOLQ APK — DEMO NO-SECURITY build
# Simulation mode + zero security checks.
# Runs on ANY Android device (no root/developer-mode gate).
# Uses devnet — NO real funds move.
#
# Run from repo root:  bash apk-demo-nosec/build.sh

set -e

echo "============================================"
echo "  SOLQ DEMO NO-SECURITY APK  (devnet / sim)"
echo "============================================"

flutter build apk \
  --release \
  --target=lib/main_nosec.dart \
  --dart-define=APP_ENV=demo-nosec \
  --dart-define=API_BASE=https://solq.vercel.app \
  --dart-define=RPC_ENDPOINT=https://api.devnet.solana.com \
  --dart-define=IS_SIMULATION=true \
  --dart-define=SOLANA_CLUSTER=devnet \
  --dart-define=SECURITY_ENABLED=false

OUTPUT="apk-demo-nosec/solq-demo-nosec-$(date +%Y%m%d).apk"
cp build/app/outputs/flutter-apk/app-release.apk "$OUTPUT"

echo ""
echo "Done: $OUTPUT"
echo "Install on any Android device (no sideload restrictions):"
echo "  adb install -r $OUTPUT"
