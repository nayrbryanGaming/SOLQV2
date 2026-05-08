// SOLQ APK — LIVE / PRODUCTION CONFIG
// Build: flutter build apk --dart-define-from-file=apk-live/env.json --target=lib/main_live.dart
// or:    flutter build apk --dart-define=APP_ENV=live --dart-define=API_BASE=https://solq.vercel.app

const String kAppEnv         = 'live';
const String kAppName         = 'SOLQ';
const String kApiBase         = 'https://solq.vercel.app';
const String kRpcEndpoint     = 'https://api.mainnet-beta.solana.com';
const String kIdrxMint        = 'idrxZcP8xiKkYk6XGD4uz1dxEYCWSgKDHqgjsBbwDur';
const String kSolMint         = 'So11111111111111111111111111111111111111112';
const String kUsdcMint        = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const bool   kIsSimulation    = false;
const bool   kShowSimBadge    = false;
const String kSolanaCluster   = 'mainnet-beta';
const int    kPlatformFeeBps  = 50; // 0.5% — no minimum
