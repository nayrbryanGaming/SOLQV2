// SOLQ — NO-SECURITY ENTRY POINT
// Build: flutter build apk --dart-define=APP_ENV=nosec --target=lib/main_nosec.dart
//
// Intended for: live demo, investor presentation, CEO/presiden walkthrough.
// ALL security checks (root detection, developer-mode gate, screenshot prevention)
// are intentionally removed so the APK runs on ANY Android device without
// interference. Real mainnet transactions still apply — this is NOT a simulation.

import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

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
  // No jailbreak / root / developer-mode check in this build.

  final lang = LanguageService();
  await lang.init();

  ScannerService.instance.initialize();

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

class _MainOrchestratorState extends State<MainOrchestrator>
    with WidgetsBindingObserver {
  final _solana = SolanaService();
  final _orchestrator = OrchestratorService();

  int _selectedIndex = 0;
  bool _isScanning = false;
  bool _isCreatingIntent = false;
  PaymentIntent? _activeIntent;
  String _settlementTrack = 'standard';
  double _solBalance = 0.0;
  StreamSubscription? _intentSub;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _initListeners();
    _refreshBalance();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.inactive) {
      _solana.pauseSessionTimeout();
    } else if (state == AppLifecycleState.resumed) {
      _solana.resumeSessionTimeout();
    }
  }

  void _initListeners() {
    _intentSub = _orchestrator.stream.listen((intent) {
      setState(() {
        _activeIntent = intent;
        if (intent.state != PaymentState.completed &&
            intent.state != PaymentState.failed) {
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
      } else if (event == 'CONNECT_FAILED') {
        _showError(
            'Wallet tidak dapat terhubung. Pastikan Phantom/Solflare sudah terpasang dan coba lagi.');
      } else if (event == 'WAITING_BROWSER') {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Menunggu konfirmasi di wallet...'),
            duration: Duration(seconds: 3),
            backgroundColor: Color(0xFF1A1A2E),
          ),
        );
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
    WidgetsBinding.instance.removeObserver(this);
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
              onDetect: (code) async {
                setState(() {
                  _isScanning = false;
                  _isCreatingIntent = true;
                });
                await _orchestrator.createIntent(code);
                if (mounted) setState(() => _isCreatingIntent = false);
              },
              onCancel: () =>
                  setState(() {
                    _isScanning = false;
                    _isCreatingIntent = false;
                  }),
            ),
          if (_isCreatingIntent)
            Container(
              color: Colors.black87,
              child: const Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    CircularProgressIndicator(
                        color: Color(0xFF00FF94), strokeWidth: 2),
                    SizedBox(height: 20),
                    Text('Fetching quote...',
                        style:
                            TextStyle(color: Colors.white70, fontSize: 14)),
                  ],
                ),
              ),
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
                BottomNavigationBarItem(
                    icon: const Icon(Icons.payment),
                    label: lang.t('pay')),
                BottomNavigationBarItem(
                    icon: const Icon(Icons.history),
                    label: lang.t('history')),
                BottomNavigationBarItem(
                    icon: const Icon(Icons.settings),
                    label: lang.t('settings')),
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
          setState(() => _isScanning = true);
        }
      },
    );
  }

  Widget _buildSettingsTab(LanguageService lang) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(lang.t('settings'),
              style: const TextStyle(
                  fontSize: 24, fontWeight: FontWeight.bold)),
          const SizedBox(height: 32),
          ListTile(
            title: Text(lang.t('language')),
            trailing: DropdownButton<AppLanguage>(
              value: lang.currentLanguage,
              onChanged: (l) => lang.setLanguage(l!),
              items: const [
                DropdownMenuItem(
                    value: AppLanguage.en, child: Text("English")),
                DropdownMenuItem(
                    value: AppLanguage.id, child: Text("Indonesia")),
              ],
            ),
          ),
          const Divider(indent: 20, endIndent: 20, color: Colors.white10),
          ListTile(
            title: const Text("Wallet"),
            subtitle: Text(_solana.isConnected
                ? _solana.connectedAddress!
                : lang.t('connect_wallet')),
            trailing: _solana.isConnected
                ? IconButton(
                    icon: const Icon(Icons.logout),
                    onPressed: () =>
                        setState(() => _solana.disconnect()))
                : ElevatedButton(
                    onPressed: () => WalletPicker.show(context),
                    child: const Text("CONNECT")),
          ),
        ],
      ),
    );
  }
}
