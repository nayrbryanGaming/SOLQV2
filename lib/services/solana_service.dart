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
      final savedType = prefs.getString('connected_wallet_type'); // NEW
      
      if (savedAddr != null && savedAddr.isNotEmpty) {
        _connectedPublicKey = savedAddr;
        _connectedWalletType = savedType ?? 'Unknown'; // Default if missing
        _signatureController.add("CONNECTED");
      }
    } catch (e) {
      // No saved connection
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

    final url = Uri.https('phantom.app', '/ul/v1/connect', {
      'dapp_encryption_public_key': _dappPubKeyB58,
      'cluster': 'mainnet-beta',
      'app_url': 'https://solq.app',
      'redirect_link': 'solq://onConnect',
    });
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

    final url = Uri.https('solflare.com', '/ul/v1/connect', {
      'dapp_encryption_public_key': _dappPubKeyB58,
      'cluster': 'mainnet-beta',
      'app_url': 'https://solq.app',
      'redirect_link': 'solq://onConnect',
    });
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

    // Jupiter supports standard solana:connect but we can try its specific scheme too
    final url = Uri.parse('jupiter://connect?app_url=https://solq.app&redirect_link=solq://onConnect&cluster=mainnet-beta');
    
    try {
       await launchUrl(url, mode: LaunchMode.externalApplication);
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
      final webAddr = await WebProvider.connectPhantom(); // window.okxwallet etc handled in JS
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
      // We manually add WAITING state since these act as browsers
      _signatureController.add("WAITING_BROWSER");
    } catch(e) {
      await connectUniversal(wallet: cexName.toLowerCase()); // Fallback to intent
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

    // NATIVE EVM: Use correct universal link for MetaMask mobile browser
    final url = Uri.parse('https://metamask.app.link/dapp/solq.app');
    
    try {
      await launchUrl(url, mode: LaunchMode.externalApplication);
    } catch (e) {
      await connectUniversal(wallet: 'metamask');
    }
  }

  // ═══════════════════════════════════════════════
  //  UNIVERSAL CONNECT
  // ═══════════════════════════════════════════════
  Future<void> connectUniversal({String wallet = 'universal'}) async {
    
    if (kIsWeb) {
      // Web logic remains the same
      if (wallet.toLowerCase() == 'phantom' || wallet == 'universal') {
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

    // NATIVE INTENT: Using the standard solana:connect protocol
    // This is the most flexible way to trigger any installed wallet supporting MWA/Solana Pay
    // Using explicit uri paths to maximize Android Intent Resolution
    final uri = Uri.parse('solana:connect?app_url=https://solq.app&redirect_link=solq://onConnect&cluster=mainnet-beta');
    
    try {
      if (await canLaunchUrl(uri)) {
         await launchUrl(uri, mode: LaunchMode.externalNonBrowserApplication);
      } else {
         await launchUrl(uri, mode: LaunchMode.externalApplication);
      }
    } catch (e) {
      // Fallback for devices without a wallet app installed: send to portal or app store
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

    // 1. Phatom/Solflare specific deep links (v1 specs)
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
    } else {
      // 2. UNIVERSAL INTENT (Recommended for maximum flexibility)
      // Standard: solana:signTransaction?transaction=<base64>&redirect_link=<url>
      url = Uri.parse('solana:signTransaction?transaction=${Uri.encodeComponent(base64Transaction)}&redirect_link=solq://onSign&cluster=mainnet-beta');
    }

    try {
       if (await canLaunchUrl(url)) {
          await launchUrl(url, mode: LaunchMode.externalNonBrowserApplication);
       } else {
          await launchUrl(url, mode: LaunchMode.externalApplication);
       }
    } catch (e) {
       final fallback = Uri.parse('solana:signTransaction?transaction=${Uri.encodeComponent(base64Transaction)}&redirect_link=solq://onSign');
       await launchUrl(fallback, mode: LaunchMode.externalApplication);
    }
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
    final uri = Uri.parse("solana:$recipient?amount=${amount.toStringAsFixed(6)}&label=SOLQ&message=QRIS%20Payment");
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  // ═══════════════════════════════════════════════
  //  ON-CHAIN VERIFICATION (Phase 4 Truth Only)
  // ═══════════════════════════════════════════════
  Future<bool> waitForSignature(String signature) async {
    try {
      // Manual Polling Loop (Safe for all solana package versions)
      for (int i = 0; i < 20; i++) {
        final statuses = await _rpc.getSignatureStatuses([signature]);
        final list = statuses.value;
        if (list.isNotEmpty && list.first != null) {
          final s = list.first!;
          if (s.confirmationStatus == Commitment.finalized) {
            return true;
          }
        }
        await Future.delayed(const Duration(seconds: 3));
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  String generateSolanaPayUrl(String amount, String label, String message) {
    return "solana:$_connectedPublicKey?amount=$amount&label=${Uri.encodeComponent(label)}&message=${Uri.encodeComponent(message)}";
  }
}
