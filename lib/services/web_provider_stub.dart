/// STUB: Mobile/Native platform fallback.
/// All methods return null because dart:js is not available on native.

class WebProviderImpl {
  static bool get isSupported => false;

  static Future<String?> connectWallet(String walletHint) async => null;
  static Future<String?> connectPhantom() async => null;
  static Future<String?> connectMetamask() async => null;
  static Future<String?> signTransaction(String tx, {String? walletHint}) async =>
      null;
}
