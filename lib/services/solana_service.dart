import 'dart:async';
import 'dart:convert';
import 'dart:io' show Platform;

import 'package:bs58/bs58.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:solana_mobile_wallet_adapter_client/solana_mobile_wallet_adapter_client.dart';

import '../config/app_config.dart';

class SolanaService {
  static final SolanaService _instance = SolanaService._internal();
  factory SolanaService() => _instance;
  SolanaService._internal();

  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );
  static const _keyAuthToken = 'mwa_auth_token';
  static const _keyPublicKey = 'mwa_public_key';
  static const _mwaChannel = MethodChannel('com.solq.mwa');

  final _sigCtrl = StreamController<String>.broadcast();
  Stream<String> get signatureStream => _sigCtrl.stream;

  String? _publicKey;
  String? _authToken;
  bool _isConnecting = false;

  String? get connectedAddress => _publicKey;
  bool get isConnected => _publicKey != null && _authToken != null;
  bool get isConnecting => _isConnecting;

  // MWA is stateless per-operation; no session timer needed.
  void pauseSessionTimeout() {}
  void resumeSessionTimeout() {}

  Future<void> init() async {
    _authToken = await _storage.read(key: _keyAuthToken);
    _publicKey = await _storage.read(key: _keyPublicKey);
    if (_publicKey != null) _sigCtrl.add('CONNECTED');
  }

  Future<void> connect() async {
    if (_isConnecting) return;
    _isConnecting = true;
    try {
      if (Platform.isAndroid) {
        // Native MWA via platform channel (API 31+ required for X25519)
        final result = await _mwaChannel.invokeMapMethod<String, dynamic>(
          'associate',
          {'portMin': 8900, 'portMax': 9000},
        ).timeout(const Duration(seconds: 70));

        _authToken = result?['authToken'] as String?;
        _publicKey = result?['publicKey'] as String?;

        if (_publicKey == null || _authToken == null) {
          throw Exception('MWA returned invalid result');
        }
      } else {
        // Non-Android: use stub (throws UnsupportedError on non-Android)
        LocalAssociationScenario? scenario;
        try {
          scenario = await LocalAssociationScenario.create(
            portRange: const Uint16Range(8900, 9000),
          );
          scenario.startActivityForResult(null, null);
          final client = await scenario.start().timeout(const Duration(seconds: 60));
          final mwaResult = await client.authorize(
            identityUri: Uri.parse(AppConfig.appUrl),
            iconUri: Uri.parse('${AppConfig.appUrl}/logo.png'),
            identityName: 'SOLQ',
            cluster: AppConfig.cluster,
          );
          _authToken = mwaResult.authToken;
          _publicKey = base58.encode(mwaResult.accounts.first.publicKey);
        } finally {
          await scenario?.close();
        }
      }

      await _storage.write(key: _keyAuthToken, value: _authToken);
      await _storage.write(key: _keyPublicKey, value: _publicKey);
      _sigCtrl.add('CONNECTED');
    } catch (e) {
      _sigCtrl.add('CONNECT_FAILED');
      rethrow;
    } finally {
      _isConnecting = false;
    }
  }

  /// Connect with a manually entered wallet address (no wallet app required).
  /// Transactions will use Solana Pay URL fallback for signing.
  Future<void> connectManual(String address) async {
    if (address.isEmpty) throw ArgumentError('Address cannot be empty');
    _publicKey = address;
    _authToken = 'manual-connect';
    await _storage.write(key: _keyAuthToken, value: _authToken);
    await _storage.write(key: _keyPublicKey, value: _publicKey);
    _sigCtrl.add('CONNECTED');
  }

  /// Demo-only: connect with a hardcoded read-only address (no MWA required).
  /// Used in IS_SIMULATION=true builds so any device can demo without Phantom.
  Future<void> demoConnect() async {
    const demoAddress = 'DemoWa11etSO1Q2024xxxxxxxxxxxxxxxxxxxxxxxxxx';
    _publicKey = demoAddress;
    _authToken = 'demo-token';
    await _storage.write(key: _keyAuthToken, value: _authToken);
    await _storage.write(key: _keyPublicKey, value: _publicKey);
    _sigCtrl.add('CONNECTED');
  }

  Future<void> disconnect() async {
    _authToken = null;
    _publicKey = null;
    await _storage.delete(key: _keyAuthToken);
    await _storage.delete(key: _keyPublicKey);
    _sigCtrl.add('DISCONNECTED');
  }

  /// Signs and broadcasts a base64-encoded serialized transaction via MWA.
  /// On Android: uses native platform channel (reliable, no Transport error).
  /// On other platforms: uses Dart MWA library.
  /// Emits "SIGNED:<intentId>:<txSignature>" to signatureStream on success.
  Future<void> signSwapTransaction(String base64Tx, String intentId) async {
    if (_authToken == null) throw Exception('Wallet not connected');

    if (Platform.isAndroid) {
      // Native Android MWA — avoids "Transport error" from Dart LocalAssociationScenario
      final result = await _mwaChannel.invokeMapMethod<String, dynamic>(
        'signAndSend',
        {
          'authToken': _authToken!,
          'transaction': base64Tx,
          'portMin': 8900,
          'portMax': 9000,
        },
      ).timeout(const Duration(seconds: 90));

      final sig = result?['signature'] as String?;
      final newToken = result?['authToken'] as String?;

      if (sig == null || sig.isEmpty) {
        throw Exception('No signature returned from wallet');
      }

      // Update auth token if refreshed by wallet
      if (newToken != null && newToken.isNotEmpty && newToken != _authToken) {
        _authToken = newToken;
        await _storage.write(key: _keyAuthToken, value: newToken);
      }

      // Signature from MWA can be base64 (raw 64 bytes) or base58; normalise to base58
      final txSig = _normaliseSignature(sig);
      _sigCtrl.add('SIGNED:$intentId:$txSig');
      return;
    }

    // Non-Android: use Dart MWA library
    final txBytes = base64.decode(base64Tx);
    LocalAssociationScenario? scenario;
    try {
      scenario = await LocalAssociationScenario.create(
        portRange: const Uint16Range(8900, 9000),
      );
      scenario.startActivityForResult(null, null);
      final client = await scenario.start().timeout(const Duration(seconds: 60));

      await client.reauthorize(
        identityUri: Uri.parse(AppConfig.appUrl),
        iconUri: Uri.parse('${AppConfig.appUrl}/logo.png'),
        identityName: 'SOLQ',
        authToken: _authToken!,
      );

      final result = await client.signAndSendTransactions(transactions: [txBytes]);
      final txSig = base58.encode(result.signatures.first);
      _sigCtrl.add('SIGNED:$intentId:$txSig');
    } finally {
      await scenario?.close();
    }
  }

  /// Normalise a wallet signature to base58.
  /// MWA may return base64 (raw bytes) or already-base58 strings.
  String _normaliseSignature(String raw) {
    // Solana base58 signatures are 87–88 chars and only base58 alphabet
    final isBase58 = raw.length >= 80 && raw.length <= 100 &&
        RegExp(r'^[1-9A-HJ-NP-Za-km-z]+$').hasMatch(raw);
    if (isBase58) return raw;

    // Assume base64 → decode → re-encode as base58
    try {
      final bytes = base64.decode(raw);
      return base58.encode(bytes);
    } catch (_) {
      return raw; // return as-is and let caller validate
    }
  }

  bool isLikelySignature(String sig) {
    if (sig.length < 80 || sig.length > 100) return false;
    return RegExp(r'^[1-9A-HJ-NP-Za-km-z]+$').hasMatch(sig);
  }

  Future<bool> waitForSignature(String signature) async {
    const rpcUrl = AppConfig.isDevnet
        ? 'https://api.devnet.solana.com'
        : 'https://api.mainnet-beta.solana.com';
    for (var i = 0; i < 30; i++) {
      try {
        final response = await http.post(
          Uri.parse(rpcUrl),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({
            'jsonrpc': '2.0',
            'id': 1,
            'method': 'getSignatureStatuses',
            'params': [
              [signature],
              {'searchTransactionHistory': true},
            ],
          }),
        );
        final data = jsonDecode(response.body) as Map<String, dynamic>;
        final values = data['result']?['value'] as List?;
        final status = values?.isNotEmpty == true ? values!.first : null;
        final conf = (status as Map?)?['confirmationStatus'] as String?;
        if (conf == 'finalized' || conf == 'confirmed') return true;
      } catch (_) {}
      await Future.delayed(const Duration(seconds: 2));
    }
    return false;
  }

  Future<double> getBalance() async {
    if (_publicKey == null) return 0.0;
    const rpcUrl = AppConfig.isDevnet
        ? 'https://api.devnet.solana.com'
        : 'https://api.mainnet-beta.solana.com';
    try {
      final response = await http.post(
        Uri.parse(rpcUrl),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'jsonrpc': '2.0',
          'id': 1,
          'method': 'getBalance',
          'params': [_publicKey],
        }),
      );
      final data = jsonDecode(response.body) as Map<String, dynamic>;
      final lamports = data['result']?['value'] as int? ?? 0;
      return lamports / 1e9;
    } catch (_) {
      return 0.0;
    }
  }

  Future<void> syncConnectedAddressFromOnChain(String? addr) async {
    if (addr == null || addr.isEmpty) return;
    _publicKey = addr;
    await _storage.write(key: _keyPublicKey, value: addr);
  }
}
