import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:provider/provider.dart';
import 'package:flutter_jailbreak_detection/flutter_jailbreak_detection.dart';

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

  // BUG-034 FIX: Block only genuinely rooted devices.
  // developerMode check removed — causes false positives on Xiaomi/OPPO/Vivo.
  if (!kDebugMode) {
    try {
      final isJailbroken = await FlutterJailbreakDetection.jailbroken;
      if (isJailbroken) {
        runApp(const _BlockedDeviceApp());
        return;
      }
    } catch (_) {
      // Detection failure is non-fatal — proceed normally.
    }
  }

  final lang = LanguageService();
  await lang.init();

  // Pre-warm singleton scanner (eliminates first-open black screen)
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
        brightness: Brightness.light,
        scaffoldBackgroundColor: const Color(0xFFFAF9F6),
        colorScheme: const ColorScheme.light(
          primary: Color(0xFF0E0E0C),
          surface: Color(0xFFFAF9F6),
          onSurface: Color(0xFF0E0E0C),
        ),
        fontFamily: 'Inter',
        useMaterial3: true,
      ),
      home: const MainOrchestrator(),
    );
  }
}

// BUG-034: Shown when app detects rooted/jailbroken device
class _BlockedDeviceApp extends StatelessWidget {
  const _BlockedDeviceApp();
  @override
  Widget build(BuildContext context) {
    return const MaterialApp(
      debugShowCheckedModeBanner: false,
      home: Scaffold(
        backgroundColor: Color(0xFF0D0D0D),
        body: Center(
          child: Padding(
            padding: EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.security, color: Colors.redAccent, size: 64),
                SizedBox(height: 24),
                Text('DEVICE NOT SUPPORTED', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold, letterSpacing: 2)),
                SizedBox(height: 16),
                Text('SOLQ cannot run on rooted or jailbroken devices for security reasons.', textAlign: TextAlign.center, style: TextStyle(color: Colors.white54, fontSize: 13)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class MainOrchestrator extends StatefulWidget {
  const MainOrchestrator({super.key});

  @override
  State<MainOrchestrator> createState() => _MainOrchestratorState();
}

class _MainOrchestratorState extends State<MainOrchestrator> with WidgetsBindingObserver {
  final _solana = SolanaService();
  final _orchestrator = OrchestratorService();

  int _selectedIndex = 0;
  bool _isScanning = false;
  bool _isCreatingIntent = false; // BUG-027: Loading overlay while fetching quote
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

  // BUG-NEW-002 FIX: Pause/resume session timeout timer with app lifecycle.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused || state == AppLifecycleState.inactive) {
      _solana.pauseSessionTimeout();
    } else if (state == AppLifecycleState.resumed) {
      _solana.resumeSessionTimeout();
    }
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
      } else if (event == 'CONNECT_FAILED') {
        _showError('Wallet tidak dapat terhubung. Pastikan Phantom/Solflare sudah terpasang dan coba lagi.');
      } else if (event == 'WAITING_BROWSER') {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Menunggu konfirmasi di wallet...'),
              duration: Duration(seconds: 3),
              backgroundColor: Color(0xFF0E0E0C),
            ),
          );
        }
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
                setState(() { _isScanning = false; _isCreatingIntent = true; });
                await _orchestrator.createIntent(code);
                if (mounted) setState(() => _isCreatingIntent = false);
              },
              onCancel: () => setState(() { _isScanning = false; _isCreatingIntent = false; }),
            ),
          // BUG-027 FIX: Loading overlay while backend fetches quote after scan
          if (_isCreatingIntent)
            Container(
              color: const Color(0xFFFAF9F6).withValues(alpha: 0.92),
              child: const Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    CircularProgressIndicator(color: Color(0xFF0E0E0C), strokeWidth: 2),
                    SizedBox(height: 20),
                    Text('Fetching quote...',
                        style: TextStyle(color: Color(0xFF76766E), fontSize: 14)),
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
              backgroundColor: const Color(0xFFFFFFFF),
              selectedItemColor: const Color(0xFF0E0E0C),
              unselectedItemColor: const Color(0xFF76766E),
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
          const Divider(indent: 20, endIndent: 20, color: Color(0xFFE6E4DD)),
          ListTile(
            title: const Text("Wallet",
                style: TextStyle(color: Color(0xFF0E0E0C))),
            subtitle: Text(
              _solana.isConnected
                  ? _solana.connectedAddress!
                  : lang.t('connect_wallet'),
              style: const TextStyle(color: Color(0xFF76766E)),
            ),
            trailing: _solana.isConnected
                ? IconButton(
                    icon: const Icon(Icons.logout, color: Color(0xFF76766E)),
                    onPressed: () => setState(() => _solana.disconnect()))
                : ElevatedButton(
                    onPressed: () => WalletPicker.show(context),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF0E0E0C),
                      foregroundColor: const Color(0xFFFAF9F6),
                      elevation: 0,
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8)),
                    ),
                    child: const Text("CONNECT")),
          ),
        ],
      ),
    );
  }
}
