// API-compatible stub for espressocash solana_mobile_wallet_adapter_client.
// LocalAssociation over Android local websocket is implemented via platform
// channels by solana_service.dart; this file provides the type surface only.
library solana_mobile_wallet_adapter_client;

import 'dart:typed_data';

/// Port range for the MWA local association server.
class Uint16Range {
  final int min;
  final int max;
  const Uint16Range(this.min, this.max);
}

/// A single account returned by the wallet during authorize/reauthorize.
class Account {
  final Uint8List publicKey;
  final String? displayAddress;
  const Account({required this.publicKey, this.displayAddress});
}

/// Result of a successful authorize / reauthorize call.
class AuthorizationResult {
  final String authToken;
  final List<Account> accounts;
  const AuthorizationResult({required this.authToken, required this.accounts});
}

/// Result of signAndSendTransactions.
class SignAndSendTransactionsResult {
  /// Base58-encoded transaction signatures, one per submitted transaction.
  final List<Uint8List> signatures;
  const SignAndSendTransactionsResult({required this.signatures});
}

/// Minimal MWA JSON-RPC client interface.
abstract class MobileWalletAdapterClient {
  Future<AuthorizationResult> authorize({
    required Uri identityUri,
    required Uri iconUri,
    required String identityName,
    required String cluster,
  });

  Future<AuthorizationResult> reauthorize({
    required Uri identityUri,
    required Uri iconUri,
    required String identityName,
    required String authToken,
  });

  Future<SignAndSendTransactionsResult> signAndSendTransactions({
    required List<Uint8List> transactions,
  });
}

/// Manages a single MWA local association session.
///
/// On Android, this launches the wallet via Intent and connects over the MWA
/// local websocket protocol. On other platforms this always throws
/// [UnsupportedError] — MWA is Android-only.
class LocalAssociationScenario {
  final Uint16Range portRange;

  LocalAssociationScenario._({required this.portRange});

  /// Creates a new scenario. Call [startActivityForResult] then [start].
  static Future<LocalAssociationScenario> create({
    required Uint16Range portRange,
  }) async {
    return LocalAssociationScenario._(portRange: portRange);
  }

  /// Signals Android to launch the wallet selection activity.
  /// No-op on non-Android platforms.
  void startActivityForResult(dynamic intent, dynamic options) {}

  /// Starts the local association and returns an authenticated client.
  ///
  /// Throws [UnsupportedError] on non-Android platforms.
  /// Throws [TimeoutException] if no wallet responds within the timeout.
  Future<MobileWalletAdapterClient> start() async {
    throw UnsupportedError(
      'MWA LocalAssociation requires Android with a MWA-compatible wallet '
      '(Phantom, Solflare, etc.) installed.',
    );
  }

  /// Closes the association and releases resources.
  Future<void> close() async {}
}
