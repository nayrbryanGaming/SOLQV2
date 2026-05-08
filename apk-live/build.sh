#!/usr/bin/env bash
# SOLQ APK — LIVE build script
# Run from repo root: bash apk-live/build.sh

set -e

echo "Building SOLQ LIVE APK..."

flutter build apk \
  --release \
  --dart-define=APP_ENV=live \
  --dart-define=API_BASE=https://solq.vercel.app \
  --dart-define=RPC_ENDPOINT=https://api.mainnet-beta.solana.com \
  --dart-define=IS_SIMULATION=false \
  --dart-define=SOLANA_CLUSTER=mainnet-beta

OUTPUT="apk-live/solq-live-$(date +%Y%m%d).apk"
cp build/app/outputs/flutter-apk/app-release.apk "$OUTPUT"

echo "Done: $OUTPUT"
