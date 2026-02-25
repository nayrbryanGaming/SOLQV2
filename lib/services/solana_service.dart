import 'package:url_launcher/url_launcher.dart';
import 'package:app_links/app_links.dart';
import 'package:bs58/bs58.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:async';
import 'dart:math';
import 'dart:typed_data';
import 'package:flutter/foundation.dart';
import 'package:solana/solana.dart';
import 'web_provider.dart';
import 'walletconnect_service.dart';

class SolanaService {
  static final SolanaService _instance = SolanaService._internal();
  factory SolanaService() => _instance;

  late final String _dappPubKeyB58;

  SolanaService._internal() {
    final random = Random.secure();
    final bytes = Uint8List(32);
    for (var i = 0; i < 32; i++) bytes[i] = random.nextInt(256);
    _dappPubKeyB58 = base58.encode(bytes);
    _initDeepLinks();
    _loadSavedConnection();
  }

  String? _connectedPublicKey;
  String? _connectedWalletType; // NEW: Track Wallet Type
  final StreamController<String> _signatureController = StreamController.broadcast();
  Stream<String> get signatureStream => _signatureController.stream;

  bool get isConnected => _connectedPublicKey != null;
  String? get connectedAddress => _connectedPublicKey;
  String? get currentWalletType => _connectedWalletType; // NEW: Expose Wallet Type (Renamed to fix cache)

  // ═══════════════════════════════════════════════
  //  PERSISTENCE — survive app kill/restart
  // ═══════════════════════════════════════════════
  Future<void> _loadSavedConnection() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final savedAddr = prefs.getString('connected_wallet');
      final savedType = prefs.getString('connected_wallet_type'); // NEW
      
