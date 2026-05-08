import 'package:flutter/foundation.dart';

/// Centralized logger that strips ALL output in production builds.
/// Replaces raw debugPrint/print calls that could leak sensitive data.
///
/// Usage:
///   AppLogger.debug('Got balance: $balance');    // stripped in release
///   AppLogger.warn('Session expired');            // stripped in release
///   AppLogger.error('TX failed', error: e);       // stripped in release
class AppLogger {
  AppLogger._();

  static void debug(String message) {
    if (kDebugMode) debugPrint('[SOLQ] $message');
  }

  static void warn(String message) {
    if (kDebugMode) debugPrint('[SOLQ WARN] $message');
  }

  static void error(String message, {Object? error, StackTrace? stack}) {
    if (kDebugMode) {
      debugPrint('[SOLQ ERROR] $message');
      if (error != null) debugPrint('  Error: $error');
      if (stack != null) debugPrint('  Stack: $stack');
    }
  }
}
