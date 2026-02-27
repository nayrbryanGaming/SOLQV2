import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:url_launcher/url_launcher.dart';
import 'dart:async';
import 'services/qris_parser.dart';
import 'services/orchestrator_service.dart';
import 'services/webhook_service.dart';
import 'services/solana_service.dart';
import 'services/solq_service.dart';
import 'models/payment_intent.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await OrchestratorService().init();
  
  // WebhookService uses dart:io shelf server — only runs on native (not web)
  if (!identical(0, 0.0)) {
    // Always true, but the real guard is below
  }
  try {
    WebhookService().startServer();
  } catch (e) {
    // WebhookService not available on this platform
  }
  
  // Ensure full screen / immersive for production feel
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

  @override
  void initState() {
    super.initState();
    _intent = _service.currentIntent;
    _subscription = _service.stream.listen((intent) {
      if (!mounted) return;
      setState(() => _intent = intent);
    }, onError: (error) {
       if (!mounted) return;
       
       // Handle socket exceptions by offering IP change
       if (error.toString().contains("SocketException") || error.toString().contains("No route to host")) {
         _showIPDialog(error.toString());
       } else {
         ScaffoldMessenger.of(context).showSnackBar(
           SnackBar(
             content: Text("SYSTEM ERROR: $error", style: const TextStyle(fontWeight: FontWeight.bold)),
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
      if (event == "CONNECTED" || event == "DISCONNECTED") {
      }
    });
    // Initial fetch if already connected
    if (SolanaService().isConnected) {
      _fetchBalance();
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
    if (_intent == null) return _buildIdleView();
    if (_intent!.state == PaymentState.completed) {
      return _buildSuccessReceipt(_intent!);
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
            _actionButton(
              "SCAN QRIS", 
              Icons.qr_code_scanner, 
              Colors.white, 
              _startScan,
              textColor: Colors.black
            ),
        ],
      ),
    );
  }

  void _showWalletPicker(SolanaService solana) {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF121212),
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (context) => Container(
        padding: const EdgeInsets.symmetric(vertical: 20),
        height: MediaQuery.of(context).size.height * 0.7,
        child: Column(
          children: [
            const Text("PILIH DOMPET / WALLET", style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900, letterSpacing: 2)),
            const SizedBox(height: 20),
            Expanded(
              child: ListView(
                children: [
                  _walletButton("Phantom", Icons.account_balance_wallet, Colors.purpleAccent, () {
                    Navigator.pop(context);
                    solana.connectPhantom();
                  }),
                  _walletButton("Solflare", Icons.account_balance_wallet, Colors.orangeAccent, () {
                    Navigator.pop(context);
                    solana.connectSolflare();
                  }),
                  _walletButton("Jupiter", Icons.rocket_launch, Colors.greenAccent, () {
                    Navigator.pop(context);
                    solana.connectJupiter();
                  }),
                  _walletButton("Metamask", Icons.token, Colors.orange, () {
                    Navigator.pop(context);
                    solana.connectMetamask();
                  }),
                  _walletButton("Binance Web3", Icons.account_balance, Colors.yellow, () {
                    Navigator.pop(context);
                    solana.connectCex('Binance', 'bnc://app.binance.com/defi/wallet/connect?app_url=https://solq.app&redirect_link=solq://onConnect');
                  }),
                  _walletButton("OKX Wallet", Icons.grid_view, Colors.white, () {
                    Navigator.pop(context);
                    solana.connectCex('OKX', 'okx://wallet/dapp/details?dappUrl=https://solq.app&redirect_link=solq://onConnect');
                  }),
                  _walletButton("Trust Wallet", Icons.security, Colors.blueAccent, () {
                    Navigator.pop(context);
                    solana.connectCex('Trust', 'trust://solana/connect?app_url=https://solq.app&redirect_link=solq://onConnect');
                  }),
                  _walletButton("Bybit", Icons.currency_bitcoin, Colors.orangeAccent, () {
                    Navigator.pop(context);
                    solana.connectCex('Bybit', 'bybitapp://open/route?name=web3&url=https://solq.app');
                  }),
                  _walletButton("Gate.io", Icons.g_translate, Colors.redAccent, () {
                    Navigator.pop(context);
                    solana.connectCex('Gate.io', 'gateio://wallet/connect?url=https://solq.app');
                  }),
                  _walletButton("Backpack", Icons.backpack, Colors.red, () {
                    Navigator.pop(context);
                    solana.connectCex('Backpack', 'backpack://wallet/connect?app_url=https://solq.app&redirect_link=solq://onConnect');
                  }),
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    child: Divider(color: Colors.white10),
                  ),
                  _walletOption("Jupiter App (MWA)", "ag.jup.quote", () {
                    Navigator.pop(context);
                    solana.connectJupiter();
                  }, 
                  icon: Icons.rocket_launch, 
                  color: Colors.greenAccent, 
                  desc: "Recommended for Low Fees"
                  ),
                  _walletOption("Browser Extension (Web Only)", null, () {
                    Navigator.pop(context);
                    solana.connectUniversal(wallet: 'universal');
                  }, 
                  icon: Icons.extension_rounded, 
                  color: Colors.blueAccent,
                  desc: "Supports all desktop extensions"
                  ),
                  _walletOption("Other Wallet App", null, () {
                    Navigator.pop(context);
                    solana.connectUniversal();
                  }, 
                  icon: Icons.grid_view_sharp, 
                  color: Colors.white38,
                  desc: "Uses Solana Universal Intent"
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _walletOption(String name, String? package, VoidCallback onTap, {IconData icon = Icons.account_balance_wallet, Color color = Colors.greenAccent, String desc = "Mainnet Verified"}) {
    return ListTile(
      leading: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(8)),
        child: Icon(icon, color: color, size: 20),
      ),
      title: Text(name, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
      subtitle: Text(desc, style: const TextStyle(color: Colors.white24, fontSize: 10)),
      trailing: const Icon(Icons.chevron_right, color: Colors.white24),
      onTap: onTap,
    );
  }




  Widget _buildScannerView() {
    return MobileScanner(
      controller: _scannerController,
      onDetect: _onScanDetect,
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
          
          const SizedBox(height: 60),
          
          // REAL AUTHORIZATION TRIGGER (FOR PROOF)
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
                       Text("AUTHORIZE TRANSACTION", style: TextStyle(color: Colors.white70, fontWeight: FontWeight.bold)),
                    ],
                  ),
                ),
                const SizedBox(height: 10),
                const Text("Awaiting Wallet Signature...", style: TextStyle(color: Colors.white24, fontSize: 10)),
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

  Widget _walletButton(String name, IconData icon, Color color, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 100,
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.08),
          border: Border.all(color: color.withValues(alpha: 0.3), width: 1),
          borderRadius: BorderRadius.circular(4),
        ),
        child: Column(
          children: [
            Icon(icon, color: color, size: 24),
            const SizedBox(height: 8),
            Text(
              name.toUpperCase(),
              style: TextStyle(color: color, fontSize: 9, fontWeight: FontWeight.w900, letterSpacing: 1),
              textAlign: TextAlign.center,
            ),
          ],
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
    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 30, vertical: 50),
      child: Column(
        children: [
          const Icon(Icons.check_circle_outline, color: Colors.greenAccent, size: 60),
          const SizedBox(height: 20),
          const Text("PAYMENT SUCCESSFUL", style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: Colors.greenAccent, letterSpacing: 2)),
          const SizedBox(height: 8),
          const Text("MAINNET TRANSACTION FINALIZED", style: TextStyle(fontSize: 9, color: Colors.white30, fontWeight: FontWeight.bold, letterSpacing: 1)),
          const SizedBox(height: 40),
          
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [Colors.white.withValues(alpha: 0.05), Colors.white.withValues(alpha: 0.01)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: Colors.white10),
              boxShadow: [
                BoxShadow(
                  color: Colors.greenAccent.withValues(alpha: 0.05),
                  blurRadius: 40,
                  spreadRadius: -10,
                )
              ],
            ),
            child: Column(
              children: [
                const Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.verified, color: Colors.greenAccent, size: 14),
                    SizedBox(width: 8),
                    Text("OFFICIAL SETTLEMENT RECEIPT", style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: Colors.greenAccent, letterSpacing: 1)),
                  ],
                ),
                const SizedBox(height: 20),
                Text(intent.merchantName.toUpperCase(), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, letterSpacing: 1)),
                const SizedBox(height: 4),
                Text("ACQUIRER: SOLQ | REF: ${intent.settlementReference}", style: const TextStyle(fontSize: 8, color: Colors.white24, fontWeight: FontWeight.bold)),
                const Divider(height: 40, color: Colors.white10),
                
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text("Rp ${intent.amountIdr}", style: const TextStyle(fontSize: 42, fontWeight: FontWeight.w900, color: Colors.white, letterSpacing: -1)),
                  ],
                ),
                const SizedBox(height: 30),
                
                _feeRow("Final Exchange Rate", "1 SOL ≈ ${intent.quotedRate?.toStringAsFixed(0)} IDR"),
                const SizedBox(height: 30),
                
                // REAL PROOF OF SUCCESS (SOLANA EXPLORER)
                ElevatedButton.icon(
                  onPressed: () {
                    final uri = Uri.parse("https://solana.fm/tx/${intent.settlementReference}?cluster=mainnet-beta");
                    launchUrl(uri, mode: LaunchMode.externalApplication);
                  },
                  icon: const Icon(Icons.open_in_new, size: 16),
                  label: const Text("VIEW ON-CHAIN PROOF", style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.white10,
                    foregroundColor: Colors.white,
                    side: const BorderSide(color: Colors.white24),
                    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                  ),
                ),
                
                const SizedBox(height: 40),
                TextButton(
                  onPressed: () => setState(() => _intent = null),
                  child: const Text("CLOSE RECEIPT", style: TextStyle(color: Colors.white24, letterSpacing: 2)),
                ),
              ],
            ),
          ),
          const SizedBox(height: 40),
          _actionButton(
            "SELESAI", 
            Icons.done_all, 
            Colors.white10, 
            () => setState(() => _intent = null)
          ),
          const SizedBox(height: 20),
        ],
      ),
    );
  }
}
