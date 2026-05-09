// SOLQ APK — DEMO NO-SECURITY build configuration
// Simulation mode (IS_SIMULATION=true) + zero security checks
// Safe to install on any Android without developer-mode or root gates

const String kAppEnv          = 'demo-nosec';
const String kAppName          = 'SOLQ Demo';
const String kApiBase          = 'https://solq.vercel.app';
const bool   kIsSimulation     = true;
const bool   kSecurityEnabled  = false;
const String kSolanaCluster    = 'devnet';
const int    kPlatformFeeBps   = 50;  // 0.5% — locked, do not change
