/// AppConfig — single source of truth for environment flags.
///
/// Build with devnet:
///   flutter run --dart-define=DEVNET=true
///
/// Build for production (mainnet):
///   flutter build apk
///   flutter build appbundle
class AppConfig {
  AppConfig._();

  /// true → devnet (testing), false → mainnet-beta (production)
  static const bool isDevnet =
      bool.fromEnvironment('DEVNET', defaultValue: false);

  static const String cluster = isDevnet ? 'devnet' : 'mainnet-beta';

  static const String appUrl = 'https://solq.my.id';

  /// Backend API base URL — devnet points to staging, mainnet to production
  static const String apiBaseUrl = isDevnet
      ? 'https://solq-staging.vercel.app/api/v1'
      : 'https://solq.vercel.app/api/v1';

  static const List<String> apiBaseUrlFallbacks = isDevnet
      ? [
          'https://solq-staging.vercel.app/api/v1',
          'https://solq-dev.onrender.com/v1',
        ]
      : [
          'https://solq.vercel.app/api/v1',
          'https://solq-api.vercel.app/api/v1',
          'https://solq-backend.onrender.com/v1',
          'https://solq.railway.app/api/v1',
        ];

  static const String solanaExplorerBase = isDevnet
      ? 'https://explorer.solana.com/tx/{sig}?cluster=devnet'
      : 'https://explorer.solana.com/tx/{sig}';

  static String explorerTxUrl(String signature) =>
      solanaExplorerBase.replaceFirst('{sig}', signature);

  /// Fee wallet — all platform revenue
  static const String feeWallet =
      'ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m';

  /// IDRX mint (mainnet). Devnet uses USDC as substitute.
  static const String idrxMint = isDevnet
      ? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
      : 'idrxZcP8xiKkYk6XGD4uz1dxEYCWSgKDHqgjsBbwDur';
}
