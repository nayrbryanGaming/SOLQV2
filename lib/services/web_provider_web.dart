// ignore: avoid_web_libraries_in_flutter
import 'dart:js' as js;

/// REAL WEB IMPLEMENTATION: Only compiled when target is web.
class WebProviderImpl {
  static bool get isSupported => true;

  static Future<String?> connectPhantom() async {
    try {
      final res = await js.context.callMethod('eval', ["""
        (async () => {
          if ('solana' in window) {
            const provider = window.solana;
            if (provider.isPhantom) {
              const resp = await provider.connect();
              return resp.publicKey.toString();
            }
          }
          return null;
        })()
      """]);
      return res;
    } catch (e) {
      print("[WEB] Phantom Error: $e");
      return null;
    }
  }

  static Future<String?> signTransaction(String base64Tx) async {
    try {
      final res = await js.context.callMethod('eval', ["""
        (async () => {
          if ('solana' in window) {
            const provider = window.solana;
            const tx = await provider.signTransaction(Uint8List.fromList(atob('$base64Tx').split('').map(c => c.charCodeAt(0))));
            return btoa(String.fromCharCode.apply(null, Array.from(tx.serialize())));
          }
          return null;
        })()
      """]);
      return res;
    } catch (e) {
      print("[WEB] Sign Error: $e");
      return null;
    }
  }
}
