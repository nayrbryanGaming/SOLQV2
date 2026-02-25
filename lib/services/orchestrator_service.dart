import 'dart:async';
import 'package:url_launcher/url_launcher.dart'; // REQUIRED IMPORT
import '../models/payment_intent.dart';
import 'solq_service.dart';
import 'solana_service.dart';

class OrchestratorService {
  static final OrchestratorService _instance = OrchestratorService._internal();
  factory OrchestratorService() => _instance;
  OrchestratorService._internal();

  final _intentController = StreamController<PaymentIntent>.broadcast();
  Stream<PaymentIntent> get stream => _intentController.stream;

  PaymentIntent? _currentIntent;
  PaymentIntent? get currentIntent => _currentIntent;

  // Persistence
  Future<void> init() async {
    SolanaService().signatureStream.listen((event) {
      if (event.startsWith("SIGNED:")) {
        final parts = event.split(":");
        if (parts.length >= 3) {
          final intentId = parts[1];
          final signature = parts[2];
          print("[ORCHESTRATOR] ⚡ Signature Received from Wallet: $signature");
          confirmOnChain(intentId, signature);
        }
      } else if (event != "CONNECTED" && event != "DISCONNECTED" && event != "DISCONNECT") {
        // Handle raw signature (from solq://onSign?signature=...)
        if (_currentIntent != null && event.length > 30) {
           print("[ORCHESTRATOR] ⚡ Raw Signature Bridge: $event");
           confirmOnChain(_currentIntent!.intentId, event);
        }
      }
    });
  }

  Future<void> confirmOnChain(String intentId, String signature) async {
    try {
      print("[ORCHESTRATOR] ⚡ Direct RPC Verification Started: $signature");
      
      // Update UI to show we are verifying on Mainnet
      _currentIntent = _currentIntent!.copyWith(state: PaymentState.AWAITING_SETTLEMENT);
      _intentController.add(_currentIntent!);

      // Phase 4 Truth: Poll Solana RPC
      final isFinalized = await SolanaService().waitForSignature(signature);
      
      if (!isFinalized) {
        print("[ORCHESTRATOR] ❌ Verification Timeout/Failure for $signature");
        _currentIntent = _currentIntent!.copyWith(state: PaymentState.FAILED);
        _intentController.add(_currentIntent!);
        return;
      }

      print("[ORCHESTRATOR] ✅ ON-CHAIN TRUTH CONFIRMED. Syncing settlement with backend...");
      
      final baseUrl = await SOLQService.getPersistedBaseUrl();
      await SOLQService(baseUrl: baseUrl).confirmPayment(intentId, signature);
      
      // Force sync after backend updates its state
      await syncStatus();

    } catch (e) {
      print("[ORCHESTRATOR] Confirm Failure: $e");
      _currentIntent = _currentIntent!.copyWith(state: PaymentState.FAILED);
      _intentController.add(_currentIntent!);
    }
  }

  void reset() {
    _currentIntent = null;
  }

  final _coingecko = CoinGeckoService();
  final _jupiter = JupiterService();

  // STEP 1: CREATE INTENT (FROM QRIS)
  Future<void> createIntent(String qrisPayload) async {
    try {
      print("[ORCHESTRATOR] Creating intent from QRIS...");
      
      // 1. Fetch Real-Time IDR Rate (Elon/Altman Rule)
      final marketPrices = await _coingecko.getPrices();
      if (marketPrices == null) {
        throw Exception("Gagal mengambil harga pasar (Circuit Breaker)");
      }

      // 2. Call Backend to parse and register intent
      final baseUrl = await SOLQService.getPersistedBaseUrl();
      final solq = SOLQService(baseUrl: baseUrl);
      final response = await solq.createPaymentIntent(qrisPayload);
      
      _currentIntent = PaymentIntent.fromJson(response);
      
      // 3. Enrich with Real-Time Quote from Jupiter
      if (_currentIntent!.amountIdr != "0") {
        final quote = await _jupiter.getQuote(_currentIntent!.amountIdr);
        if (quote != null) {
          _currentIntent = _currentIntent!.copyWith(
            quotedRate: quote.price,
            estimatedCryptoAmount: quote.outAmount,
            platformFee: quote.platformFeeIdr,
            networkFee: quote.networkFeeSol,
            slippage: quote.slippagePct * 100,
            maxFee: quote.maxTotalFeeIdr + double.parse(_currentIntent!.amountIdr),
            effectiveFeePercent: quote.effectiveFeePercent,
            userSavingsVsQris: quote.userSavingsVsQris,
          );
        }
      }

      _intentController.add(_currentIntent!);
      print("[ORCHESTRATOR] Intent Created & Quoted: ${_currentIntent!.intentId}");

    } catch (e) {
      print("[ORCHESTRATOR] Create Intent Failed: $e");
      _intentController.addError("Gagal memproses pembayaran. Detail: $e");
    }
  }

