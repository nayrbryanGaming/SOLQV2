#!/usr/bin/env bash
# SOLQ APK — DEMO / SIMULATION build script
# Run from repo root: bash apk-demo/build.sh
# IMPORTANT: APK built with this script MUST show SIMULASI badge — no real funds move.

set -e
cd "$(dirname "$0")/.."   # run from repo root regardless of CWD
mkdir -p ./debug-info      # BUG-C005 fix: required by --split-debug-info

echo "Building SOLQ DEMO APK (SIMULATION mode)..."

flutter build apk \
  --release \
  --dart-define=APP_ENV=demo \
  --dart-define=API_BASE=https://solq.vercel.app \
  --dart-define=RPC_ENDPOINT=https://api.devnet.solana.com \
  --dart-define=IS_SIMULATION=true \
  --dart-define=SOLANA_CLUSTER=devnet

OUTPUT="apk-demo/solq-demo-$(date +%Y%m%d).apk"
cp build/app/outputs/flutter-apk/app-release.apk "$OUTPUT"

echo "Done: $OUTPUT"
echo "NOTE: This APK is SIMULATION only. Ensure kShowSimBadge=true is visible in the app UI."
