import 'package:url_launcher/url_launcher.dart';
import 'package:app_links/app_links.dart';
import 'package:bs58/bs58.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:async';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:solana/solana.dart';
import 'web_provider.dart';

class SolanaService {
  static final SolanaService _instance = SolanaService._internal();
  factory SolanaService() => _instance;

  late final String _dappPubKeyB58;

  // Multi-RPC Failover (Mainnet Reliability)
  // Added Helius.dev as free 24/7 alternative to paid RPC providers
  static const List<String> _rpcEndpoints = [
    "https://api.mainnet-beta.solana.com",
    "https://solana-mainnet.g.alchemy.com/v2/demo",
    "https://rpc.ankr.com/solana",
    "https://helius-rpc.com/",  // Helius.dev - Free tier, 24/7, high uptime ✅
  ];
  int _currentRpcIndex = 0;

  SolanaService._internal() {
    final random = Random.secure();
    final bytes = Uint8List(32);
    for (var i = 0; i < 32; i++) {
       bytes[i] = random.nextInt(256);
    }
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
      final savedType = prefs.getString('connected_wallet_type');
      
      if (savedAddr != null && savedAddr.isNotEmpty) {
        // Validation: Ensure it's a valid B58 address before committing
        try {
          base58.decode(savedAddr);
          _connectedPublicKey = savedAddr;
          _connectedWalletType = savedType ?? 'Unknown';
          _signatureController.add("CONNECTED");
        } catch (_) {
          await prefs.remove('connected_wallet');
        }
      }
    } catch (e) {
      // Persistence layer failure
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
        _handleCallback(initialLink);
      }
    } catch (e) {
      // Initial launch check failed
    }

    // 2. Links that arrive WHILE app is already running
    appLinks.uriLinkStream.listen((Uri? uri) {
      if (uri != null) {
        _handleCallback(uri);
      }
    }, onError: (err) {
      // Error in link stream
    });
  }

  void _handleCallback(Uri uri) {
    final uriStr = uri.toString().toLowerCase();

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
        _saveConnection(_connectedPublicKey, type: _connectedWalletType);
        _signatureController.add("CONNECTED");
      } else {
        // Connection failed
      }
      return;
    }

    // SIGN callback
    if (uriStr.contains('onsign') || uri.queryParameters.containsKey('signature')) {
      final sig = uri.queryParameters['signature'] ?? uri.queryParameters['data'];
      if (sig != null) {
        _signatureController.add(sig);
      }
      return;
    }

    // 3. SOLANA PAY SUCCESS callback (Redirect from Wallet)
    if (uriStr.contains('payment-success') || uriStr.contains('signature-success')) {
      final id = uri.queryParameters['id'] ?? uri.queryParameters['intent_id'] ?? uri.queryParameters['reference'];
      final sig = uri.queryParameters['signature'] ?? uri.queryParameters['sig'] ?? uri.queryParameters['tx_hash'] ?? uri.queryParameters['data'];
      
      if (id != null) {
        _signatureController.add("SIGNED:$id:${sig ?? 'PENDING'}");
      }
      return;
    }

    // 4. MWA Connect Success
    if (uriStr.contains('solana-connect')) {
       final address = uri.queryParameters['address'];
       if (address != null) {
         _connectedPublicKey = address;
         _saveConnection(address, type: _connectedWalletType);
         _signatureController.add("CONNECTED");
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
  }

  // ═══════════════════════════════════════════════
  //  CONNECT: Phantom
  // ═══════════════════════════════════════════════
  Future<void> connectPhantom() async {
    _connectedWalletType = "Phantom";
    
    if (kIsWeb) {
      final webAddr = await WebProvider.connectPhantom();
      if (webAddr != null) {
        _connectedPublicKey = webAddr;
        await _saveConnection(webAddr, type: "Phantom");
        _signatureController.add("CONNECTED");
      }
      return;
    }

    // Use Universal Link for better reliability on Android/iOS
    final url = Uri.parse('https://phantom.app/ul/v1/connect?dapp_encryption_public_key=$_dappPubKeyB58&cluster=mainnet-beta&app_url=https://solq.app&redirect_link=solq://onConnect');
    await launchUrl(url, mode: LaunchMode.externalApplication);
  }

  // ═══════════════════════════════════════════════
  //  CONNECT: Solflare
  // ═══════════════════════════════════════════════
  Future<void> connectSolflare() async {
    _connectedWalletType = "Solflare";
    
    if (kIsWeb) {
      final webAddr = await WebProvider.connectPhantom(); // Solflare intercepts window.solana too
      if (webAddr != null) {
        _connectedPublicKey = webAddr;
        await _saveConnection(webAddr, type: "Solflare");
        _signatureController.add("CONNECTED");
      }
      return;
    }

    // Solflare Universal Link
    final url = Uri.parse('https://solflare.com/ul/v1/connect?dapp_encryption_public_key=$_dappPubKeyB58&cluster=mainnet-beta&app_url=https://solq.app&redirect_link=solq://onConnect');
    await launchUrl(url, mode: LaunchMode.externalApplication);
  }

  // ═══════════════════════════════════════════════
  //  CONNECT: Jupiter (Priority)
  // ═══════════════════════════════════════════════
  Future<void> connectJupiter() async {
    _connectedWalletType = "Jupiter";
    
    if (kIsWeb) {
      final webAddr = await WebProvider.connectPhantom();
      if (webAddr != null) {
        _connectedPublicKey = webAddr;
        await _saveConnection(webAddr, type: "Jupiter");
        _signatureController.add("CONNECTED");
      }
      return;
    }

    // Jupiter direct scheme support
    final url = Uri.parse('jupiter://connect?app_url=https://solq.app&redirect_link=solq://onConnect&cluster=mainnet-beta');
    
    try {
       final launched = await launchUrl(url, mode: LaunchMode.externalNonBrowserApplication);
       if (!launched) {
         await connectUniversal(wallet: 'jupiter');
       }
    } catch (e) {
       await connectUniversal(wallet: 'jupiter');
    }
  }

  // ═══════════════════════════════════════════════
  //  CONNECT: CEX / EVM DApp Browsers (The Altman Hack)
  // ═══════════════════════════════════════════════
  Future<void> connectCex(String cexName, String schemeUrl) async {
    _connectedWalletType = cexName;
    
    if (kIsWeb) {
      final webAddr = await WebProvider.connectPhantom(); 
      if (webAddr != null) {
        _connectedPublicKey = webAddr;
        await _saveConnection(webAddr, type: cexName);
        _signatureController.add("CONNECTED");
      }
      return;
    }

    final url = Uri.parse(schemeUrl);
    try {
      await launchUrl(url, mode: LaunchMode.externalApplication);
      _signatureController.add("WAITING_BROWSER");
    } catch(e) {
      await connectUniversal(wallet: cexName.toLowerCase());
    }
  }

  // ═══════════════════════════════════════════════
  //  CONNECT: MetaMask (Solana Snap / Universal Link)
  // ═══════════════════════════════════════════════
  Future<void> connectMetamask() async {
    _connectedWalletType = "MetaMask";
    
    if (kIsWeb) {
      final webAddr = await WebProvider.connectMetamask();
      if (webAddr != null) {
        _connectedPublicKey = webAddr;
        await _saveConnection(webAddr, type: "MetaMask (Web)");
        _signatureController.add("CONNECTED");
        return;
      }
    }

    // MetaMask Universal Link to its internal DApp browser
    final url = Uri.parse('https://metamask.app.link/dapp/solq.app');
    await launchUrl(url, mode: LaunchMode.externalApplication);
  }

  // ═══════════════════════════════════════════════
  //  UNIVERSAL CONNECT
  // ═══════════════════════════════════════════════
  Future<void> connectUniversal({String wallet = 'universal'}) async {
    if (kIsWeb) {
      final webAddr = await WebProvider.connectPhantom();
      if (webAddr != null) {
        _connectedPublicKey = webAddr;
        _connectedWalletType = "Universal (Web)";
        await _saveConnection(webAddr, type: "Universal (Web)");
        _signatureController.add("CONNECTED");
        return;
      }
    }
    
    _connectedWalletType = wallet[0].toUpperCase() + wallet.substring(1);

    // Standard MWA / Solana Pay Connect URI
    // Added app identity for improved wallet acceptance
    // Using both 'solana:' and 'solana-pay:' schemes for maximum compatibility
    final uri = Uri.parse('solana:connect?app_url=https://solq.app&redirect_link=solq://onConnect&cluster=mainnet-beta&name=SOLQ&icon=https://solq.app/logo.png');
    final altUri = Uri.parse('solana-pay:connect?app_url=https://solq.app&redirect_link=solq://onConnect&cluster=mainnet-beta');
    
    try {
       // Try MWA first (Mobile Wallet Adapter)
       final launched = await launchUrl(uri, mode: LaunchMode.externalNonBrowserApplication);
       if (!launched) {
          // Try Solana Pay scheme if generic solana: fails
          final altLaunched = await launchUrl(altUri, mode: LaunchMode.externalNonBrowserApplication);
          if (!altLaunched) {
             // Fallback to normal external app (Universal Links)
             await launchUrl(uri, mode: LaunchMode.externalApplication);
          }
       }
    } catch (e) {
      final fallbackStore = Uri.parse('https://phantom.app/ul/v1/connect?app_url=https://solq.app&redirect_link=solq://onConnect');
      await launchUrl(fallbackStore, mode: LaunchMode.externalApplication);
    }
  }

  // ═══════════════════════════════════════════════
  //  SIGN TRANSACTION (UNIVERSAL OS-NATIVE INTENT)
  // ═══════════════════════════════════════════════
  Future<void> signSwapTransaction(String base64Transaction) async {
    final walletType = (_connectedWalletType ?? '').toLowerCase();
    
    Uri url;
    
    if (kIsWeb) {
      final sig = await WebProvider.signTransaction(base64Transaction);
      if (sig != null) {
        _signatureController.add(sig);
      } else {
        _signatureController.add("FAILED: User Rejected or Error");
      }
      return;
    }

    // 1. Specific deep links for high-adoption wallets (v1 specs)
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
    } else if (walletType.contains('jupiter')) {
       url = Uri.parse('jupiter://signTransaction?transaction=${Uri.encodeComponent(base64Transaction)}&redirect_link=solq://onSign');
    } else if (walletType.contains('okx')) {
       url = Uri.parse('okx://signTransaction?transaction=${Uri.encodeComponent(base64Transaction)}&redirect_link=solq://onSign');
    } else if (walletType.contains('backpack')) {
       url = Uri.parse('backpack://signTransaction?transaction=${Uri.encodeComponent(base64Transaction)}&redirect_link=solq://onSign');
    } else {
      // 2. UNIVERSAL SOLANA PAY INTENT (The Boss Standard)
      url = Uri.parse('solana:signTransaction?transaction=${Uri.encodeComponent(base64Transaction)}&redirect_link=solq://onSign&cluster=mainnet-beta&name=SOLQ');
    }

    try {
       // Attempt OS Native Dispatch
       await launchUrl(url, mode: LaunchMode.externalNonBrowserApplication);
    } catch (e) {
       // Fallback to Universal Intent
       final fallback = Uri.parse('solana:signTransaction?transaction=${Uri.encodeComponent(base64Transaction)}&redirect_link=solq://onSign');
       await launchUrl(fallback, mode: LaunchMode.externalApplication);
    }
  }

  // ═══════════════════════════════════════════════
  //  RPC CLIENT (MAINNET with Failover)
  // ═══════════════════════════════════════════════
  RpcClient get _rpc => RpcClient(_rpcEndpoints[_currentRpcIndex]);

  void _rotateRpc() {
    _currentRpcIndex = (_currentRpcIndex + 1) % _rpcEndpoints.length;
  }

  // ═══════════════════════════════════════════════
  //  GET BALANCE (with RPC Failover)
  // ═══════════════════════════════════════════════
  Future<double> getBalance() async {
    if (_connectedPublicKey == null) return 0.0;

    for (int attempt = 0; attempt < _rpcEndpoints.length; attempt++) {
      try {
        final balance = await _rpc.getBalance(_connectedPublicKey!);
        return balance.value / 1000000000; // Lamports to SOL
      } catch (e) {
        _rotateRpc();
      }
    }
    return 0.0;
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
    final uri = Uri.parse("solana:$recipient?amount=${amount.toStringAsFixed(6)}&label=SOLQ&message=QRIS%20Payment");
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  // ═══════════════════════════════════════════════
  //  ON-CHAIN VERIFICATION (Phase 4 Truth Only)
  // ═══════════════════════════════════════════════
  Future<bool> waitForSignature(String signature) async {
    // Poll with RPC failover for reliability
    for (int i = 0; i < 30; i++) {
      for (int rpcAttempt = 0; rpcAttempt < _rpcEndpoints.length; rpcAttempt++) {
        try {
          final statuses = await _rpc.getSignatureStatuses([signature]);
          final list = statuses.value;
          if (list.isNotEmpty && list.first != null) {
            final s = list.first!;
            if (s.confirmationStatus == Commitment.finalized) {
              return true;
            }
          }
          break; // RPC call succeeded, wait before next poll
        } catch (e) {
          _rotateRpc();
        }
      }
      await Future.delayed(const Duration(seconds: 2));
    }
    return false;
  }

  String generateSolanaPayUrl(String amount, String label, String message) {
    return "solana:$_connectedPublicKey?amount=$amount&label=${Uri.encodeComponent(label)}&message=${Uri.encodeComponent(message)}";
  }
}
