import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:app_links/app_links.dart';
import 'package:bs58/bs58.dart';
import 'package:flutter/foundation.dart';
import 'package:pinenacl/x25519.dart' as pn;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:solana/solana.dart';
import 'package:url_launcher/url_launcher.dart';

import 'web_provider.dart';

class SolanaService {
  static final SolanaService _instance = SolanaService._internal();
  factory SolanaService() => _instance;

  static const String _appUrl = 'https://solq.vercel.app';
  static const String _onConnectRedirect = 'solq://onconnect';
  static const String _onSignRedirect = 'solq://onsign';
  static const String _seenWalletsKey = 'solq_seen_wallets';
  static const String _phantomDappPrivateKeyStorageKey =
      'solq_phantom_dapp_private_key';
  static const String _phantomDappPublicKeyStorageKey =
      'solq_phantom_dapp_public_key';
  static const String _phantomWalletPubKeyStorageKey =
      'solq_phantom_wallet_public_key';
  static const String _phantomSessionTokenStorageKey =
      'solq_phantom_session_token';
  static const List<String> _addressFieldKeys = [
    'public_key',
    'publicKey',
    'pubKey',
    'address',
    'solanaAddress',
    'solana_address',
    'wallet_address',
    'walletAddress',
    'wallet_pubkey',
    'walletPubkey',
    'account',
    'account_address',
    'accountAddress',
    'account_key',
    'accountKey',
    'wallet',
    'user_public_key',
    'userPublicKey',
    'pubkey',
    'selectedAddress',
  ];
  static const List<String> _signatureFieldKeys = [
    'signature',
    'sig',
    'tx_hash',
    'txHash',
    'transactionSignature',
  ];

  // Multi-RPC failover for read operations.
  static const List<String> _rpcEndpoints = [
    'https://api.mainnet-beta.solana.com',
    'https://solana-mainnet.g.alchemy.com/v2/demo',
    'https://rpc.ankr.com/solana',
    'https://helius-rpc.com/',
  ];

  String? _phantomDappPubKeyB58;
  pn.PrivateKey? _phantomDappPrivateKey;
  String? _phantomWalletPubKeyB58;
  String? _phantomSessionToken;

  int _currentRpcIndex = 0;
  Timer? _connectFallbackTimer;
  bool _deepLinksInitialized = false;
  static const Duration _connectFallbackDelay = Duration(seconds: 12);

  String? _connectedPublicKey;
  String? _connectedWalletType;

  final StreamController<String> _signatureController =
      StreamController<String>.broadcast();
  Stream<String> get signatureStream => _signatureController.stream;

  SolanaService._internal() {
    unawaited(_bootstrap());
  }

  Future<void> _bootstrap() async {
    await _restorePhantomSessionState();
    _initDeepLinks();
    await _loadSavedConnection();
  }

  void _preparePhantomConnectSession() {
    final key = pn.PrivateKey.generate();
    _phantomDappPrivateKey = key;
    _phantomDappPubKeyB58 = base58.encode(key.publicKey.asTypedList);
    _phantomWalletPubKeyB58 = null;
    _phantomSessionToken = null;
  }

  Future<void> _restorePhantomSessionState() async {
    final prefs = await SharedPreferences.getInstance();

    var restored = false;
    final storedPrivate = prefs.getString(_phantomDappPrivateKeyStorageKey);
    final storedPublic = prefs.getString(_phantomDappPublicKeyStorageKey);

    if (storedPrivate != null && storedPublic != null) {
      try {
        final privateBytes = Uint8List.fromList(base58.decode(storedPrivate));
        if (privateBytes.length == 32) {
          final restoredPrivateKey = pn.PrivateKey(privateBytes);
          final derivedPublic =
              base58.encode(restoredPrivateKey.publicKey.asTypedList);
          if (derivedPublic == storedPublic) {
            _phantomDappPrivateKey = restoredPrivateKey;
            _phantomDappPubKeyB58 = storedPublic;
            restored = true;
          }
        }
      } catch (_) {
        restored = false;
      }
    }

    if (!restored) {
      _preparePhantomConnectSession();
      await _persistPhantomSessionState(prefs: prefs);
    }

    _phantomWalletPubKeyB58 = prefs.getString(_phantomWalletPubKeyStorageKey);
    _phantomSessionToken = prefs.getString(_phantomSessionTokenStorageKey);
  }

