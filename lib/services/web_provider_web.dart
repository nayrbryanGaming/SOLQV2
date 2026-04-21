import 'dart:js_interop';

@JS()
@staticInterop
class WebProviderImpl {
  static bool get isSupported => true;

  static Future<String?> connectWallet(String walletHint) async {
    try {
      final promise = _connectWithHintJS(walletHint.toJS);
      final result = await promise.toDart;
      if (result == null) return null;
      return (result as JSString).toDart;
    } catch (_) {
      return null;
    }
  }

  static Future<String?> connectPhantom() async {
    return connectWallet('phantom');
  }

  static Future<String?> connectMetamask() async {
    return connectWallet('metamask');
  }

  static Future<String?> signTransaction(String base64Tx,
      {String? walletHint}) async {
    try {
      final normalizedHint = (walletHint ?? '').trim().toLowerCase();
      final promise = _signJS(base64Tx.toJS, normalizedHint.toJS);
      final result = await promise.toDart;
      if (result == null) return null;
      return (result as JSString).toDart;
    } catch (e) {
      return null;
    }
  }
}

@JS('window.solqConnect')
external JSPromise _connectWithHintJS(JSString walletHint);

@JS('window.solqSign')
external JSPromise _signJS(JSString tx, [JSString? walletHint]);
