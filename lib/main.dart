import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';

import 'services/solana_service.dart';
import 'services/orchestrator_service.dart';
import 'services/language_service.dart';
import 'services/scanner_service.dart';
import 'models/payment_intent.dart';
import 'widgets/scanner_view.dart';
import 'widgets/payment_status_view.dart';
import 'widgets/idle_view.dart';
import 'widgets/payment_history_view.dart';
import 'widgets/wallet_picker.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  final lang = LanguageService();
  await lang.init();

  // Pre-warm singleton scanner (eliminates first-open black screen)
  ScannerService.instance.initialize();

  final solana = SolanaService();
  final orchestrator = OrchestratorService();
  await orchestrator.init();

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: lang),
      ],
      child: const SOLQApp(),
    ),
  );
}

class SOLQApp extends StatelessWidget {
  const SOLQApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SOLQ',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF0D0D0D),
        fontFamily: 'Inter',
        useMaterial3: true,
      ),
      home: const MainOrchestrator(),
    );
  }
}

class MainOrchestrator extends StatefulWidget {
  const MainOrchestrator({super.key});

  @override
  State<MainOrchestrator> createState() => _MainOrchestratorState();
}

class _MainOrchestratorState extends State<MainOrchestrator> {
  final _solana = SolanaService();
  final _orchestrator = OrchestratorService();
  
  int _selectedIndex = 0;
  bool _isScanning = false;
  PaymentIntent? _activeIntent;
  String _settlementTrack = 'standard';
  double _solBalance = 0.0;
  StreamSubscription? _intentSub;

  @override
  void initState() {
    super.initState();
    _initListeners();
    _refreshBalance();
  }

  void _initListeners() {
    _intentSub = _orchestrator.stream.listen((intent) {
      setState(() {
        _activeIntent = intent;
        if (intent.state != PaymentState.completed && intent.state != PaymentState.failed) {
          _isScanning = false;
        }
      });
    }, onError: (err) {
      _showError(err.toString());
    });

    _solana.signatureStream.listen((event) {
      if (event == 'CONNECTED') {
        _refreshBalance();
      } else if (event == 'DISCONNECTED' || event == 'DISCONNECT') {
        if (mounted) setState(() => _solBalance = 0.0);
      }
    });
  }

  Future<void> _refreshBalance() async {
    if (_solana.isConnected) {
      final bal = await _solana.getBalance();
      if (mounted) setState(() => _solBalance = bal);
    }
  }

  void _showError(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), backgroundColor: Colors.redAccent),
    );
  }

  @override
  void dispose() {
    _intentSub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final lang = context.watch<LanguageService>();
    
    return Scaffold(
      body: Stack(
        children: [
          IndexedStack(
            index: _selectedIndex,
            children: [
              _buildHomeTab(lang),
              const PaymentHistoryView(),
              _buildSettingsTab(lang),
            ],
          ),
          if (_isScanning)
            ScannerView(
              onDetect: (code) => _orchestrator.createIntent(code),
              onCancel: () => setState(() => _isScanning = false),
            ),
        ],
      ),
      bottomNavigationBar: _isScanning || _activeIntent != null
          ? null
          : BottomNavigationBar(
              currentIndex: _selectedIndex,
              onTap: (idx) => setState(() => _selectedIndex = idx),
              backgroundColor: const Color(0xFF141414),
              selectedItemColor: const Color(0xFF00FF94),
              unselectedItemColor: Colors.white24,
              showSelectedLabels: true,
              showUnselectedLabels: false,
              items: [
                BottomNavigationBarItem(icon: const Icon(Icons.payment), label: lang.t('pay')),
                BottomNavigationBarItem(icon: const Icon(Icons.history), label: lang.t('history')),
                BottomNavigationBarItem(icon: const Icon(Icons.settings), label: lang.t('settings')),
              ],
            ),
    );
  }

  Widget _buildHomeTab(LanguageService lang) {
    if (_activeIntent != null) {
      return PaymentStatusView(
        intent: _activeIntent!,
        settlementTrack: _settlementTrack,
        onTrackChanged: (track) => setState(() => _settlementTrack = track),
        onReset: () {
          setState(() {
            _activeIntent = null;
            _orchestrator.reset();
          });
        },
      );
    }

    return IdleView(
      solana: _solana,
      balance: _solBalance,
      onStartScan: () {
        if (!_solana.isConnected) {
          WalletPicker.show(context);
        } else {
          setState(() => _isScanning = true);
        }
      },
      onPickGallery: () {
         if (!_solana.isConnected) {
          WalletPicker.show(context);
        } else {
          setState(() => _isScanning = true); // ScannerView handles gallery pick
        }
      },
    );
  }

  Widget _buildSettingsTab(LanguageService lang) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(lang.t('settings'), style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
          const SizedBox(height: 32),
          ListTile(
            title: Text(lang.t('language')),
            trailing: DropdownButton<AppLanguage>(
              value: lang.currentLanguage,
              onChanged: (l) => lang.setLanguage(l!),
              items: const [
                DropdownMenuItem(value: AppLanguage.en, child: Text("English")),
                DropdownMenuItem(value: AppLanguage.id, child: Text("Indonesia")),
              ],
            ),
          ),
          const Divider(indent: 20, endIndent: 20, color: Colors.white10),
          ListTile(
            title: const Text("Wallet"),
            subtitle: Text(_solana.isConnected ? _solana.connectedAddress! : lang.t('connect_wallet')),
            trailing: _solana.isConnected 
              ? IconButton(icon: const Icon(Icons.logout), onPressed: () => setState(() => _solana.disconnect()))
              : ElevatedButton(onPressed: () => WalletPicker.show(context), child: const Text("CONNECT")),
          ),
        ],
      ),
    );
  }
}