  Future<void> _persistPhantomSessionState({SharedPreferences? prefs}) async {
    final storage = prefs ?? await SharedPreferences.getInstance();

    final dappPrivate = _phantomDappPrivateKey;
    final dappPublic = _phantomDappPubKeyB58;

    if (dappPrivate != null && dappPublic != null) {
      await storage.setString(
          _phantomDappPrivateKeyStorageKey,
          base58.encode(dappPrivate.asTypedList));
      await storage.setString(_phantomDappPublicKeyStorageKey, dappPublic);
    } else {
      await storage.remove(_phantomDappPrivateKeyStorageKey);
      await storage.remove(_phantomDappPublicKeyStorageKey);
    }

    if (_phantomWalletPubKeyB58 != null && _phantomWalletPubKeyB58!.isNotEmpty) {
      await storage.setString(
          _phantomWalletPubKeyStorageKey, _phantomWalletPubKeyB58!);
    } else {
      await storage.remove(_phantomWalletPubKeyStorageKey);
    }

    if (_phantomSessionToken != null && _phantomSessionToken!.isNotEmpty) {
      await storage.setString(
          _phantomSessionTokenStorageKey, _phantomSessionToken!);
    } else {
      await storage.remove(_phantomSessionTokenStorageKey);
    }
  }

  Future<void> _resetPhantomConnectSession() async {
    _preparePhantomConnectSession();
    await _persistPhantomSessionState();
  }

  Map<String, dynamic>? _decodePhantomEncryptedData(Uri uri) {
    final phantomPub = uri.queryParameters['phantom_encryption_public_key'];
    final nonce = uri.queryParameters['nonce'];
    final data = uri.queryParameters['data'];
    final privateKey = _phantomDappPrivateKey;

    if (phantomPub == null || nonce == null || data == null) {
      return null;
    }
    if (privateKey == null) {
      return null;
    }

    try {
      final phantomPubBytes = Uint8List.fromList(base58.decode(phantomPub));
      final nonceBytes = Uint8List.fromList(base58.decode(nonce));
      final cipherBytes = Uint8List.fromList(base58.decode(data));

      if (phantomPubBytes.length != 32 || nonceBytes.length != 24) {
        return null;
      }

      final box = pn.Box(
        myPrivateKey: privateKey,
        theirPublicKey: pn.PublicKey(phantomPubBytes),
      );

      final decrypted = box.decrypt(
        pn.EncryptedMessage(nonce: nonceBytes, cipherText: cipherBytes),
      );
      final decoded = _decodeJsonObject(utf8.decode(decrypted));
      if (decoded == null) {
        return null;
      }

      _phantomWalletPubKeyB58 = phantomPub;
      final session = decoded['session']?.toString();
      if (session != null && session.isNotEmpty) {
        _phantomSessionToken = session;
      }
      unawaited(_persistPhantomSessionState());

      return decoded;
    } catch (_) {
      return null;
    }
  }

  Map<String, String>? _buildPhantomEncryptedPayload(
      Map<String, dynamic> payload) {
    final privateKey = _phantomDappPrivateKey;
    final dappPub = _phantomDappPubKeyB58;
    final phantomPub = _phantomWalletPubKeyB58;
    if (privateKey == null || dappPub == null || phantomPub == null) {
      return null;
    }

    try {
      final random = Random.secure();
      final nonce = Uint8List(24);
      for (var i = 0; i < nonce.length; i++) {
        nonce[i] = random.nextInt(256);
      }

      final box = pn.Box(
        myPrivateKey: privateKey,
        theirPublicKey:
            pn.PublicKey(Uint8List.fromList(base58.decode(phantomPub))),
      );

      final encrypted = box.encrypt(
        Uint8List.fromList(utf8.encode(jsonEncode(payload))),
        nonce: nonce,
      );

      return {
        'dapp_encryption_public_key': dappPub,
        'nonce': base58.encode(nonce),
        'payload': base58.encode(encrypted.cipherText.asTypedList),
      };
    } catch (_) {
      return null;
    }
  }

  bool get isConnected => _connectedPublicKey != null;
  String? get connectedAddress => _connectedPublicKey;
  String? get currentWalletType => _connectedWalletType;

  bool isLikelySignature(String value) {
    final trimmed = value.trim();
    if (trimmed.length < 80 || trimmed.length > 120) {
      return false;
    }
    return RegExp(r'^[1-9A-HJ-NP-Za-km-z]+$').hasMatch(trimmed);
  }

  bool _isValidSolanaAddress(String? value) {
    if (value == null) return false;
    final trimmed = value.trim();
    if (trimmed.length < 32 || trimmed.length > 44) return false;

    try {
      final decoded = base58.decode(trimmed);
      return decoded.length == 32;
    } catch (_) {
      return false;
    }
  }

  String? _normalizeAddress(String? value) {
    if (!_isValidSolanaAddress(value)) return null;
    return value!.trim();
  }

