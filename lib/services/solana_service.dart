import 'dart:async';
import 'dart:convert';

import 'package:bs58/bs58.dart';
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
    LocalAssociationScenario? scenario;
    try {
      scenario = await LocalAssociationScenario.create(
        portRange: const Uint16Range(8900, 9000),
      );
      scenario.startActivityForResult(null, null);
      final client = await scenario.start().timeout(const Duration(seconds: 60));

      final result = await client.authorize(
        identityUri: Uri.parse(AppConfig.appUrl),
        iconUri: Uri.parse('${AppConfig.appUrl}/logo.png'),
        identityName: 'SOLQ',
        cluster: 'mainnet-beta',
      );

      _authToken = result.authToken;
      _publicKey = base58.encode(result.accounts.first.publicKey);

      await _storage.write(key: _keyAuthToken, value: _authToken);
      await _storage.write(key: _keyPublicKey, value: _publicKey);
      _sigCtrl.add('CONNECTED');
    } catch (e) {
      _sigCtrl.add('CONNECT_FAILED');
      rethrow;
    } finally {
      _isConnecting = false;
      await scenario?.close();
    }
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
  /// Emits "SIGNED:<intentId>:<txSignature>" to signatureStream on success.
  Future<void> signSwapTransaction(String base64Tx, String intentId) async {
    if (_authToken == null) throw Exception('Wallet not connected');
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
