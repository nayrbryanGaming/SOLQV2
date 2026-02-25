/// STUB: Mobile/Native platform fallback.
/// All methods return null because dart:js is not available on native.

class WebProviderImpl {
  static bool get isSupported => false;

  static Future<String?> connectPhantom() async => null;
  static Future<String?> signTransaction(String base64Tx) async => null;
}