  Future<void> _saveConnection(String? address, {String? type}) async {
    final prefs = await SharedPreferences.getInstance();
    if (address != null) {
      await prefs.setString('connected_wallet', address);
      if (type != null) {
        await prefs.setString('connected_wallet_type', type);
      }

      final seen = prefs.getStringList(_seenWalletsKey) ?? const <String>[];
      final unique = <String>{...seen};
      unique.add(address);
      await prefs.setStringList(_seenWalletsKey, unique.toList());
    } else {
      await prefs.remove('connected_wallet');
      await prefs.remove('connected_wallet_type');
    }
  }

  Future<int> getSeenWalletCount() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final seen = prefs.getStringList(_seenWalletsKey) ?? const <String>[];
      return seen.toSet().length;
    } catch (_) {
      return 0;
    }
  }

  Future<void> _loadSavedConnection() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final savedAddr = prefs.getString('connected_wallet');
      final savedType = prefs.getString('connected_wallet_type');

      if (_isValidSolanaAddress(savedAddr)) {
        _connectedPublicKey = savedAddr!.trim();
        _connectedWalletType =
            (savedType != null && savedType.trim().isNotEmpty)
                ? savedType.trim()
                : 'Unknown';
        _signatureController.add('CONNECTED');
      } else {
        await prefs.remove('connected_wallet');
        await prefs.remove('connected_wallet_type');
      }
    } catch (_) {
      // Ignore persistence failures.
    }
  }

  Future<void> _applyConnectedAddress(String address,
      {bool emitConnectedEvent = true}) async {
    _connectFallbackTimer?.cancel();
    _connectedPublicKey = address;
    await _saveConnection(address, type: _connectedWalletType);
    if (emitConnectedEvent) {
      _signatureController.add('CONNECTED');
    }
  }

  Future<void> syncConnectedAddressFromOnChain(String? address) async {
    final normalized = _normalizeAddress(address);
    if (normalized == null) return;

    // Canonicalize connected wallet after finalized on-chain verification.
    if (_connectedPublicKey == normalized) {
      return;
    }

    if (_connectedWalletType == null || _connectedWalletType!.trim().isEmpty) {
      _connectedWalletType = 'OnChain';
    }

    _connectedPublicKey = normalized;
    await _saveConnection(normalized, type: _connectedWalletType);
    _signatureController.add('CONNECTED');
  }

  void _scheduleConnectionFallback() {
    _connectFallbackTimer?.cancel();
    _signatureController.add('WAITING_BROWSER');
    _connectFallbackTimer = Timer(_connectFallbackDelay, () {
      if (!isConnected) {
        // Do not auto-spawn additional connect attempts. Aggressive retries can
        // launch different wallet handlers and cause confusing account mismatch.
        _signatureController.add('CONNECT_FAILED');
      }
    });
  }

  List<Uri> _buildUniversalConnectCandidates({String? dappPub}) {
    return [
      Uri(
        scheme: 'solana',
        path: 'connect',
        queryParameters: {
          'app_url': _appUrl,
          'redirect_link': _onConnectRedirect,
          'cluster': 'mainnet-beta',
          'name': 'SOLQ',
          'icon': '$_appUrl/logo.png',
        },
      ),
      Uri.parse('solana-pay:connect').replace(
        queryParameters: {
          'app_url': _appUrl,
          'redirect_link': _onConnectRedirect,
          'cluster': 'mainnet-beta',
        },
      ),
      Uri(
        scheme: 'jupiter',
        path: 'connect',
        queryParameters: {
          'app_url': _appUrl,
          'redirect_link': _onConnectRedirect,
          'cluster': 'mainnet-beta',
        },
      ),
      Uri.https('phantom.app', '/ul/v1/connect', {
        if (dappPub != null) 'dapp_encryption_public_key': dappPub,
        'cluster': 'mainnet-beta',
        'app_url': _appUrl,
        'redirect_link': _onConnectRedirect,
      }),
      Uri.https('solflare.com', '/ul/v1/connect', {
        if (dappPub != null) 'dapp_encryption_public_key': dappPub,
        'cluster': 'mainnet-beta',
        'app_url': _appUrl,
        'redirect_link': _onConnectRedirect,
      }),
      Uri.https('metamask.app.link', '/dapp/solq.vercel.app'),
    ];
  }

  Map<String, dynamic>? _decodeJsonObject(String value) {
    try {
      final decoded = jsonDecode(value);
      if (decoded is Map) {
        return decoded.map((key, val) => MapEntry(key.toString(), val));
      }
    } catch (_) {}
    return null;
  }

  Map<String, String> _parseQueryLikeParams(String raw) {
    var value = raw.trim();
    if (value.isEmpty) {
      return const <String, String>{};
    }

    final hashIndex = value.indexOf('#');
    if (hashIndex >= 0 && hashIndex < value.length - 1) {
      value = value.substring(hashIndex + 1);
    }

    if (value.startsWith('/')) {
      value = value.substring(1);
    }
    if (value.startsWith('?')) {
      value = value.substring(1);
    }

    final queryMarker = value.indexOf('?');
    if (queryMarker >= 0 && queryMarker < value.length - 1) {
      value = value.substring(queryMarker + 1);
    }

    if (!value.contains('=')) {
      return const <String, String>{};
    }

    try {
      return Uri.splitQueryString(value);
    } catch (_) {
      return const <String, String>{};
    }
  }

  String? _extractAddressFromParamMap(Map<String, String> params,
      {bool inspectAllValues = false}) {
    for (final key in _addressFieldKeys) {
      final normalized = _normalizeAddress(params[key]);
      if (normalized != null) {
        return normalized;
      }
    }

    if (!inspectAllValues) {
      return null;
    }

    for (final value in params.values) {
      final normalized = _normalizeAddress(value);
      if (normalized != null) {
        return normalized;
      }
    }

    return null;
  }

  String? _extractAddressFromPathSegments(Uri uri) {
    final segments = <String>[];

    segments.addAll(uri.pathSegments);

    if (uri.fragment.isNotEmpty && !uri.fragment.contains('=')) {
      final fragmentSegments = uri.fragment
          .split('/')
          .map((part) => part.trim())
          .where((part) => part.isNotEmpty)
          .toList();
      segments.addAll(fragmentSegments);
    }

    for (final rawSegment in segments) {
      final decoded = Uri.decodeComponent(rawSegment).trim();
      final normalized = _normalizeAddress(decoded);
      if (normalized != null) {
        return normalized;
      }
    }

    return null;
  }

  String? _extractAddressFromDataParam(String? rawData) {
    if (rawData == null || rawData.isEmpty) {
      return null;
    }

    String decodedCandidate = rawData;
    try {
      decodedCandidate = Uri.decodeComponent(rawData);
    } catch (_) {
      decodedCandidate = rawData;
    }

    final directCandidates = <String>[
      rawData,
      decodedCandidate,
    ];

    for (final candidate in directCandidates) {
      final queryParams = _parseQueryLikeParams(candidate);
      final fromParams = _extractAddressFromParamMap(queryParams,
          inspectAllValues: true);
      if (fromParams != null) {
        return fromParams;
      }

      // Parse only explicit JSON keys from callback payload.
      // Do not treat opaque blobs as direct addresses, because encrypted/session
      // payloads can accidentally match base58 patterns.
      final jsonObj = _decodeJsonObject(candidate);
      if (jsonObj == null) {
        continue;
      }

      for (final key in _addressFieldKeys) {
        final normalized = _normalizeAddress(jsonObj[key]?.toString());
        if (normalized != null) {
          return normalized;
        }
      }
    }

    try {
      final decodedText =
          utf8.decode(base64Url.decode(base64Url.normalize(rawData)));

      final decodedQuery = _parseQueryLikeParams(decodedText);
      final fromDecodedParams = _extractAddressFromParamMap(decodedQuery,
          inspectAllValues: true);
      if (fromDecodedParams != null) {
        return fromDecodedParams;
      }

      final jsonObj = _decodeJsonObject(decodedText);
      if (jsonObj != null) {
        for (final key in _addressFieldKeys) {
          final normalized = _normalizeAddress(jsonObj[key]?.toString());
          if (normalized != null) {
            return normalized;
          }
        }
      }
    } catch (_) {}

    return null;
  }

  String? _extractAddressFromCallback(Uri uri,
      {bool allowDataFallback = true}) {
    final fromPath = _extractAddressFromPathSegments(uri);
    if (fromPath != null) {
      return fromPath;
    }

    final candidates = <String?>[];
    for (final key in _addressFieldKeys) {
      candidates.add(uri.queryParameters[key]);
    }

    for (final entry in uri.queryParameters.entries) {
      if (!entry.key.toLowerCase().contains('encryption')) {
        candidates.add(entry.value);
      }
    }

    // Some wallets return callback values in URL fragment, for example:
    // solq://onconnect#public_key=<base58>
    final fragment = uri.fragment;
    if (fragment.isNotEmpty) {
      final fragmentParams = _parseQueryLikeParams(fragment);
      for (final key in _addressFieldKeys) {
        candidates.add(fragmentParams[key]);
      }

      for (final entry in fragmentParams.entries) {
        if (!entry.key.toLowerCase().contains('encryption')) {
          candidates.add(entry.value);
        }
      }

      if (allowDataFallback) {
        final fromFragmentData =
            _extractAddressFromDataParam(fragmentParams['data']);
        if (fromFragmentData != null) {
          return fromFragmentData;
        }
      }
    }

    for (final candidate in candidates) {
      final normalized = _normalizeAddress(candidate);
      if (normalized != null) return normalized;
    }

    // Some wallets return data in JSON or encoded payload under `data`.
    if (allowDataFallback) {
      final fromData =
          _extractAddressFromDataParam(uri.queryParameters['data']);
      if (fromData != null) return fromData;
    }

    return null;
  }

  String? _extractSignatureFromDataParam(String? rawData) {
    if (rawData == null || rawData.isEmpty) {
      return null;
    }

    final candidates = <String>[rawData];
    try {
      candidates.add(Uri.decodeComponent(rawData));
    } catch (_) {}

    for (final candidate in candidates) {
      final queryParams = _parseQueryLikeParams(candidate);
      for (final key in _signatureFieldKeys) {
        final value = queryParams[key];
        if (value != null && value.trim().isNotEmpty) {
          return value.trim();
        }
      }

      final jsonObj = _decodeJsonObject(candidate);
      if (jsonObj != null) {
        for (final key in _signatureFieldKeys) {
          final value = jsonObj[key]?.toString();
          if (value != null && value.trim().isNotEmpty) {
            return value.trim();
          }
        }
      }
    }

    try {
      final decodedText =
          utf8.decode(base64Url.decode(base64Url.normalize(rawData)));
      final queryParams = _parseQueryLikeParams(decodedText);
      for (final key in _signatureFieldKeys) {
        final value = queryParams[key];
        if (value != null && value.trim().isNotEmpty) {
          return value.trim();
        }
      }

      final jsonObj = _decodeJsonObject(decodedText);
      if (jsonObj != null) {
        for (final key in _signatureFieldKeys) {
          final value = jsonObj[key]?.toString();
          if (value != null && value.trim().isNotEmpty) {
            return value.trim();
          }
        }
      }
    } catch (_) {}

    return null;
  }

  Future<bool> _launchCandidates(List<Uri> uris) async {
    for (final uri in uris) {
      try {
        final launched = await launchUrl(
          uri,
          mode: LaunchMode.externalNonBrowserApplication,
        );
        if (launched) return true;
      } catch (_) {}
    }

    for (final uri in uris) {
      try {
        final launched =
            await launchUrl(uri, mode: LaunchMode.externalApplication);
        if (launched) return true;
      } catch (_) {}
    }

    return false;
  }

  void _initDeepLinks() async {
    if (_deepLinksInitialized) {
      return;
    }
    _deepLinksInitialized = true;

    final appLinks = AppLinks();

    try {
      final initialLink = await appLinks.getInitialAppLink();
      if (initialLink != null) {
        _handleCallback(initialLink);
      }
    } catch (_) {}

    appLinks.uriLinkStream.listen((Uri? uri) {
      if (uri != null) {
        _handleCallback(uri);
      }
    }, onError: (_) {});
  }

  void _handleCallback(Uri uri) {
    final uriStr = uri.toString().toLowerCase();
    final fragmentParams = _parseQueryLikeParams(uri.fragment);
    final pathAddress = _extractAddressFromPathSegments(uri);
    final hasQuerySignatureField =
        _signatureFieldKeys.any(uri.queryParameters.containsKey);
    final hasFragmentSignatureField =
        _signatureFieldKeys.any(fragmentParams.containsKey);
    final hasQueryAddressField =
        _addressFieldKeys.any(uri.queryParameters.containsKey);
    final hasFragmentAddressField =
        _addressFieldKeys.any(fragmentParams.containsKey);

    final hasEncryptedSession =
        uri.queryParameters.containsKey('phantom_encryption_public_key') ||
            uri.queryParameters.containsKey('nonce');
    final phantomData =
        hasEncryptedSession ? _decodePhantomEncryptedData(uri) : null;

    final hasSignHint = uriStr.contains('onsign') ||
        hasQuerySignatureField ||
        hasFragmentSignatureField;

    if (hasSignHint) {
      final decryptedSig = phantomData?['signature']?.toString();
      String? sig = decryptedSig;

      if (sig == null || sig.trim().isEmpty) {
        for (final key in _signatureFieldKeys) {
          final candidate = uri.queryParameters[key] ?? fragmentParams[key];
          if (candidate != null && candidate.trim().isNotEmpty) {
            sig = candidate.trim();
            break;
          }
        }
      }

      sig ??= _extractSignatureFromDataParam(uri.queryParameters['data']);
      sig ??= _extractSignatureFromDataParam(fragmentParams['data']);

      if (sig != null && isLikelySignature(sig)) {
        _signatureController.add(sig.trim());
      } else if (uri.queryParameters.containsKey('errorCode') ||
          uri.queryParameters.containsKey('errorMessage') ||
          uri.queryParameters.containsKey('error') ||
          fragmentParams.containsKey('errorCode') ||
          fragmentParams.containsKey('errorMessage') ||
          fragmentParams.containsKey('error')) {
        final msg = uri.queryParameters['errorMessage'] ??
            uri.queryParameters['error'] ??
            fragmentParams['errorMessage'] ??
            fragmentParams['error'] ??
            'Wallet signature rejected or failed';
        _signatureController.add('FAILED: $msg');
      } else {
        _signatureController.add('SIGNATURE_PENDING');
      }
      return;
    }

    final hasConnectHint = uriStr.contains('onconnect') ||
        uriStr.contains('solana-connect') ||
        uriStr.contains('jupiter-connect') ||
        uriStr.contains('backpack-connect') ||
        uri.path.contains('connect') ||
        pathAddress != null ||
        hasQueryAddressField ||
        hasFragmentAddressField ||
        hasEncryptedSession;

    if (hasConnectHint) {
      String? decryptedAddress;
      if (phantomData != null) {
        for (final key in _addressFieldKeys) {
          final normalized = _normalizeAddress(phantomData[key]?.toString());
          if (normalized != null) {
            decryptedAddress = normalized;
            break;
          }
        }
      }

      final address = decryptedAddress ??
          pathAddress ??
          _extractAddressFromCallback(
            uri,
            allowDataFallback: !hasEncryptedSession,
          );
      if (address != null) {
        _applyConnectedAddress(address);
      } else if (uri.queryParameters.containsKey('errorCode') ||
          uri.queryParameters.containsKey('errorMessage') ||
          uri.queryParameters.containsKey('error') ||
          uri.queryParameters.containsKey('reason') ||
          fragmentParams.containsKey('errorCode') ||
          fragmentParams.containsKey('errorMessage') ||
          fragmentParams.containsKey('error')) {
        _connectFallbackTimer?.cancel();
        _signatureController.add('CONNECT_FAILED');
      } else {
        // Log deep link pulses that don't contain addresses to prevent silent failures 
        // during multi-wallet switching transitions.
      }
      return;
    }

    if (uriStr.contains('payment-success') ||
        uriStr.contains('signature-success')) {
      final id = uri.queryParameters['id'] ??
          uri.queryParameters['intent_id'] ??
          uri.queryParameters['reference'];
      String? sig;
      for (final key in _signatureFieldKeys) {
        final candidate = uri.queryParameters[key] ?? fragmentParams[key];
        if (candidate != null && candidate.trim().isNotEmpty) {
          sig = candidate.trim();
          break;
        }
      }
      sig ??= _extractSignatureFromDataParam(uri.queryParameters['data']);
      sig ??= _extractSignatureFromDataParam(fragmentParams['data']);

      if (id != null) {
        final normalizedSig =
            sig != null && isLikelySignature(sig) ? sig.trim() : 'PENDING';
        _signatureController.add('SIGNED:$id:$normalizedSig');
      }
    }
  }

  Future<void> _connectFromWeb(String walletType) async {
    Future<String?> tryConnect(String hint) async {
      final result = await WebProvider.connectWallet(hint.toLowerCase());
      return _normalizeAddress(result);
    }

    // Preferred wallet first, then universal provider pool fallback.
    String? normalized = await tryConnect(walletType);
    var resolvedWalletType = walletType;

    if (normalized == null) {
      normalized = await tryConnect('universal');
      if (normalized != null) {
        resolvedWalletType = 'Browser Extension';
      }
    }

    _connectFallbackTimer?.cancel();
    if (normalized != null) {
      _connectedPublicKey = normalized;
      _connectedWalletType = resolvedWalletType;
      await _saveConnection(normalized, type: resolvedWalletType);
      _signatureController.add('CONNECTED');
      return;
    }

    _signatureController.add('CONNECT_FAILED');
  }

  Future<void> _beginConnect(String walletType) async {
    _connectFallbackTimer?.cancel();
    _connectedWalletType = walletType;
    _connectedPublicKey = null;
    await _saveConnection(null);
    _signatureController.add('DISCONNECTED');
  }

  Future<void> connectPhantom() async {
    await _beginConnect('Phantom');
    await _resetPhantomConnectSession();
    final dappPub = _phantomDappPubKeyB58;

    if (kIsWeb) {
      await _connectFromWeb('Phantom');
      return;
    }

    final launched = await _launchCandidates([
      Uri(
        scheme: 'solana',
        path: 'connect',
        queryParameters: {
          'app_url': _appUrl,
          'redirect_link': _onConnectRedirect,
          'cluster': 'mainnet-beta',
          'name': 'SOLQ',
        },
      ),
      Uri.parse('solana-pay:connect').replace(
        queryParameters: {
          'app_url': _appUrl,
          'redirect_link': _onConnectRedirect,
          'cluster': 'mainnet-beta',
        },
      ),
      Uri.https('phantom.app', '/ul/v1/connect', {
        if (dappPub != null) 'dapp_encryption_public_key': dappPub,
        'cluster': 'mainnet-beta',
        'app_url': _appUrl,
        'redirect_link': _onConnectRedirect,
      }),
    ]);

    if (launched) {
      _scheduleConnectionFallback();
    } else {
      await connectUniversal(wallet: 'phantom');
    }
  }

  Future<void> connectSolflare() async {
    await _beginConnect('Solflare');
    await _resetPhantomConnectSession();
    final dappPub = _phantomDappPubKeyB58;

    if (kIsWeb) {
      await _connectFromWeb('Solflare');
      return;
    }

    final launched = await _launchCandidates([
      Uri(
        scheme: 'solana',
        path: 'connect',
        queryParameters: {
          'app_url': _appUrl,
          'redirect_link': _onConnectRedirect,
          'cluster': 'mainnet-beta',
          'name': 'SOLQ',
        },
      ),
      Uri.parse('solana-pay:connect').replace(
        queryParameters: {
          'app_url': _appUrl,
          'redirect_link': _onConnectRedirect,
          'cluster': 'mainnet-beta',
        },
      ),
      Uri.https('solflare.com', '/ul/v1/connect', {
        if (dappPub != null) 'dapp_encryption_public_key': dappPub,
        'cluster': 'mainnet-beta',
        'app_url': _appUrl,
        'redirect_link': _onConnectRedirect,
      }),
    ]);

    if (launched) {
      _scheduleConnectionFallback();
    } else {
      await connectUniversal(wallet: 'solflare');
    }
  }

  Future<void> connectJupiter() async {
    await _beginConnect('Jupiter');

    if (kIsWeb) {
      await _connectFromWeb('Jupiter');
      return;
    }

    final launched = await _launchCandidates([
      Uri(
        scheme: 'jupiter',
        path: 'connect',
        queryParameters: {
          'app_url': _appUrl,
          'redirect_link': _onConnectRedirect,
          'cluster': 'mainnet-beta',
        },
      ),
      Uri(
        scheme: 'solana',
        path: 'connect',
        queryParameters: {
          'app_url': _appUrl,
          'redirect_link': _onConnectRedirect,
          'cluster': 'mainnet-beta',
          'name': 'SOLQ',
        },
      ),
      Uri.parse('solana-pay:connect').replace(
        queryParameters: {
          'app_url': _appUrl,
          'redirect_link': _onConnectRedirect,
          'cluster': 'mainnet-beta',
        },
      ),
    ]);

    if (launched) {
      _scheduleConnectionFallback();
    } else {
      await connectUniversal(wallet: 'jupiter');
    }
  }

  Future<void> connectCex(String cexName, String schemeUrl) async {
    await _beginConnect(cexName);

    if (kIsWeb) {
      await _connectFromWeb(cexName);
      return;
    }

    final launched = await _launchCandidates([Uri.parse(schemeUrl)]);
    if (launched) {
      _scheduleConnectionFallback();
    } else {
      await connectUniversal(wallet: cexName.toLowerCase());
    }
  }

  Future<void> connectMetamask() async {
    await _beginConnect('MetaMask');

    if (kIsWeb) {
      await _connectFromWeb('MetaMask');
      return;
    }

    final launched = await _launchCandidates([
      Uri.https('metamask.app.link', '/dapp/solq.vercel.app'),
    ]);

    if (launched) {
      _scheduleConnectionFallback();
    } else {
      await connectUniversal(wallet: 'metamask');
    }
  }

  Future<void> connectUniversal({String wallet = 'universal'}) async {
    final walletTitle = wallet.isNotEmpty
        ? '${wallet[0].toUpperCase()}${wallet.substring(1)}'
        : 'Universal';
    await _beginConnect(walletTitle);
    await _resetPhantomConnectSession();
    final dappPub = _phantomDappPubKeyB58;

    if (kIsWeb) {
      await _connectFromWeb(walletTitle);
      return;
    }

    final launched = await _launchCandidates(
      _buildUniversalConnectCandidates(dappPub: dappPub),
    );

    if (launched) {
      _scheduleConnectionFallback();
    } else {
      _signatureController.add('CONNECT_FAILED');
    }
  }

  Future<void> signSwapTransaction(String base64Transaction) async {
    if (kIsWeb) {
      final sig = await WebProvider.signTransaction(
        base64Transaction,
        walletHint: _connectedWalletType,
      );
      if (sig != null && isLikelySignature(sig)) {
        _signatureController.add(sig.trim());
      } else {
        _signatureController.add('FAILED: User Rejected or Error');
      }
      return;
    }
    final walletType = (_connectedWalletType ?? '').toLowerCase();
    final candidates = <Uri>[];

    if (walletType.contains('phantom')) {
      final session = _phantomSessionToken;
      if (session != null && session.isNotEmpty) {
        final encryptedPayload = _buildPhantomEncryptedPayload({
          'transaction': base64Transaction,
          'session': session,
        });
        if (encryptedPayload != null) {
          candidates.add(
            Uri.https('phantom.app', '/ul/v1/signAndSendTransaction', {
              ...encryptedPayload,
              'redirect_link': _onSignRedirect,
              'cluster': 'mainnet-beta',
            }),
          );
          candidates.add(
            Uri.https('phantom.app', '/ul/v1/signTransaction', {
              ...encryptedPayload,
              'redirect_link': _onSignRedirect,
              'cluster': 'mainnet-beta',
            }),
          );
        }
      }
    }

    if (walletType.contains('jupiter')) {
      candidates.add(
        Uri(
          scheme: 'jupiter',
          path: 'signTransaction',
          queryParameters: {
            'transaction': base64Transaction,
            'redirect_link': _onSignRedirect,
          },
        ),
      );
    }
    if (walletType.contains('okx')) {
      candidates.add(
        Uri(
          scheme: 'okx',
          path: 'signTransaction',
          queryParameters: {
            'transaction': base64Transaction,
            'redirect_link': _onSignRedirect,
          },
        ),
      );
    }
    if (walletType.contains('backpack')) {
      candidates.add(
        Uri(
          scheme: 'backpack',
          path: 'signTransaction',
          queryParameters: {
            'transaction': base64Transaction,
            'redirect_link': _onSignRedirect,
          },
        ),
      );
    }

    candidates.addAll([
      Uri(
        scheme: 'solana',
        path: 'signAndSendTransaction',
        queryParameters: {
          'transaction': base64Transaction,
          'redirect_link': _onSignRedirect,
          'cluster': 'mainnet-beta',
          'name': 'SOLQ',
        },
      ),
      Uri(
        scheme: 'solana',
        path: 'signTransaction',
        queryParameters: {
          'transaction': base64Transaction,
          'redirect_link': _onSignRedirect,
          'cluster': 'mainnet-beta',
          'name': 'SOLQ',
        },
      ),
      Uri.parse('solana-pay:signTransaction').replace(
        queryParameters: {
          'transaction': base64Transaction,
          'redirect_link': _onSignRedirect,
          'cluster': 'mainnet-beta',
        },
      ),
    ]);

    final launched = await _launchCandidates(candidates);
    if (!launched) {
      // If launching wallet fails, it might be due to missing installation.
      // Do NOT ask for signature manual, but provide actionable hint.
      _signatureController.add('FAILED: Wallet app not found or could not be opened. Please install the wallet app and try again.');
    }
  }

  RpcClient get _rpc => RpcClient(_rpcEndpoints[_currentRpcIndex]);

  void _rotateRpc() {
    _currentRpcIndex = (_currentRpcIndex + 1) % _rpcEndpoints.length;
  }

  Future<double> getBalance() async {
    if (_connectedPublicKey == null) return 0.0;

    for (int attempt = 0; attempt < _rpcEndpoints.length; attempt++) {
      try {
        final balance = await _rpc.getBalance(_connectedPublicKey!);
        return balance.value / 1000000000;
      } catch (_) {
        _rotateRpc();
      }
    }

    return 0.0;
  }

  Future<void> disconnect() async {
    _connectFallbackTimer?.cancel();
    _connectedPublicKey = null;
    _connectedWalletType = null;
    _preparePhantomConnectSession();
    await _persistPhantomSessionState();
    await _saveConnection(null);
    _signatureController.add('DISCONNECTED');
  }

  Future<void> launchSolanaPay(String recipient, double amount) async {
    final uri = Uri(
      scheme: 'solana',
      path: recipient,
      queryParameters: {
        'amount': amount.toStringAsFixed(6),
        'label': 'SOLQ',
        'message': 'QRIS Payment',
      },
    );
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  Future<bool> waitForSignature(String signature) async {
    for (int i = 0; i < 30; i++) {
      for (int rpcAttempt = 0;
          rpcAttempt < _rpcEndpoints.length;
          rpcAttempt++) {
        try {
          final statuses = await _rpc.getSignatureStatuses([signature]);
          final list = statuses.value;
          if (list.isNotEmpty && list.first != null) {
            final s = list.first!;
            if (s.confirmationStatus == Commitment.finalized) {
              return true;
            }
          }
          break;
        } catch (_) {
          _rotateRpc();
        }
      }
      await Future.delayed(const Duration(seconds: 2));
    }

    return false;
  }

  String generateSolanaPayUrl(String amount, String label, String message) {
    final recipient = _connectedPublicKey ?? '';
    return 'solana:$recipient?amount=$amount&label=${Uri.encodeComponent(label)}&message=${Uri.encodeComponent(message)}';
  }
}