      if (savedAddr != null && savedAddr.isNotEmpty) {
        _connectedPublicKey = savedAddr;
        _connectedWalletType = savedType ?? 'Unknown'; // Default if missing
        print("[WALLET] ✅ Restored saved connection: $savedAddr ($savedType)");
        _signatureController.add("CONNECTED");
      }
    } catch (e) {
      print("[WALLET] No saved connection: $e");
    }
  }

  Future<void> _saveConnection(String? address, {String? type}) async {
    final prefs = await SharedPreferences.getInstance();
    if (address != null) {
      await prefs.setString('connected_wallet', address);
      if (type != null) await prefs.setString('connected_wallet_type', type);
    } else {
      await prefs.remove('connected_wallet');
      await prefs.remove('connected_wallet_type');
    }
  }

  // ═══════════════════════════════════════════════
  //  DEEP LINK HANDLER — catches ALL callbacks
  // ═══════════════════════════════════════════════
  void _initDeepLinks() async {
    final appLinks = AppLinks();

    // 1. CRITICAL: Check link that LAUNCHED/RECREATED the app
    //    (This is what we were missing — Phantom kills our app,
    //     Android recreates it with the deep link as intent)
    try {
      final initialLink = await appLinks.getInitialAppLink();
      if (initialLink != null) {
        print("[WALLET] 🔥 INITIAL LAUNCH LINK: $initialLink");
        _handleCallback(initialLink);
      }
    } catch (e) {
      print("[WALLET] getInitialAppLink error: $e");
    }

    // 2. Links that arrive WHILE app is already running
    appLinks.uriLinkStream.listen((Uri? uri) {
      if (uri != null) {
        print("[WALLET] 📨 STREAM LINK: $uri");
        _handleCallback(uri);
      }
    }, onError: (err) {
      print("[WALLET] Stream error: $err");
    });
  }

  void _handleCallback(Uri uri) {
    final uriStr = uri.toString().toLowerCase();
    print("[WALLET] Processing Callback: $uri");

    // CONNECT callback
    if (uriStr.contains('onconnect') ||
        uri.queryParameters.containsKey('phantom_encryption_public_key') ||
        uri.queryParameters.containsKey('public_key') ||
        uri.queryParameters.containsKey('address')) {

      final pubKey = uri.queryParameters['public_key'] ??
                     uri.queryParameters['address'] ??
                     uri.queryParameters['account'] ??
                     uri.queryParameters['phantom_encryption_public_key'] ??
                     uri.queryParameters['data'];

      if (pubKey != null && pubKey.isNotEmpty) {
        _connectedPublicKey = pubKey;
        print("[WALLET] ✅ CONNECTED: $_connectedPublicKey");
        _saveConnection(_connectedPublicKey, type: _connectedWalletType);
        _signatureController.add("CONNECTED");
      } else {
        print("[WALLET] CONNECTION FAILED: No Public Key Returned.");
      }
      return;
    }

    // SIGN callback
    if (uriStr.contains('onsign') || uri.queryParameters.containsKey('signature')) {
      final sig = uri.queryParameters['signature'] ?? uri.queryParameters['data'];
      if (sig != null) {
        print("[WALLET] SIGNATURE RECEIVED: $sig");
        _signatureController.add(sig);
      }
      return;
    }

    // SOLANA PAY SUCCESS callback (Redirect from Wallet)
    if (uriStr.contains('payment-success') || uriStr.contains('signature-success')) {
      final id = uri.queryParameters['id'] ?? uri.queryParameters['intent_id'] ?? uri.queryParameters['reference'];
      final sig = uri.queryParameters['signature'] ?? uri.queryParameters['sig'] ?? uri.queryParameters['tx_hash'] ?? uri.queryParameters['data'];
      
      if (id != null) {
        print("[WALLET] Payment Signed & Redirected. Intent: $id Sig: $sig");
        _signatureController.add("SIGNED:$id:${sig ?? 'PENDING'}");
      }
    }
  }

  // ═══════════════════════════════════════════════
  //  MANUAL ADDRESS FIX (Emergency Override)
  // ═══════════════════════════════════════════════
  Future<void> setConnectedAddress(String address) async {
    if (address.isEmpty) return;
    _connectedPublicKey = address;
    _connectedWalletType = "Manual";
    await _saveConnection(address, type: "Manual");
    _signatureController.add("CONNECTED");
    print("[WALLET] Manual Address Set: $address");
  }

  // ═══════════════════════════════════════════════
  //  CONNECT: Phantom
  // ═══════════════════════════════════════════════
  Future<void> connectPhantom() async {
    final url = Uri.https('phantom.app', '/ul/v1/connect', {
      'dapp_encryption_public_key': _dappPubKeyB58,
      'cluster': 'mainnet-beta',
      'app_url': 'https://solq.app',
      'redirect_link': 'solq://onConnect',
    });
    print("[WALLET] → Phantom: $url");
    await launchUrl(url, mode: LaunchMode.externalApplication);
  }

  // ═══════════════════════════════════════════════
  //  CONNECT: Solflare
  // ═══════════════════════════════════════════════
  Future<void> connectSolflare() async {
    final url = Uri.https('solflare.com', '/ul/v1/connect', {
      'dapp_encryption_public_key': _dappPubKeyB58,
      'cluster': 'mainnet-beta',
      'app_url': 'https://solq.app',
      'redirect_link': 'solq://onConnect',
    });
    print("[WALLET] → Solflare: $url");
    await launchUrl(url, mode: LaunchMode.externalApplication);
  }

  // ═══════════════════════════════════════════════
  //  CONNECT: Base / Coinbase Wallet
  // ═══════════════════════════════════════════════
  Future<void> connectBase() async {
    final url = Uri.https('go.cb-w.com', '/dapp', {
      'cb_url': 'https://solq.app?redirect=solq://onConnect',
    });
    print("[WALLET] → Base: $url");
    await launchUrl(url, mode: LaunchMode.externalApplication);
  }



  // ═══════════════════════════════════════════════
  //  CONNECT: Jupiter (Priority)
  // ═══════════════════════════════════════════════
  Future<void> connectJupiter() async {
    final url = Uri.parse('jupiter://connect?app_url=https://solq.app&redirect_link=solq://onConnect');
    print("[WALLET] → Jupiter: $url");
    _connectedWalletType = "Jupiter";
    await launchUrl(url, mode: LaunchMode.externalApplication);
  }

  // ═══════════════════════════════════════════════
  //  UNIVERSAL CONNECT
  // ═══════════════════════════════════════════════
  Future<void> connectUniversal({String wallet = 'phantom'}) async {
    print("[WALLET] Connecting via Universal Intent (Platform: ${kIsWeb ? 'Web' : 'Mobile'})");
    
    if (kIsWeb) {
      if (wallet.toLowerCase() == 'phantom') {
        final webAddr = await WebProvider.connectPhantom();
        if (webAddr != null) {
          _connectedPublicKey = webAddr;
          _connectedWalletType = "Phantom (Web)";
          await _saveConnection(webAddr, type: "Phantom (Web)");
          _signatureController.add("CONNECTED");
          return;
        }
      }
    }
    
    _connectedWalletType = wallet[0].toUpperCase() + wallet.substring(1);

    // NATIVE INTENT: This triggers the Android OS "Open with" dialog.
    // The standard solana:connect scheme is supported by all major wallets.
    final url = Uri.parse('solana:connect?app_url=https://solq.app&redirect_link=solq://onConnect');
    print("[WALLET] Launching Native Picker: $url");
    await launchUrl(url, mode: LaunchMode.externalApplication);
  }

  // ═══════════════════════════════════════════════
  //  SIGN TRANSACTION (UNIVERSAL OS-NATIVE INTENT)
  // ═══════════════════════════════════════════════
  Future<void> signSwapTransaction(String base64Transaction) async {
    final walletType = (_connectedWalletType ?? '').toLowerCase();
    
    Uri url;
    
    // If we have a specific known scheme for the connected wallet, use it.
    // Otherwise, use the generic solana: scheme which triggers the OS picker.
    if (walletType.contains('solflare')) {
      url = Uri.https('solflare.com', '/ul/v1/signTransaction', {
        'dapp_encryption_public_key': _dappPubKeyB58,
        'transaction': base64Transaction,
        'redirect_link': 'solq://onSign',
      });
    } else if (walletType.contains('phantom')) {
      url = Uri.https('phantom.app', '/ul/v1/signTransaction', {
        'dapp_encryption_public_key': _dappPubKeyB58,
        'transaction': base64Transaction,
        'redirect_link': 'solq://onSign',
      });
    } else {
      // UNIVERSAL INTENT: Triggers "Open with" if multiple wallets support it.
      url = Uri.parse('solana:signTransaction?transaction=$base64Transaction&redirect_link=solq://onSign');
    }

    print("[WALLET] Signing via: $url");
    await launchUrl(url, mode: LaunchMode.externalApplication);
  }

  // ═══════════════════════════════════════════════
  //  RPC CLIENT (MAINNET)
  // ═══════════════════════════════════════════════
  final RpcClient _rpc = RpcClient(
    "https://api.mainnet-beta.solana.com",
  );

  // ═══════════════════════════════════════════════
  //  GET BALANCE
  // ═══════════════════════════════════════════════
  Future<double> getBalance() async {
    if (_connectedPublicKey == null) return 0.0;
    try {
      final balance = await _rpc.getBalance(_connectedPublicKey!);
      return balance.value / 1000000000; // Lamports to SOL
    } catch (e) {
      print("[WALLET] Get Balance Error: $e");
      return 0.0;
    }
  }

  // ═══════════════════════════════════════════════
  //  AIRDROP (Devnet Only - Disabled on Mainnet)
  // ═══════════════════════════════════════════════


  // ═══════════════════════════════════════════════
  //  DISCONNECT
  // ═══════════════════════════════════════════════
  Future<void> disconnect() async {
    _connectedPublicKey = null;
    _connectedWalletType = null;
    await _saveConnection(null);
    _signatureController.add("DISCONNECTED");
  }

  // ═══════════════════════════════════════════════
  //  PROTOCOL OVERRIDE: DIRECT SOL TRANSFER
  // ═══════════════════════════════════════════════
  Future<void> launchSolanaPay(String recipient, double amount) async {
    // Standard Solana Pay URI Scheme
    // solana:<recipient>?amount=<amount>&label=<label>&message=<message>
    final uri = Uri.parse("solana:$recipient?amount=${amount.toStringAsFixed(6)}&label=WarungPay&message=QRIS%20Payment");
    print("[WALLET] Launching Protocol Override (Solana Pay): $uri");
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  // ═══════════════════════════════════════════════
  //  ON-CHAIN VERIFICATION (Phase 4 Truth Only)
  // ═══════════════════════════════════════════════
  Future<bool> waitForSignature(String signature) async {
    print("[RPC] Polling Mainnet for signature commitment: $signature");
    try {
      // Manual Polling Loop (Safe for all solana package versions)
      for (int i = 0; i < 20; i++) {
        final statuses = await _rpc.getSignatureStatuses([signature]);
        if (statuses.isNotEmpty && statuses.first != null) {
          final s = statuses.first!;
          print("[RPC] Attempt $i Status: ${s.confirmationStatus}");
          if (s.confirmationStatus == Commitment.finalized) {
            return true;
          }
        }
        await Future.delayed(const Duration(seconds: 3));
      }
      return false;
    } catch (e) {
      print("[RPC] ❌ Polling Failure: $e");
      return false;
    }
  }

  String generateSolanaPayUrl(String amount, String label, String message) {
    return "solana:$_connectedPublicKey?amount=$amount&label=${Uri.encodeComponent(label)}&message=${Uri.encodeComponent(message)}";
  }
}
