import 'package:flutter/foundation.dart';

// CONDITIONAL IMPORT: Stub on native, real JS interop on web.
// This file never touches dart:js directly — the conditional export handles it.
import 'web_provider_stub.dart'
    if (dart.library.js_interop) 'web_provider_web.dart'
    if (dart.library.html) 'web_provider_web.dart'
    as platform;

/// Platform-safe WebProvider facade.
/// On Android/iOS: all methods return null (no JS runtime).
/// On Web: delegates to real dart:js interop for Phantom/Backpack browser extensions.
class WebProvider {
  static bool get isSupported => kIsWeb;

  static Future<String?> connectPhantom() => platform.WebProviderImpl.connectPhantom();
  static Future<String?> signTransaction(String base64Tx) => platform.WebProviderImpl.signTransaction(base64Tx);
}
