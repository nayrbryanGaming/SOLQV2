import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:image_picker/image_picker.dart';
import 'dart:async';
import 'services/qris_parser.dart';
import 'services/orchestrator_service.dart';
import 'services/webhook_service.dart';
import 'services/solana_service.dart';
import 'services/solq_service.dart';
import 'services/coingecko_service.dart';
import 'models/payment_intent.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Parallel initialization for faster startup
  await Future.wait([
    OrchestratorService().init(),
    CoinGeckoService().init().catchError((_) {}), // Non-blocking price warmup
  ]);

  // WebhookService only on native platforms
  try {
    WebhookService().startServer();
  } catch (_) {}

  // Full screen immersive mode
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.light, 
    systemNavigationBarColor: Colors.transparent,
  ));
  
  runApp(const SOLQOrchestrator());
}

class SOLQOrchestrator extends StatelessWidget {
  const SOLQOrchestrator({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'SOLQ',
      theme: ThemeData(
        fontFamily: 'Inter',
        scaffoldBackgroundColor: const Color(0xFF0F0F0F),
        brightness: Brightness.dark,
        useMaterial3: true,
      ),
      home: const OrchestratorScreen(),
    );
  }
}

class OrchestratorScreen extends StatefulWidget {
  const OrchestratorScreen({super.key});

  @override
  State<OrchestratorScreen> createState() => _OrchestratorScreenState();
}

class _OrchestratorScreenState extends State<OrchestratorScreen> {
  MobileScannerController? _scannerController;
  final OrchestratorService _service = OrchestratorService();
  StreamSubscription<PaymentIntent>? _subscription;
  StreamSubscription<String>? _walletSub;
  PaymentIntent? _intent;
  String _manualAmount = "";
  String _settlementTrack = 'standard'; // 'instant', 'standard', 'economy'