  // STEP 1.5: SET MANUAL AMOUNT (IF STATIC QRIS)
  Future<void> setAmount(String intentId, String amountIdr) async {
    if (_currentIntent == null || _currentIntent!.qrisPayload == null) {
      print("[ORCHESTRATOR] Cannot set amount: Missing Intent or QRIS Payload");
      return;
    }

    try {
      // Basic validation
      int amount = int.parse(amountIdr);
      
      // 1. Fetch Real-Time IDR Rate for verification
      await _coingecko.getPrices();

      // 2. Update intent on backend
      final baseUrl = await SOLQService.getPersistedBaseUrl();
      final response = await SOLQService(baseUrl: baseUrl).createPaymentIntent(_currentIntent!.qrisPayload!, amount: amount);
      
      _currentIntent = PaymentIntent.fromJson(response);
      
      // 3. Enrich with Real-Time Quote (Elon Musk Standard)
      final quote = await _jupiter.getQuote(amountIdr);
      if (quote != null) {
        _currentIntent = _currentIntent!.copyWith(
          quotedRate: quote.price,
          estimatedCryptoAmount: quote.outAmount,
          platformFee: quote.platformFeeIdr,
          networkFee: quote.networkFeeSol,
          slippage: quote.slippagePct * 100,
          maxFee: quote.maxTotalFeeIdr + double.parse(amountIdr),
          effectiveFeePercent: quote.effectiveFeePercent,
          userSavingsVsQris: quote.userSavingsVsQris,
        );
      }

      _intentController.add(_currentIntent!);
      
    } catch (e) {
       print("[ORCHESTRATOR] Set Amount Failed: $e");
       _intentController.addError("Gagal menetapkan nominal: $e");
    }
  }

