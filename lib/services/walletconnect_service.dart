import 'package:url_launcher/url_launcher.dart';

class UniversalWalletService {
  static final UniversalWalletService _instance = UniversalWalletService._internal();
  factory UniversalWalletService() => _instance;
  UniversalWalletService._internal();

  String? _connectedAddress;
  String? _connectedWalletType;

  final List<WalletOption> supportedWallets = [
    WalletOption(name: 'Phantom', scheme: 'phantom', isMWA: true),
    WalletOption(name: 'Solflare', scheme: 'solflare', isMWA: true),
    WalletOption(name: 'Jupiter', scheme: 'jupiter', isMWA: true),
    WalletOption(name: 'Binance', scheme: 'bnc', isMWA: false),
    WalletOption(name: 'OKX', scheme: 'okx', isMWA: false),
    WalletOption(name: 'Trust', scheme: 'trust', isMWA: false),
    WalletOption(name: 'Bybit', scheme: 'bybit', isMWA: false),
    WalletOption(name: 'Gate.io', scheme: 'gate', isMWA: false),
    WalletOption(name: 'MetaMask', scheme: 'metamask', isMWA: false),
    WalletOption(name: 'Backpack', scheme: 'backpack', isMWA: true),
    WalletOption(name: 'Rainbow', scheme: 'rainbow', isMWA: false),
  ];

  /* 
   * UNIVERSAL WEB3 CONNECTION LOGIC
   * Supports both Deep Links (Universal) and App Schemes
   */

  Future<void> connectBinance() async {
    final url = Uri.parse('bnc://app.binance.com/defi/wallet/connect?uri=solana:...');
    if (await canLaunchUrl(url)) {
      await launchUrl(url);
      _connectedWalletType = 'Binance';
    } else {
       // Fallback to Web
       await launchUrl(Uri.parse('https://www.binance.com/en/download'));
    }
  }

  Future<void> connectOKX() async {
    final url = Uri.parse('okx://wallet/dapp/details?dappUrl=https://SOLQ.com');
    if (await canLaunchUrl(url)) {
      await launchUrl(url);
      _connectedWalletType = 'OKX';
    }
  }

  Future<void> connectTrust() async {
    final url = Uri.parse('trust://solana/connect');
    if (await canLaunchUrl(url)) {
      await launchUrl(url);
      _connectedWalletType = 'Trust';
    }
  }

  Future<void> connectBybit() async {
    final url = Uri.parse('bybit://web3/connect');
    await launchUrl(url, mode: LaunchMode.externalApplication);
     _connectedWalletType = 'Bybit';
  }

  Future<void> connectGate() async {
    final url = Uri.parse('gateio://wallet/connect');
    await launchUrl(url, mode: LaunchMode.externalApplication);
    _connectedWalletType = 'Gate';
  }

  /// Connect to selected wallet
  Future<void> connectTo(String walletScheme) async {
    switch (walletScheme) {
      case 'binance':
        await connectBinance();
        break;
      case 'okx':
        await connectOKX();
        break;
      case 'trust':
        await connectTrust();
        break;
      case 'bybit':
        await connectBybit();
        break;
      case 'gate':
        await connectGate();
        break;
      case 'jupiter':
        await connectJupiter();
        break;
      case 'metamask':
        await connectMetamask();
        break;
      case 'backpack':
        await connectBackpack();
        break;
      default:
        // MWA wallets (Phantom, Solflare, etc.)
        // Uses standard solana: scheme
        final url = Uri.parse('solana:connect?app_url=https://SOLQ.com&redirect_link=SOLQ://onConnect');
        await launchUrl(url, mode: LaunchMode.externalApplication);
    }
  }

  /// Connect to Jupiter Wallet
  Future<void> connectJupiter() async {
    // Jupiter MWA Connect URL (App-to-App Scheme)
    final url = Uri.parse(
      'jupiter://wallet/connect?'
      'app_url=https://solq.app&'
      'redirect_link=solq://onConnect'
    );
    
    print('[JUPITER] Launching Jupiter Wallet (Native Scheme)...');
    _connectedWalletType = 'Jupiter';
    
    await launchUrl(url, mode: LaunchMode.externalApplication);
  }

  /// Connect to MetaMask Wallet (Solana Snap / Future Support)
  /// Currently via standard deep link assuming Solflare-like behavior or specific Metamask scheme
  Future<void> connectMetamask() async {
    final url = Uri.parse(
      'metamask://dapp/SOLQ.com' 
      // Note: Metamask Solana support is usually via Snaps. 
      // Direct deep link might just open browser.
    );
    
    print('[METAMASK] Launching MetaMask...');
    
    if (await canLaunchUrl(url)) {
      await launchUrl(url, mode: LaunchMode.externalApplication);
      _connectedWalletType = 'MetaMask';
    } else {
       print('[METAMASK] App not installed');
       // Fallback to Play Store
       final playStore = Uri.parse('https://play.google.com/store/apps/details?id=io.metamask');
    }
  }

  /// Connect to Backpack Wallet
  Future<void> connectBackpack() async {
    final url = Uri.parse(
      'backpack://wallet/connect?'
      'app_url=https://solq.app&'
      'redirect_link=solq://onConnect'
    );
    
    print('[BACKPACK] Launching Backpack Wallet...');
    _connectedWalletType = 'Backpack';
    
    await launchUrl(url, mode: LaunchMode.externalApplication);
  }

  void disconnect() {
    _connectedAddress = null;
    _connectedWalletType = null;
  }
}

class WalletOption {
  final String name;
  final String scheme;
  final bool isMWA; // Mobile Wallet Adapter support
  
  WalletOption({required this.name, required this.scheme, required this.isMWA});
}
