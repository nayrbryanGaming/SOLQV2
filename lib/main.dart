import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'dart:async';
import 'dart:io';
import 'dart:convert';
import 'package:url_launcher/url_launcher.dart';
import 'services/qris_parser.dart';
import 'services/orchestrator_service.dart';
import 'services/webhook_service.dart';
import 'models/payment_intent.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await OrchestratorService().init();
  WebhookService().startServer(); // Start Local Server
  runApp(const WarungPayOrchestrator());
}

class WarungPayOrchestrator extends StatelessWidget {
  const WarungPayOrchestrator({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'WarungPay Orchestrator',
      theme: ThemeData(
        fontFamily: 'Inter',
        primaryColor: Colors.black,
        scaffoldBackgroundColor: const Color(0xFF121212),
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
  // STATE IS NOW MANAGED BY SERVICE, UI JUST LISTENS
  // Local state only for Scanner Controller
  MobileScannerController? _scannerController;
  final OrchestratorService _service = OrchestratorService();
  StreamSubscription<PaymentIntent>? _subscription;
  
  PaymentIntent? _intent;

  @override
  void initState() {
    super.initState();
    // CRITICAL FIX: Load restored state immediately!
    _intent = _service.currentIntent;
    
    _subscription = _service.stream.listen((intent) {
      if (!mounted) return;
      setState(() {
        _intent = intent;
      });
    });
  }

  @override
  void dispose() {
    _subscription?.cancel();
    _scannerController?.dispose();
    super.dispose();
  }

  void _startScan() {
    // Reset service if needed, though persistence might want to keep it.
    // For now, let's assume new scan = new flow.
    _service.reset(); 
    setState(() {
       _intent = null;
       _scannerController = MobileScannerController();
    });
  }

  void _onScanDetect(BarcodeCapture capture) {
    if (_intent != null) return; // Already processing
    if (capture.barcodes.isNotEmpty) {
      final raw = capture.barcodes.first.rawValue ?? "";
      _onQrisDetected(raw);
    }
  }

  void _onQrisDetected(String rawPayload) {
    _scannerController?.stop();
    print("RAW PAYLOAD RECEIVED: $rawPayload");
    final result = QrisParser.parse(rawPayload);

    if (!result.isValid) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('INVALID QRIS: ${result.errorReason}'), backgroundColor: Colors.red),
      );
      _scannerController?.start(); 
      return;
    }

    // CREATE INTENT IN BACKEND
    _service.createIntent(result.merchantName, result.amount, result.acquirer);
  }