  // STEP 2: REQUEST AUTHORIZATION (LAUNCH WALLET)
  Future<void> requestAuthorization(String intentId) async {
    if (_currentIntent == null) return;
    
    // Update state locally first for UI responsiveness
    _currentIntent = _currentIntent!.copyWith(state: PaymentState.AUTHORIZATION_REQUESTED);
    _intentController.add(_currentIntent!);

    try {
      final id = _currentIntent!.intentId;
      
      // AB TEST: Support direct signing bridge for non-SolanaPay wallets
      // If the wallet type is known to be "strict" or if we want to be more proactive
      final solana = SolanaService();
      
      if (solana.isConnected) {
        print("[ORCHESTRATOR] Wallet connected. Attempting DIRECT TRANSACTION BRIDGE...");
        try {
          // 1. Get transaction via backend POST
          final baseUrl = await SOLQService.getPersistedBaseUrl();
          final txData = await SOLQService(baseUrl: baseUrl).getSolanaPayTransaction(id, solana.connectedAddress!);
          final txBase64 = txData['transaction'];
          
          if (txBase64 != null) {
            print("[ORCHESTRATOR] Transaction fetched. Launching direct sign...");
            await solana.signSwapTransaction(txBase64);
            return;
          }
        } catch (e) {
             print("[ORCHESTRATOR] Direct bridge fetch failed, falling back to Solana Pay Scheme: $e");
        }
      }

      // FALLBACK: Standard Solana Pay Protocol
      final baseUrl = SOLQService().baseUrl;
      final host = baseUrl.replaceAll('http://', '').replaceAll('/v1', '');
      final solanaPayUrl = "solana:http://$host/solana-pay/$id";
      
      print("[ORCHESTRATOR] Launching Solana Pay Scheme: $solanaPayUrl");
      
      final uri = Uri.parse(solanaPayUrl);
      
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      } else {
        // Last Effort: Direct SOL transfer (Manual Bridge)
        print("[ORCHESTRATOR] Wallet app not found for scheme. Attempting universal solana: URI...");
        final universalUri = Uri.parse("solana:$id"); // Some wallets handle this
        await launchUrl(universalUri, mode: LaunchMode.externalApplication);
      }

    } catch (e) {
      print("[ORCHESTRATOR] Auth Request Error: $e");
      // Revert state if launch fails
      _currentIntent = _currentIntent!.copyWith(state: PaymentState.FAILED);
      _intentController.add(_currentIntent!);
    }
  }

  // LISTEN FOR WEBHOOK UPDATES (Called by WebhookService)
  Future<void> handleAsyncWebhook(String intentId, String status, String refId) async {
    if (_currentIntent == null || _currentIntent!.intentId != intentId) {
      print("[ORCHESTRATOR] Webhook ignored: Intent mismatch or null");
      return;
    }

    print("[ORCHESTRATOR] Handling Async Webhook: $status | Ref: $refId");

    final normalizedStatus = status.toUpperCase();
    if (normalizedStatus == 'COMPLETED' || normalizedStatus == 'SUCCESS') {
       _currentIntent = _currentIntent!.copyWith(
         state: PaymentState.COMPLETED,
         settlementReference: refId
       );
       _intentController.add(_currentIntent!);
       // Optionally sync full details
       try {
        final updatedData = await SOLQService().getPaymentIntentStatus(intentId);
        _currentIntent = PaymentIntent.fromJson(updatedData);
        _intentController.add(_currentIntent!);
       } catch(e) {
         print("[ORCHESTRATOR] Failed to sync full details after webhook: $e");
       }
    } else if (status == 'FAILED') {
       _currentIntent = _currentIntent!.copyWith(state: PaymentState.FAILED);
       _intentController.add(_currentIntent!);
    }
  }

  // LISTEN FOR COMPLETION (WEBHOOK/POLLING)
  // Sam Altman Standard: No "assume success". 
  // Poll backend which polls Mainnet RPC.
  void onPaymentStatusUpdate(Map<String, dynamic> data) {
    if (_currentIntent == null) return;
    
    final status = data['status'];
    final txHash = data['tx_hash'];
    final intentId = data['intentId'];
    
    if (intentId != _currentIntent!.intentId) return;

    print("[ORCHESTRATOR] On-Chain Status Update: $status | TX: $txHash");

    if (status == 'completed' || status == 'COMPLETED') {
       _currentIntent = _currentIntent!.copyWith(
         state: PaymentState.COMPLETED,
         settlementReference: txHash
       );
       _intentController.add(_currentIntent!);
    } else if (status == 'failed' || status == 'FAILED') {
       _currentIntent = _currentIntent!.copyWith(state: PaymentState.FAILED);
       _intentController.add(_currentIntent!);
    }
  }

  // RECOVERY: Manual Sync with Backend
  Future<void> syncStatus() async {
    if (_currentIntent == null) return;
    try {
      final baseUrl = await SOLQService.getPersistedBaseUrl();
      final updatedData = await SOLQService(baseUrl: baseUrl).getPaymentIntentStatus(_currentIntent!.intentId);
      final newIntent = PaymentIntent.fromJson(updatedData);
      
      if (newIntent.state != _currentIntent!.state) {
        _currentIntent = newIntent;
        _intentController.add(_currentIntent!);
        print("[ORCHESTRATOR] Sync Success: New State = ${newIntent.state}");
      }
    } catch (e) {
      print("[ORCHESTRATOR] Sync Failed: $e");
    }
  }
}