  @override
  void initState() {
    super.initState();
    _intent = _service.currentIntent;
    _subscription = _service.stream.listen((intent) {
      if (!mounted) return;
      setState(() => _intent = intent);
    }, onError: (error) {
       if (!mounted) return;
       
       final errStr = error.toString();
       // Handle connectivity/timeout issues by offering IP change
       final isConnError = errStr.contains("SocketException") ||
           errStr.contains("No route to host") ||
           errStr.contains("TimeoutException") ||
           errStr.contains("Future not completed") ||
           errStr.contains("Connection refused") ||
           errStr.contains("SERVER TIMEOUT") ||
           errStr.contains("KONEKSI GAGAL");

       if (isConnError) {
         // Show snackbar first with the friendly message, then open IP dialog
         ScaffoldMessenger.of(context).showSnackBar(
           SnackBar(
             content: Text(errStr, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
             backgroundColor: Colors.redAccent,
             duration: const Duration(seconds: 4),
             action: SnackBarAction(
               label: 'UBAH IP',
               textColor: Colors.yellowAccent,
               onPressed: () => _showIPDialog(errStr),
             ),
           )
         );
         // Auto-open IP dialog after brief delay
         Future.delayed(const Duration(milliseconds: 300), () {
           if (mounted) _showIPDialog(errStr);
         });
       } else {
         ScaffoldMessenger.of(context).showSnackBar(
           SnackBar(
             content: Text("SYSTEM ERROR: $errStr", style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
             backgroundColor: Colors.redAccent,
           )
         );
       }
       
       setState(() {
         _intent = null;
         _scannerController?.start();
       });
    });
    // CRITICAL: Listen for wallet connection callback to refresh UI
    _walletSub = SolanaService().signatureStream.listen((event) {
      if (!mounted) return;
      if (event == "CONNECTED") {
        _fetchBalance();
        setState(() {}); // Force rebuild of the whole screen
      } else if (event == "DISCONNECTED") {
        setState(() {
          _balance = 0.0;
        });
      }
    });
    // Initial fetch if already connected
    if (SolanaService().isConnected) {
      _fetchBalance();
    } else {
      // Auto-show wallet picker on first launch if not connected
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && !SolanaService().isConnected) {
          _showWalletPicker(SolanaService());
        }
      });
    }
  }

  void _showIPDialog(String error) {
    final controller = TextEditingController();
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        title: const Text("NETWORK REACHABILITY ALERT", style: TextStyle(color: Colors.redAccent, fontSize: 14)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text("The app cannot reach the Backend Server. This is usually due to a Windows Firewall block or IP change.", style: TextStyle(fontSize: 12)),
            const SizedBox(height: 10),
            Text("Error: $error", style: const TextStyle(fontSize: 10, color: Colors.white38)),
            const SizedBox(height: 10),
            TextField(
              controller: controller,
              decoration: const InputDecoration(
                labelText: "BACKEND IP (e.g., 192.168.1.5)",
                hintText: "192.168.18.15",
                labelStyle: TextStyle(fontSize: 10),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text("CLOSE")),
          ElevatedButton(
            onPressed: () async {
              if (controller.text.isNotEmpty) {
                final newUrl = "http://${controller.text}:3000/v1";
                await SOLQService.setPersistedBaseUrl(newUrl);
                if (!context.mounted) return;
                Navigator.pop(context);
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("IP UPDATED. PLEASE RESCAN.")));
              }
            },
            child: const Text("UPDATE IP"),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _subscription?.cancel();
    _walletSub?.cancel();
    _scannerController?.dispose();
    super.dispose();
  }

  void _startScan() {
    _service.reset();
    setState(() {
       _intent = null;
       _scannerController = MobileScannerController();
    });
  }

  Future<void> _pickFromGallery() async {
    final picker = ImagePicker();
    final XFile? image = await picker.pickImage(source: ImageSource.gallery);
    if (image == null) return; // user cancelled

    // Prefer the already-running scanner controller (has active native channel).
    // If no scanner is open (idle view), create a dedicated one.
    final bool ownController = _scannerController == null;
    final MobileScannerController ctrl =
        _scannerController ?? MobileScannerController();

    try {
      final completer = Completer<BarcodeCapture?>();

      // Subscribe BEFORE calling analyzeImage to avoid race condition.
      final sub = ctrl.barcodes.listen((capture) {
        if (!completer.isCompleted && capture.barcodes.isNotEmpty) {
          completer.complete(capture);
        }
      });

      // mobile_scanner 3.5.x: analyzeImage sets up event channel on first call
      // then returns bool. The barcode result fires on the same event channel.
      final bool found = await ctrl.analyzeImage(image.path);

      BarcodeCapture? capture;
      if (found) {
        // Give native side up to 8s to deliver the barcode via event channel.
        capture = await completer.future
            .timeout(const Duration(seconds: 8), onTimeout: () => null);
      }

      await sub.cancel();
      if (ownController) ctrl.dispose();

      if (capture != null && capture.barcodes.isNotEmpty) {
        final raw = capture.barcodes.first.rawValue ?? "";
        if (raw.isNotEmpty) {
          _onQrisDetected(raw);
          return;
        }
      }

      if (!found) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Tidak ada QR code ditemukan di gambar'),
              backgroundColor: Colors.orangeAccent,
              duration: Duration(seconds: 2),
            ),
          );
        }
      } else {
        // found=true but stream timed out — shouldn't happen, but handle gracefully
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('QR terdeteksi tapi gagal dibaca, coba lagi'),
              backgroundColor: Colors.orangeAccent,
              duration: Duration(seconds: 2),
            ),
          );
        }
      }
    } catch (e) {
      if (ownController) ctrl.dispose();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Gagal membaca gambar: $e'),
            backgroundColor: Colors.red,
            duration: const Duration(seconds: 3),
          ),
        );
      }
    }
  }

  void _onScanDetect(BarcodeCapture capture) {
    if (_intent != null) return;
    if (capture.barcodes.isNotEmpty) {
      final raw = capture.barcodes.first.rawValue ?? "";
      _onQrisDetected(raw);
    }
  }

  void _onQrisDetected(String rawPayload) {
    _scannerController?.stop();
    final result = QrisParser.parse(rawPayload);

    if (!result.isValid) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('FAILURE: ${result.errorReason}'), backgroundColor: Colors.red),
      );
      _scannerController?.start();
      return;
    }

    // Pass raw payload to backend for canonical intent creation
    _service.createIntent(rawPayload);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('SOLQ', style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 4, color: Color(0xFF00FF94))),
        centerTitle: true,
        backgroundColor: Colors.black,
        elevation: 0,
        flexibleSpace: Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [const Color(0xFF00FF94).withValues(alpha: 0.1), Colors.black]
            )
          ),
        ),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(30),
          child: Container(
            color: Colors.amberAccent.withValues(alpha: 0.1),
            padding: const EdgeInsets.symmetric(vertical: 5),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.check_circle, size: 12, color: Color(0xFF00FF94)),
                const SizedBox(width: 8),
                FutureBuilder<Map<String, dynamic>>(
                  future: SOLQService().getStats(),
                  builder: (context, snapshot) {
                    final count = snapshot.data?['success_count'] ?? 0;
                    return Text(
                      "$count PEMBAYARAN BERHASIL HARI INI",
                      style: const TextStyle(fontSize: 10, color: Color(0xFF00FF94), fontWeight: FontWeight.bold),
                    );
                  }
                ),
                const SizedBox(width: 16),
                GestureDetector(
                  onTap: () => _showIPDialog("MANUAL CONFIGURATION"),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      border: Border.all(color: Colors.white24),
                      borderRadius: BorderRadius.circular(4)
                    ),
                    child: const Text("IP", style: TextStyle(fontSize: 8, color: Colors.white38)),
                  ),
                )
              ],
            ),
          ),
        ),
        actions: [
          StreamBuilder<String>(
            stream: SolanaService().signatureStream,
            initialData: SolanaService().isConnected ? "CONNECTED" : "DISCONNECTED",
            builder: (context, snapshot) {
              final solana = SolanaService();
              final isConn = solana.isConnected;
              final walletType = solana.currentWalletType?.toUpperCase() ?? "UNKNOWN";
              final address = solana.connectedAddress ?? "";
              final shortAddr = address.length > 8 
                  ? "${address.substring(0, 4)}...${address.substring(address.length - 4)}" 
                  : address;

              return Center( // Use Center to align vertically in AppBar
                child: Container(
                  margin: const EdgeInsets.only(right: 12),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: isConn 
                        ? const Color(0xFF00FF94).withValues(alpha: 0.15) // Bright Green BG
                        : const Color(0xFFFF5252).withValues(alpha: 0.15), // Bright Red BG
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: isConn ? const Color(0xFF00FF94) : const Color(0xFFFF5252),
                      width: 1
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        isConn ? Icons.wallet : Icons.wallet_rounded, 
                        size: 16, 
                        color: isConn ? const Color(0xFF00FF94) : const Color(0xFFFF5252)
                      ),
                      const SizedBox(width: 8),
                      if (isConn) ...[
                        Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              walletType,
                              style: const TextStyle(
                                fontSize: 10, 
                                fontWeight: FontWeight.w900, 
                                color: Color(0xFF00FF94),
                                letterSpacing: 0.5
                              )
                            ),
                            Text(
                              shortAddr,
                              style: const TextStyle(fontSize: 9, color: Colors.white, fontWeight: FontWeight.bold)
                            ),
                          ],
                        )
                      ] else ...[
                        const Text(
                          "NO WALLET",
                          style: TextStyle(
                            fontSize: 10, 
                            fontWeight: FontWeight.w900, 
                            color: Color(0xFFFF5252),
                            letterSpacing: 0.5
                          )
                        )
                      ]
                    ],
                  ),
                ),
              );
            }
          ),
        ],
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_scannerController != null && _intent == null) {
      return _buildScannerView();
    }
    if (_intent == null) {
      return _buildIdleView();
    }
    if (_intent!.state == PaymentState.completed) {
      return _buildSuccessReceipt(_intent!);
    }
    if (_intent!.state == PaymentState.failed) {
      return _buildFailedView(_intent!);
    }
    return _buildStatusView(_intent!);
  }

  // --- REBUILT IDLE VIEW (PROVEN ROBUST) ---

  double _balance = 0.0;

  Future<void> _fetchBalance() async {
    final bal = await SolanaService().getBalance();
    if (mounted) setState(() => _balance = bal);
  }

  Future<void> _disconnect() async {
    await SolanaService().disconnect();
    if (mounted) {
      setState(() {
        _balance = 0.0;
      });
    }
  }

  Widget _buildIdleView() {
    final solana = SolanaService();
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            solana.isConnected ? Icons.account_balance_wallet : Icons.account_balance_wallet_outlined,
            size: 80, 
            color: solana.isConnected ? Colors.greenAccent : Colors.white24
          ),
          const SizedBox(height: 20),
          if (solana.isConnected)
            Column(
              children: [
                const SizedBox(height: 12),
                Text(
                  "${_balance.toStringAsFixed(4)} SOL",
                  style: const TextStyle(fontSize: 32, fontWeight: FontWeight.bold, color: Colors.white),
                ),
                const Text("Mainnet Beta", style: TextStyle(color: Colors.white24, fontSize: 10)),
                const SizedBox(height: 8),
                const Text("SOLANA → QRIS BRIDGE", style: TextStyle(color: Colors.white10, fontSize: 9, fontWeight: FontWeight.w900, letterSpacing: 3)),
                const SizedBox(height: 24),
                OutlinedButton.icon(
                  onPressed: _disconnect,
                  icon: const Icon(Icons.logout, size: 16, color: Colors.redAccent),
                  label: const Text("DISCONNECT", style: TextStyle(color: Colors.redAccent)),
                  style: OutlinedButton.styleFrom(
                    side: BorderSide(color: Colors.redAccent.withValues(alpha: 0.5)),
                    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                  ),
                ),
              ],
            )
          else
            const Text("NO WALLET CONNECTED", style: TextStyle(color: Colors.white24)),
          
          const SizedBox(height: 40),
          
          if (!solana.isConnected)
            Column(
              children: [
                _actionButton(
                  "CONNECT WALLET", 
                  Icons.account_balance_wallet, 
                  Colors.blueAccent, 
                  () => _showWalletPicker(solana),
                ),
                const SizedBox(height: 10),
                const Text(
                  "Supports Phantom, Solflare, Base & more",
                  style: TextStyle(color: Colors.white24, fontSize: 9, fontWeight: FontWeight.bold),
                ),
              ],
            )
          else
            Column(
              children: [
                _actionButton(
                  "SCAN QRIS",
                  Icons.qr_code_scanner,
                  Colors.white,
                  _startScan,
                  textColor: Colors.black
                ),
                const SizedBox(height: 16),
                OutlinedButton.icon(
                  onPressed: _pickFromGallery,
                  icon: const Icon(Icons.photo_library, size: 18, color: Colors.white70),
                  label: const Text(
                    "PILIH DARI GALERI",
                    style: TextStyle(
                      color: Colors.white70,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 1,
                      fontSize: 12,
                    ),
                  ),
                  style: OutlinedButton.styleFrom(
                    side: const BorderSide(color: Colors.white24),
                    padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                ),
                const SizedBox(height: 10),
                const Text(
                  "Scan langsung atau pilih foto QR dari galeri",
                  style: TextStyle(color: Colors.white24, fontSize: 9, fontWeight: FontWeight.bold),
                ),
              ],
            ),
        ],
      ),
    );
  }

  void _showWalletPicker(SolanaService solana) {
    showDialog(
      context: context,
      builder: (context) => SimpleDialog(
        title: const Text("Connect Wallet", style: TextStyle(fontWeight: FontWeight.w600, fontSize: 18)),
        backgroundColor: const Color(0xFF1A1A1A),
        titleTextStyle: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 18),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        children: [
          _walletDialogItem("Phantom", Icons.account_balance_wallet, const Color(0xFFAB9FF2), () {
            Navigator.pop(context);
            solana.connectPhantom();
          }),
          _walletDialogItem("Solflare", Icons.wb_sunny_outlined, const Color(0xFFFFA726), () {
            Navigator.pop(context);
            solana.connectSolflare();
          }),
          _walletDialogItem("Jupiter", Icons.swap_horiz, const Color(0xFF4CAF50), () {
            Navigator.pop(context);
            solana.connectJupiter();
          }),
          _walletDialogItem("MetaMask (Snaps)", Icons.hexagon_outlined, const Color(0xFFF6851B), () {
            Navigator.pop(context);
            solana.connectMetamask();
          }),
          const Divider(height: 1, color: Colors.white12, indent: 16, endIndent: 16),
          _walletDialogItem("Binance Web3", Icons.account_balance, const Color(0xFFF0B90B), () {
            Navigator.pop(context);
            solana.connectCex('Binance', 'bnc://app.binance.com/defi/wallet/connect?app_url=https://solq.app&redirect_link=solq://onConnect');
          }),
          _walletDialogItem("OKX Wallet", Icons.grid_view_rounded, Colors.white70, () {
            Navigator.pop(context);
            solana.connectCex('OKX', 'okx://wallet/dapp/details?dappUrl=https://solq.app&redirect_link=solq://onConnect');
          }),
          _walletDialogItem("Trust Wallet", Icons.verified_user_outlined, const Color(0xFF3375BB), () {
            Navigator.pop(context);
            solana.connectCex('Trust', 'trust://solana/connect?app_url=https://solq.app&redirect_link=solq://onConnect');
          }),
          _walletDialogItem("Bybit Web3", Icons.candlestick_chart, const Color(0xFFF7A600), () {
            Navigator.pop(context);
            solana.connectCex('Bybit', 'bybitapp://open/route?name=web3&url=https://solq.app');
          }),
          _walletDialogItem("Backpack", Icons.backpack_outlined, const Color(0xFFE44040), () {
            Navigator.pop(context);
            solana.connectCex('Backpack', 'backpack://wallet/connect?app_url=https://solq.app&redirect_link=solq://onConnect');
          }),
          const Divider(height: 1, color: Colors.white12, indent: 16, endIndent: 16),
          _walletDialogItem("Browser Extension", Icons.extension_outlined, Colors.white38, () {
            Navigator.pop(context);
            solana.connectUniversal(wallet: 'universal');
          }),
          _walletDialogItem("Other Wallet", Icons.more_horiz, Colors.white24, () {
            Navigator.pop(context);
            solana.connectUniversal();
          }),
        ],
      ),
    );
  }

  Widget _walletDialogItem(String name, IconData icon, Color color, VoidCallback onTap) {
    return SimpleDialogOption(
      onPressed: onTap,
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
      child: Row(
        children: [
          Icon(icon, color: color, size: 22),
          const SizedBox(width: 16),
          Text(name, style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }




  Widget _buildScannerView() {
    return Stack(
      children: [
        MobileScanner(
          controller: _scannerController,
          onDetect: _onScanDetect,
        ),
        // Gallery pick button overlay - bottom center
        Positioned(
          bottom: 40,
          left: 0,
          right: 0,
          child: Center(
            child: GestureDetector(
              onTap: () {
                // Do NOT stop the scanner — _pickFromGallery will reuse
                // _scannerController which already has an active event channel.
                _pickFromGallery();
              },
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.7),
                  borderRadius: BorderRadius.circular(30),
                  border: Border.all(color: Colors.white24, width: 1),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.photo_library, color: Colors.white, size: 20),
                    SizedBox(width: 10),
                    Text(
                      "PILIH DARI GALERI",
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
        // Scan frame hint overlay - center
        Center(
          child: Container(
            width: 250,
            height: 250,
            decoration: BoxDecoration(
              border: Border.all(color: const Color(0xFF00FF94).withValues(alpha: 0.5), width: 2),
              borderRadius: BorderRadius.circular(16),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildStatusView(PaymentIntent intent) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(40.0),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          // STATE-DRIVEN STATUS MESSAGES (THE BOSS PATH)
          if (intent.state == PaymentState.created) _statusText("QRIS Validated: Ready to Swap", color: Colors.greenAccent),
          if (intent.state == PaymentState.pendingAmount) _statusText("Manual Amount Entry", color: Colors.blueAccent),
          if (intent.state == PaymentState.authorizationRequested) _statusText("Launching Solana Pay Request...", color: Colors.amberAccent),
          if (intent.state == PaymentState.authorized) _statusText("Verifying On-Chain Transaction...", color: Colors.amberAccent),
          if (intent.state == PaymentState.awaitingSettlement) _statusText("Settlement In Progress...", color: Colors.blueAccent), 
          if (intent.state == PaymentState.completed) _statusText("SETTLEMENT COMPLETED", color: Colors.greenAccent),
          if (intent.state == PaymentState.failed) _statusText("TRANSACTION FAILED", color: Colors.redAccent),
          if (intent.state == PaymentState.expired) _statusText("SESSION EXPIRED", color: Colors.orangeAccent),
          
          const SizedBox(height: 40),
          Text(intent.merchantName.toUpperCase(), style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, letterSpacing: 1)),
          if (intent.bankCode != null || intent.nmid != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                "${intent.bankCode ?? 'E-MONEY'} | NMID: ${intent.nmid ?? 'PENDING'}", 
                style: const TextStyle(fontSize: 10, color: Colors.blueAccent, fontWeight: FontWeight.bold, letterSpacing: 1)
              ),
            ),
          if (intent.merchantAccount != null)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text("ID: ${intent.merchantAccount}", style: const TextStyle(fontSize: 11, color: Colors.white38)),
            ),
          
          // DYNAMIC AMOUNT VIEW
          if (intent.state == PaymentState.pendingAmount)
            _buildAmountInput(intent)
          else
            Column(
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.lock, size: 14, color: Colors.greenAccent),
                    const SizedBox(width: 8),
                    Text('Rp ${intent.amountIdr}', style: const TextStyle(fontSize: 32, color: Colors.greenAccent, fontWeight: FontWeight.w900)),
                  ],
                ),
                  if (intent.estimatedCryptoAmount != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 10),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(Icons.account_balance, size: 12, color: Colors.blueAccent),
                          const SizedBox(width: 4),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                            decoration: BoxDecoration(color: Colors.white10, borderRadius: BorderRadius.circular(4)),
                            child: Text(
                              "~ ${((double.tryParse(intent.estimatedCryptoAmount ?? "0.0") ?? 0.0) / 100).toStringAsFixed(2)} IDRX",
                              style: const TextStyle(color: Colors.greenAccent, fontSize: 13, fontWeight: FontWeight.bold),
                            ),
                          ),
                        ],
                      ),
                    ),
                  const SizedBox(height: 12),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.03),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
                    ),
                    child: Column(
                      children: [
                        _feeRow("Platform Yield (Spread)", "Rp ${intent.platformFee?.toStringAsFixed(0)}"),
                        _feeRow("Est. Network Gas", "${intent.networkFee?.toStringAsFixed(6)} SOL"),
                        _feeRow("Liquidity Slippage", "${intent.slippage}%"),
                        _feeRow("Total Fee (%)", "${intent.effectiveFeePercent}%", isHighlight: true),
                        _feeRow("YOU SAVE (vs Legacy)", "Rp ${intent.userSavingsVsQris?.toStringAsFixed(0)}", isHighlight: true),
                        _feeRow("TOTAL DIBAYAR", "Rp ${intent.maxFee?.toStringAsFixed(0)}", isHighlight: true),
                        const Divider(height: 20, color: Colors.white10),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Text("RATE", style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.white38)),
                            Text("1 SOL ≈ ${intent.quotedRate?.toStringAsFixed(0)} IDR", style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.greenAccent)),
                          ],
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          
          const SizedBox(height: 24),

          // ═══════════════════════════════════════════════════
          //  SETTLEMENT TRACK PICKER (3 Options)
          // ═══════════════════════════════════════════════════
          if (intent.state == PaymentState.created && intent.amountIdr != "0")
            _buildSettlementTrackPicker(intent),

          const SizedBox(height: 20),

          // REAL AUTHORIZATION TRIGGER (FOR PROOF)
          if (intent.state == PaymentState.created && intent.amountIdr != "0")
            Column(
              children: [
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: () => _service.requestAuthorization(intent.intentId),
                    icon: const Icon(Icons.payment, color: Colors.black),
                    label: Text(
                      _settlementTrack == 'instant'
                        ? "⚡ BAYAR INSTANT"
                        : _settlementTrack == 'economy'
                          ? "💎 BAYAR HEMAT"
                          : "BAYAR SEKARANG",
                      style: const TextStyle(color: Colors.black, fontWeight: FontWeight.w900, letterSpacing: 2),
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: _settlementTrack == 'instant'
                        ? Colors.amberAccent
                        : _settlementTrack == 'economy'
                          ? Colors.blueAccent
                          : const Color(0xFF00FF94),
                      padding: const EdgeInsets.symmetric(vertical: 18),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                  ),
                ),
              ],
            ),

          if (intent.state == PaymentState.authorizationRequested)
            Column(
              children: [
                const CircularProgressIndicator(color: Colors.white24, strokeWidth: 2),
                const SizedBox(height: 20),
                ElevatedButton(
                  onPressed: () => _service.requestAuthorization(intent.intentId),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.white10,
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 15),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(30)),
                    side: const BorderSide(color: Colors.white24),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                       Icon(Icons.double_arrow_rounded, color: Colors.white70),
                       SizedBox(width: 10),
                       Text("BUKA WALLET & TANDA TANGAN", style: TextStyle(color: Colors.white70, fontWeight: FontWeight.bold)),
                    ],
                  ),
                ),
                const SizedBox(height: 10),
                const Text("Menunggu Tanda Tangan Wallet...", style: TextStyle(color: Colors.white24, fontSize: 10)),
              ],
            ),

          if (intent.state == PaymentState.awaitingSettlement || intent.state == PaymentState.authorized)
            Column(
              children: [
                const SizedBox(height: 20),
                const CircularProgressIndicator(color: Color(0xFF00FF94), strokeWidth: 2),
                const SizedBox(height: 16),
                const Text("Memverifikasi transaksi on-chain...", style: TextStyle(color: Colors.white38, fontSize: 12)),
              ],
            ),

            if (intent.state != PaymentState.completed)
              TextButton(
                    onPressed: () => setState(() => _intent = null), 
                child: const Text("CANCEL", style: TextStyle(color: Colors.white24, fontSize: 12, letterSpacing: 2))
              ),
          
          const SizedBox(height: 50), // Fixed: Spacer() causes crash in SingleChildScrollView
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.redAccent.withValues(alpha: 0.05),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: Colors.redAccent.withValues(alpha: 0.2)),
            ),
            child: Row(
              children: [
                const Icon(Icons.warning_amber_rounded, color: Colors.redAccent, size: 16),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text("UANG ASLI. BUKAN SIMULASI.", style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.redAccent)),
                      Text(
                        "Transaksi ini memotong saldo SOL di wallet Anda.",
                        style: TextStyle(fontSize: 9, color: Colors.white.withValues(alpha: 0.5)),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // NUMPAD FOR STATIC QRIS

  // ═══════════════════════════════════════════════════════════
  //  SETTLEMENT TRACK PICKER
  //  3 options: INSTANT (Xendit), STANDARD (IDRX), ECONOMY (on-chain)
  // ═══════════════════════════════════════════════════════════
  Widget _buildSettlementTrackPicker(PaymentIntent intent) {
    final amount = double.tryParse(intent.amountIdr) ?? 0;

    // Cost calculations per track
    final instantFee = amount < 200000
        ? 2500 + (amount * 0.012)  // flat + 1.2% for small tx
        : amount * 0.025;          // 2.5% for larger tx
    final standardFee = amount * 0.012;  // ~1.2% (platform + slippage)
    final economyFee = amount * 0.005;   // ~0.5% (minimal, on-chain only)

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(Icons.route, size: 14, color: Colors.white.withValues(alpha: 0.5)),
            const SizedBox(width: 8),
            const Text(
              "SETTLEMENT TRACK",
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900, color: Colors.white54, letterSpacing: 2),
            ),
          ],
        ),
        const SizedBox(height: 12),

        // ⚡ INSTANT TRACK
        _trackOption(
          id: 'instant',
          icon: Icons.bolt,
          title: '⚡ INSTANT',
          subtitle: '5-30 detik → langsung masuk',
          time: '< 30 dtk',
          fee: 'Rp ${instantFee.toStringAsFixed(0)}',
          feePercent: '${(instantFee / amount * 100).toStringAsFixed(1)}%',
          color: Colors.amberAccent,
          description: 'Float Pool + Xendit → GoPay/OVO/BCA langsung',
          available: false,
          unavailableReason: 'Segera hadir (butuh Xendit API)',
        ),
        const SizedBox(height: 8),

        // 🔄 STANDARD TRACK (DEFAULT - RECOMMENDED)
        _trackOption(
          id: 'standard',
          icon: Icons.swap_horiz,
          title: '🔄 STANDARD',
          subtitle: '1-5 menit → IDRX off-ramp',
          time: '1-5 min',
          fee: 'Rp ${standardFee.toStringAsFixed(0)}',
          feePercent: '${(standardFee / amount * 100).toStringAsFixed(1)}%',
          color: const Color(0xFF00FF94),
          description: 'Jupiter swap → IDRX → off-ramp ke merchant',
          available: true,
          isRecommended: true,
        ),
        const SizedBox(height: 8),

        // 💎 ECONOMY TRACK
        _trackOption(
          id: 'economy',
          icon: Icons.diamond,
          title: '💎 ECONOMY',
          subtitle: 'On-chain settlement • paling murah',
          time: '1-24 jam',
          fee: 'Rp ${economyFee.toStringAsFixed(0)}',
          feePercent: '${(economyFee / amount * 100).toStringAsFixed(1)}%',
          color: Colors.blueAccent,
          description: 'IDRX on-chain di Treasury → batch redeem harian',
          available: true,
        ),

        const SizedBox(height: 12),

        // Safety guarantee
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: const Color(0xFF00FF94).withValues(alpha: 0.05),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: const Color(0xFF00FF94).withValues(alpha: 0.15)),
          ),
          child: Row(
            children: [
              const Icon(Icons.shield, size: 14, color: Color(0xFF00FF94)),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  "Semua track: dana AMAN di Treasury on-chain. 0% risiko kehilangan.",
                  style: TextStyle(fontSize: 9, color: const Color(0xFF00FF94).withValues(alpha: 0.7), fontWeight: FontWeight.bold),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _trackOption({
    required String id,
    required IconData icon,
    required String title,
    required String subtitle,
    required String time,
    required String fee,
    required String feePercent,
    required Color color,
    required String description,
    required bool available,
    bool isRecommended = false,
    String? unavailableReason,
  }) {
    final isSelected = _settlementTrack == id;

    return GestureDetector(
      onTap: available ? () => setState(() => _settlementTrack = id) : null,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        width: double.infinity,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: isSelected
            ? color.withValues(alpha: 0.12)
            : available
              ? Colors.white.withValues(alpha: 0.03)
              : Colors.white.withValues(alpha: 0.01),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isSelected
              ? color
              : available
                ? Colors.white.withValues(alpha: 0.1)
                : Colors.white.withValues(alpha: 0.05),
            width: isSelected ? 2 : 1,
          ),
        ),
        child: Row(
          children: [
            // Radio indicator
            Container(
              width: 22, height: 22,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(
                  color: isSelected ? color : Colors.white24,
                  width: 2,
                ),
                color: isSelected ? color : Colors.transparent,
              ),
              child: isSelected
                ? const Icon(Icons.check, size: 14, color: Colors.black)
                : null,
            ),
            const SizedBox(width: 12),

            // Icon
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: color.withValues(alpha: available ? 0.15 : 0.05),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(icon, color: available ? color : Colors.white24, size: 20),
            ),
            const SizedBox(width: 12),

            // Text content
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(
                        title,
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w900,
                          color: available ? Colors.white : Colors.white38,
                          letterSpacing: 0.5,
                        ),
                      ),
                      if (isRecommended) ...[
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: color.withValues(alpha: 0.2),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            'RECOMMENDED',
                            style: TextStyle(fontSize: 7, fontWeight: FontWeight.w900, color: color, letterSpacing: 1),
                          ),
                        ),
                      ],
                      if (!available) ...[
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.05),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: const Text(
                            'COMING SOON',
                            style: TextStyle(fontSize: 7, fontWeight: FontWeight.w900, color: Colors.white38, letterSpacing: 1),
                          ),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    available ? subtitle : (unavailableReason ?? subtitle),
                    style: TextStyle(
                      fontSize: 10,
                      color: available ? Colors.white54 : Colors.white24,
                    ),
                  ),
                ],
              ),
            ),

            // Fee & Time
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.05),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    time,
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w900,
                      color: available ? color : Colors.white24,
                    ),
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  fee,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    color: available ? Colors.white : Colors.white24,
                  ),
                ),
                Text(
                  feePercent,
                  style: TextStyle(
                    fontSize: 9,
                    color: available ? Colors.white38 : Colors.white12,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFailedView(PaymentIntent intent) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(40),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 80, height: 80,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: Colors.redAccent, width: 2),
                color: Colors.redAccent.withValues(alpha: 0.1),
              ),
              child: const Icon(Icons.close, color: Colors.redAccent, size: 44),
            ),
            const SizedBox(height: 16),
            const Text("TRANSAKSI GAGAL", style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: Colors.redAccent, letterSpacing: 2)),
            const SizedBox(height: 8),
            Text(intent.merchantName, style: const TextStyle(color: Colors.white54)),
            const SizedBox(height: 8),
            Text("Rp ${intent.amountIdr}", style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Colors.white)),
            const SizedBox(height: 32),
            const Text("Kemungkinan penyebab:", style: TextStyle(color: Colors.white38, fontSize: 12)),
            const SizedBox(height: 8),
            const Text("• Wallet menolak tanda tangan\n• Saldo SOL tidak cukup\n• Token salah / amount tidak cocok\n• Jaringan timeout",
              style: TextStyle(color: Colors.white24, fontSize: 11, height: 1.6)),
            const SizedBox(height: 40),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: () => setState(() {
                  _intent = null;
                  _service.reset();
                }),
                icon: const Icon(Icons.refresh, color: Colors.black),
                label: const Text("COBA LAGI", style: TextStyle(color: Colors.black, fontWeight: FontWeight.w900)),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.redAccent,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAmountInput(PaymentIntent intent) {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          decoration: BoxDecoration(
            color: Colors.blueAccent.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: Colors.blueAccent.withValues(alpha: 0.3)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.trending_down, size: 14, color: Colors.blueAccent),
              const SizedBox(width: 8),
              Text(
                "SAVING: Rp ${((double.tryParse(_manualAmount) ?? 0) * 0.0235).toStringAsFixed(0)} VS LEGACY (3%)",
                style: const TextStyle(color: Colors.blueAccent, fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 1),
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        Text('Rp ${_manualAmount.isEmpty ? "0" : _manualAmount}', 
          style: const TextStyle(fontSize: 40, color: Colors.white, fontWeight: FontWeight.bold)),
        const SizedBox(height: 20),
        GridView.count(
          shrinkWrap: true,
          crossAxisCount: 3,
          childAspectRatio: 1.5,
          children: List.generate(12, (index) {
            String val = "";
            if (index < 9) {
              val = "${index + 1}";
            } else if (index == 9) {
              val = "CLR";
            } else if (index == 10) {
              val = "0";
            } else if (index == 11) {
              val = "OK";
            }

            return TextButton(
              onPressed: () {
                setState(() {
                  if (val == "CLR") {
                    _manualAmount = "";
                  } else if (val == "OK") {
                    if (_manualAmount.isNotEmpty && _manualAmount != "0") {
                      _service.setAmount(intent.intentId, _manualAmount);
                      _manualAmount = "";
                    }
                  } else {
                    _manualAmount += val;
                  }
                });
              },
              child: Text(val, style: const TextStyle(color: Colors.white, fontSize: 20)),
            );
          }),
        ),
      ],
    );
  }

  Widget _statusText(String text, {Color color = Colors.white}) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 20),
      decoration: BoxDecoration(border: Border.all(color: Colors.white10)),
      child: Text(
        text,
        textAlign: TextAlign.center,
        style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: color)
      ),
    );
  }

  Widget _actionButton(String label, IconData icon, Color color, VoidCallback onPressed, {Color textColor = Colors.white, bool isPremium = false}) {
    return Container(
      decoration: isPremium ? BoxDecoration(
        boxShadow: [
          BoxShadow(
            color: color.withValues(alpha: 0.3),
            blurRadius: 30,
            spreadRadius: 5,
          )
        ],
      ) : null,
      child: ElevatedButton.icon(
        onPressed: onPressed,
        icon: Icon(icon, color: textColor, size: 18),
        label: Text(label, style: TextStyle(color: textColor, fontWeight: FontWeight.w900, letterSpacing: 1)),
        style: ElevatedButton.styleFrom(
          backgroundColor: color,
          padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 20),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          elevation: isPremium ? 20 : 10,
          shadowColor: color.withValues(alpha: 0.5),
        ),
      ),
    );
  }

  Widget _feeRow(String label, String value, {bool isHighlight = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(fontSize: 11, color: isHighlight ? Colors.amberAccent : Colors.white54, fontWeight: isHighlight ? FontWeight.bold : FontWeight.normal)),
          Text(value, style: TextStyle(fontSize: 11, color: isHighlight ? Colors.amberAccent : Colors.white, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _buildSuccessReceipt(PaymentIntent intent) {
    final txHash = intent.settlementReference ?? '';
    final shortHash = txHash.length > 12
        ? '${txHash.substring(0, 8)}...${txHash.substring(txHash.length - 6)}'
        : txHash;

    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 40),
      child: Column(
        children: [
          // ── ANIMATED CHECKMARK HEADER ──
          Container(
            width: 80, height: 80,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: const Color(0xFF00FF94), width: 2),
              color: const Color(0xFF00FF94).withValues(alpha: 0.1),
            ),
            child: const Icon(Icons.check, color: Color(0xFF00FF94), size: 44),
          ),
          const SizedBox(height: 16),
          const Text("PEMBAYARAN QRIS BERHASIL", style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: Color(0xFF00FF94), letterSpacing: 2)),
          const Text("SOLANA → QRIS | ON-CHAIN VERIFIED ✓", style: TextStyle(fontSize: 9, color: Colors.white30, letterSpacing: 2)),
          const SizedBox(height: 32),

          // ── RECEIPT CARD ──
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [Colors.white.withValues(alpha: 0.06), Colors.white.withValues(alpha: 0.02)],
                begin: Alignment.topLeft, end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Colors.white10),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.verified, color: Color(0xFF00FF94), size: 12),
                    const SizedBox(width: 6),
                    const Text("KWITANSI SOLQ × QRIS", style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: Color(0xFF00FF94), letterSpacing: 1)),
                  ],
                ),
                const SizedBox(height: 16),
                Text(intent.merchantName.toUpperCase(), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, letterSpacing: 1)),
                if (intent.bankCode != null)
                  Text("via ${intent.bankCode}", style: const TextStyle(fontSize: 10, color: Colors.blueAccent)),
                const Divider(height: 30, color: Colors.white10),

                // Amount
                Text("Rp ${int.tryParse(intent.amountIdr)?.toString().replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (m) => '${m[1]}.') ?? intent.amountIdr}",
                    style: const TextStyle(fontSize: 40, fontWeight: FontWeight.w900, color: Colors.white, letterSpacing: -1)),
                const SizedBox(height: 8),
                _feeRow("Exchange Rate", "1 SOL ≈ Rp ${intent.quotedRate?.toStringAsFixed(0) ?? '?'}"),
                _feeRow("Platform Fee (1%)", "Rp ${intent.platformFee?.toStringAsFixed(0) ?? '?'}"),
                _feeRow("Total Biaya Efektif", "${intent.effectiveFeePercent?.toStringAsFixed(2) ?? '~1.5'}%", isHighlight: true),
                const Divider(height: 24, color: Colors.white10),

                // TX HASH — Full + Copy
                if (txHash.isNotEmpty) ...[
                  const Text("ON-CHAIN TRANSACTION HASH", style: TextStyle(fontSize: 9, color: Colors.white38, letterSpacing: 1)),
                  const SizedBox(height: 8),
                  GestureDetector(
                    onTap: () {
                      Clipboard.setData(ClipboardData(text: txHash));
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text("TX Hash copied!"), duration: Duration(seconds: 2)),
                      );
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.05),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: Colors.white12),
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(shortHash, style: const TextStyle(
                              fontFamily: 'monospace', fontSize: 13, color: Color(0xFF00FF94), fontWeight: FontWeight.bold,
                            )),
                          ),
                          const Icon(Icons.copy, size: 14, color: Colors.white38),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // DUAL EXPLORER LINKS (Sam Altman Proof Standard)
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () => launchUrl(
                            Uri.parse("https://explorer.solana.com/tx/$txHash?cluster=mainnet-beta"),
                            mode: LaunchMode.externalApplication,
                          ),
                          icon: const Icon(Icons.open_in_new, size: 12),
                          label: const Text("Explorer", style: TextStyle(fontSize: 11)),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: Colors.white70,
                            side: const BorderSide(color: Colors.white12),
                            padding: const EdgeInsets.symmetric(vertical: 10),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () => launchUrl(
                            Uri.parse("https://solana.fm/tx/$txHash?cluster=mainnet-beta"),
                            mode: LaunchMode.externalApplication,
                          ),
                          icon: const Icon(Icons.launch, size: 12),
                          label: const Text("Solana.fm", style: TextStyle(fontSize: 11)),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: const Color(0xFF00FF94),
                            side: const BorderSide(color: Color(0xFF00FF94), width: 0.5),
                            padding: const EdgeInsets.symmetric(vertical: 10),
                          ),
                        ),
                      ),
                    ],
                  ),
                ] else ...[
                  const Text("TX HASH PENDING SYNC", style: TextStyle(fontSize: 10, color: Colors.amber)),
                ],

                const SizedBox(height: 24),
                Text(
                  "SOLQ | Transaksi selesai pada ${DateTime.now().toLocal().toString().substring(0, 19)}",
                  style: const TextStyle(fontSize: 8, color: Colors.white24),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),

          // ── SETTLEMENT INFO ──
          const SizedBox(height: 16),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.blueAccent.withValues(alpha: 0.05),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.blueAccent.withValues(alpha: 0.2)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Icon(Icons.qr_code, color: Colors.blueAccent, size: 16),
                    SizedBox(width: 8),
                    Text("SETTLEMENT QRIS", style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900, color: Colors.blueAccent, letterSpacing: 1)),
                  ],
                ),
                const SizedBox(height: 10),
                // Settlement track info
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: _settlementTrack == 'instant'
                      ? Colors.amberAccent.withValues(alpha: 0.1)
                      : _settlementTrack == 'economy'
                        ? Colors.blueAccent.withValues(alpha: 0.1)
                        : const Color(0xFF00FF94).withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    _settlementTrack == 'instant'
                      ? "⚡ INSTANT TRACK — 5-30 detik"
                      : _settlementTrack == 'economy'
                        ? "💎 ECONOMY TRACK — 1-24 jam (batch settlement)"
                        : "🔄 STANDARD TRACK — 1-5 menit via IDRX off-ramp",
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w900,
                      color: _settlementTrack == 'instant'
                        ? Colors.amberAccent
                        : _settlementTrack == 'economy'
                          ? Colors.blueAccent
                          : const Color(0xFF00FF94),
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                if (intent.bankCode != null)
                  Text("✅ IDR dikirim ke ${intent.bankCode} merchant via IDRX off-ramp",
                    style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.greenAccent.withValues(alpha: 0.8)))
                else
                  Text("✅ IDRX settlement on-chain — verifiable di Explorer",
                    style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.greenAccent.withValues(alpha: 0.8))),
                const SizedBox(height: 6),
                Text("SOL → IDRX (on-chain) → IDR (off-ramp) → Merchant",
                  style: TextStyle(fontSize: 9, color: Colors.white.withValues(alpha: 0.4))),
              ],
            ),
          ),

          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: () => setState(() {
                _intent = null;
                _service.reset();
              }),
              icon: const Icon(Icons.qr_code_scanner, color: Colors.black),
              label: const Text("BAYAR LAGI", style: TextStyle(color: Colors.black, fontWeight: FontWeight.w900, letterSpacing: 2)),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF00FF94),
                padding: const EdgeInsets.symmetric(vertical: 18),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              ),
            ),
          ),
          const SizedBox(height: 40),
        ],
      ),
    );
  }
}