  void _reset() {
    _service.reset();
    setState(() {
      _intent = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('WarungPay', style: TextStyle(fontWeight: FontWeight.bold, letterSpacing: 1.5)),
        centerTitle: true,
        backgroundColor: Colors.black,
        elevation: 0,
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(20),
          child: const Padding(
            padding: EdgeInsets.only(bottom: 10),
            child: Text('QRIS Payment Orchestrator', style: TextStyle(color: Colors.grey, fontSize: 12)),
          ),
        ),
      ),
      body: Stack(
        children: [
          _buildBody(),
          // DEBUG OVERLAY FOR HARD PROOF #2
          Positioned(
            top: 40, right: 20,
            child: Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(color: Colors.black87, borderRadius: BorderRadius.circular(8), border: Border.all(color: Colors.white24)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  const Text('INFRA STATUS', style: TextStyle(color: Colors.greenAccent, fontSize: 10, fontWeight: FontWeight.bold)),
                  Text('IP: ${WebhookService().ipAddress}', style: const TextStyle(color: Colors.white, fontSize: 10)),
                  Text(
                    WebhookService().statusMessage, 
                    style: TextStyle(
                      color: WebhookService().isRunning ? Colors.green : Colors.red, 
                      fontSize: 10,
                      fontWeight: FontWeight.bold
                    )
                  ),
                  if (_intent != null) ...[
                     Text('Active Intent: ${_intent!.id.substring(0,6)}...', style: const TextStyle(color: Colors.yellowAccent, fontSize: 10)),
                     const SizedBox(height: 8),
                     ElevatedButton(
                       onPressed: () => _simulateWebhook(_intent!.id),
                       style: ElevatedButton.styleFrom(
                         backgroundColor: Colors.blueAccent, 
                         padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                         minimumSize: const Size(0, 0)
                       ),
                       child: const Text('TEST LOCAL WEBHOOK', style: TextStyle(fontSize: 8, color: Colors.white)),
                     ),
                  ]
                ],
              ),
            ),
          )
        ],
      ),
    );
  }

  // SELF-DIAGNOSTIC TOOL: BYPASS WIFI ISSUES
  Future<void> _simulateWebhook(String intentId) async {
    final url = Uri.parse('http://127.0.0.1:8080/webhook/settlement');
    final body = jsonEncode({
      "intentId": intentId,
      "status": "SETTLED",
      "refId": "REF-SELF-TEST-${DateTime.now().millisecondsSinceEpoch}"
    });

    try {
      final client = HttpClient();
      final request = await client.postUrl(url);
      request.headers.contentType = ContentType.json;
      request.write(body);
      final response = await request.close();
      
      if (response.statusCode == 200) {
        print("SELF-TEST SUCCESS");
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Self-Test Sent! Watch UI Update."), backgroundColor: Colors.green));
      } else {
        print("SELF-TEST SERVER ERROR: ${response.statusCode}");
      }
    } catch (e) {
      print("SIMULATION FAILED: $e");
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Self-Test Failed: $e"), backgroundColor: Colors.red));
    }
  }

  Widget _buildBody() {
    // 1. SCANNING
    if (_scannerController != null && _intent == null) {
      return _buildScannerView();
    }

    // 2. IDLE
    if (_intent == null) {
      return _buildIdleView();
    }

    // 3. DETECTED / PROCESSING
    return _buildOrchestrationView(_intent!);
  }

  // 1. IDLE
  Widget _buildIdleView() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(color: Colors.white10, shape: BoxShape.circle),
            child: const Icon(Icons.qr_code_scanner, size: 60, color: Colors.white70),
          ),
          const SizedBox(height: 30),
          const Text('Ready to Orchestrate', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
          const SizedBox(height: 10),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 40),
            child: Text('Scan QRIS merchant. WarungPay will orchestrate crypto settlement in the background.', 
              textAlign: TextAlign.center, style: TextStyle(color: Colors.grey)),
          ),
          const SizedBox(height: 50),
          ElevatedButton.icon(
            onPressed: _startScan,
            icon: const Icon(Icons.camera_alt, color: Colors.black),
            label: const Text('SCAN MERCHANT QRIS', style: TextStyle(color: Colors.black, fontWeight: FontWeight.bold)),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 30, vertical: 15),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(30)),
            ),
          ),
        ],
      ),
    );
  }

  // 2. SCANNER
  Widget _buildScannerView() {
    return Stack(
      children: [
        MobileScanner(
          controller: _scannerController, 
          onDetect: _onScanDetect,
          errorBuilder: (context, error, child) => Center(child: Text('Camera Error: ${error.errorCode}', style: const TextStyle(color: Colors.red))),
        ),
        Center(
          child: Container(
            width: 280, height: 280,
            decoration: BoxDecoration(
              border: Border.all(color: Colors.white, width: 2),
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        ),
        Positioned(
          bottom: 50, left: 0, right: 0,
          child: Column(
            children: [
              const Text('Scanning for Valid QRIS...', style: TextStyle(color: Colors.white, backgroundColor: Colors.black45)),
              const SizedBox(height: 20),
              TextButton(onPressed: _reset, child: const Text('CANCEL', style: TextStyle(color: Colors.white70))),
            ],
          ),
        )
      ],
    );
  }

  // 3. ORCHESTRATION VIEW (STATE DRIVEN)
  Widget _buildOrchestrationView(PaymentIntent intent) {
    return Padding(
      padding: const EdgeInsets.all(24.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // CONTEXT CARD (Always visible for context)
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(border: Border.all(color: Colors.white24), borderRadius: BorderRadius.circular(8)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                 Row(
                   mainAxisAlignment: MainAxisAlignment.spaceBetween,
                   children: [
                     Column(
                       crossAxisAlignment: CrossAxisAlignment.start,
                       children: [
                         Text(intent.merchantName.toUpperCase(), style: const TextStyle(fontWeight: FontWeight.bold, letterSpacing: 1)),
                         Text('Acquirer: ${intent.acquirer}', style: const TextStyle(color: Colors.grey, fontSize: 10)),
                       ],
                     ),
                     Text('IDR ${intent.amount}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.greenAccent)),
                   ],
                 ),
                 const SizedBox(height: 8),
                 Text('Payment Intent ID: ${intent.id}', style: const TextStyle(color: Colors.white30, fontSize: 8, fontFamily: 'Monospace')),
              ],
            ),
          ),
          
          const SizedBox(height: 24),
          const Text('ORCHESTRATION EVENT LOG', style: TextStyle(color: Colors.grey, fontSize: 12, letterSpacing: 2)),
          const SizedBox(height: 12),
          
          Expanded(
            child: ListView(
              children: [
                _buildStep(true, "Payment Intent Created", "UUID: ${intent.id}"),
                
                // AWAITING AUTHORIZATION
                if (intent.state.index >= PaymentState.AWAITING_AUTHORIZATION.index)
                   _buildStep(
                     intent.state.index > PaymentState.AWAITING_AUTHORIZATION.index, 
                     "Authorization Requested", 
                     "Redirecting to Wallet..."
                   ),
                
                // AUTHORIZED
                if (intent.state.index >= PaymentState.AUTHORIZED.index)
                   _buildStep(
                     true, 
                     "Payment Authorized", 
                     "Sig: ${intent.authorizationSignature != null ? intent.authorizationSignature!.substring(0, 10) + '...' : 'PENDING'}"
                   ),

                // AWAITING SETTLEMENT
                if (intent.state.index >= PaymentState.AWAITING_SETTLEMENT.index)
                   _buildStep(
                     intent.state.index > PaymentState.AWAITING_SETTLEMENT.index, 
                     "Settlement Initiated", 
                     "Routing to ${intent.acquirer}"
                   ),

                // COMPLETED
                if (intent.state.index >= PaymentState.COMPLETED.index)
                   _buildStep(
                     true, 
                     "Settlement Completed", 
                     "Ref: ${intent.partnerRef ?? 'UNKNOWN'}"
                   ),

                // EXPIRED
                if (intent.state == PaymentState.EXPIRED)
                   _buildStep(true, "Authorization Expired", "Timeout: Please scan again."),
              ],
            ),
          ),

          if (intent.state == PaymentState.COMPLETED) ...[
             Padding(
              padding: const EdgeInsets.only(top: 16),
              child: SizedBox(width: double.infinity, child: ElevatedButton.icon(
                onPressed: () => _openSolscan(intent.id), 
                icon: const Icon(Icons.link, color: Colors.white),
                label: const Text('VIEW CHAIN PROOF (SOLSCAN)', style: TextStyle(color: Colors.white)),
                style: ElevatedButton.styleFrom(backgroundColor: Colors.purple),
              )),
            ),
             Padding(
              padding: const EdgeInsets.only(top: 8),
              child: SizedBox(width: double.infinity, child: ElevatedButton(onPressed: _reset, style: ElevatedButton.styleFrom(backgroundColor: Colors.white10), child: const Text('New Scan', style: TextStyle(color: Colors.white)))),
            ),
          ]
        ],
      ),
    );
  }

  void _openSolscan(String intentId) async {
    // Search by Memo is hard on Solscan UI directly without a hash, 
    // but we can open the Devnet Explorer.
    // Ideally we would have the Tx Signature from the user, but for now open the Explorer 
    // and tell user "Your intent ID is there".
    // Or better: If we had the wallet address, we open that account's tx history.
    // Let's open Solana Explorer Devnet.
    final url = Uri.parse('https://explorer.solana.com/?cluster=devnet');
    await launchUrl(url, mode: LaunchMode.externalApplication);
  }

  Widget _buildStep(bool isCompleted, String title, String subtitle) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 24),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          isCompleted 
            ? const Icon(Icons.check_circle, color: Colors.greenAccent, size: 20)
            : const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: TextStyle(fontWeight: FontWeight.bold, color: isCompleted ? Colors.white : Colors.grey)),
                Text(subtitle, style: const TextStyle(color: Colors.grey, fontSize: 12, fontFamily: 'Monospace')),
              ],
            ),
          )
        ],
      ),
    );
  }
}
