// SOLQ APK — NO-SECURITY / DEMO CONFIG
// All security checks (root detection, developer mode) are disabled.
// Real mainnet — real Solana transactions. For live investor/CEO demo only.
//
// Build: flutter build apk --dart-define=APP_ENV=nosec --target=lib/main_nosec.dart

const String kAppEnv          = 'nosec';
const String kAppName          = 'SOLQ';
const String kApiBase          = 'https://solq.vercel.app';
const String kRpcEndpoint      = 'https://api.mainnet-beta.solana.com';
const String kIdrxMint         = 'idrxZcP8xiKkYk6XGD4uz1dxEYCWSgKDHqgjsBbwDur';
const String kSolMint          = 'So11111111111111111111111111111111111111112';
const String kUsdcMint         = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const bool   kIsSimulation     = false;
const bool   kShowSimBadge     = false;
const bool   kSecurityEnabled  = false; // intentionally OFF for demo
const String kSolanaCluster    = 'mainnet-beta';
const int    kPlatformFeeBps   = 50; // 0.5%
