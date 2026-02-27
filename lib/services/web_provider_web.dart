import 'dart:js_interop';

@JS()
@staticInterop
class WebProviderImpl {
  static bool get isSupported => true;

  static Future<String?> connectPhantom() async {
    try {
      final promise = _connectJS();
      final result = await promise.toDart;
      return (result as JSString).toDart;
    } catch (e) {
      return null;
    }
  }

  static Future<String?> connectMetamask() async {
    return connectPhantom();
  }

  static Future<String?> signTransaction(String base64Tx) async {
    try {
      final promise = _signJS(base64Tx.toJS);
      final result = await promise.toDart;
      return (result as JSString).toDart;
    } catch (e) {
      return null;
    }
  }
}

@JS('window.solqConnect')
external JSPromise _connectJS();

@JS('window.solqSign')
external JSPromise _signJS(JSString tx);
