// SOLQ APK — DEMO / SIMULATION CONFIG
// Build: flutter build apk --dart-define-from-file=apk-demo/env.json --target=lib/main_demo.dart
// or:    flutter build apk --dart-define=APP_ENV=demo --dart-define=API_BASE=https://solq.vercel.app

const String kAppEnv         = 'demo';
const String kAppName         = 'SOLQ Demo';
const String kApiBase         = 'https://solq.vercel.app';
const String kRpcEndpoint     = 'https://api.devnet.solana.com';
const String kIdrxMint        = 'idrxZcP8xiKkYk6XGD4uz1dxEYCWSgKDHqgjsBbwDur';
const String kSolMint         = 'So11111111111111111111111111111111111111112';
const String kUsdcMint        = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const bool   kIsSimulation    = true;
const bool   kShowSimBadge    = true;   // always show SIMULASI banner
const String kSolanaCluster   = 'devnet';
const int    kPlatformFeeBps  = 50; // 0.5% — no minimum (same as live, for honest demo)
