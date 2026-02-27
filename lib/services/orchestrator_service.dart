import 'dart:async';
import 'package:url_launcher/url_launcher.dart'; // REQUIRED IMPORT
import '../models/payment_intent.dart';
import 'solq_service.dart';
import 'solana_service.dart';
import 'coingecko_service.dart';
import 'jupiter_service.dart';

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
          confirmOnChain(intentId, signature);
        }
      } else if (event != "CONNECTED" && event != "DISCONNECTED" && event != "DISCONNECT") {
        // Handle raw signature (from solq://onSign?signature=...)
        if (_currentIntent != null && event.length > 30) {
           confirmOnChain(_currentIntent!.intentId, event);
        }
      }
    });
  }

  Future<void> confirmOnChain(String intentId, String signature) async {
    try {
      
      
      // Update UI to show we are verifying on Mainnet
      _currentIntent = _currentIntent!.copyWith(state: PaymentState.awaitingSettlement);
      _intentController.add(_currentIntent!);

      // Phase 4 Truth: Poll Solana RPC
      final isFinalized = await SolanaService().waitForSignature(signature);
      
      if (!isFinalized) {
        _currentIntent = _currentIntent!.copyWith(state: PaymentState.failed);
        _intentController.add(_currentIntent!);
        return;
      }

      
      final baseUrl = await SOLQService.getPersistedBaseUrl();
      await SOLQService(baseUrl: baseUrl).confirmPayment(intentId, signature);
      
      // Force sync after backend updates its state
      await syncStatus();

    } catch (e) {
      _currentIntent = _currentIntent!.copyWith(state: PaymentState.failed);
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
          // ORACLE CHECK: Sam Altman verification logic
          final isValid = _coingecko.verifyRate(quote.price, marketPrices['SOL']!);
          if (!isValid) {
            throw Exception("SECURITY BLOCK: Terindikasi manipulasi harga oracle. Transaksi dibatalkan.");
          }

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

    } catch (e) {
      _intentController.addError("Gagal memproses pembayaran. Detail: $e");
    }
  }

  // STEP 1.5: SET MANUAL AMOUNT (IF STATIC QRIS)
  Future<void> setAmount(String intentId, String amountIdr) async {
    if (_currentIntent == null || _currentIntent!.qrisPayload == null) {
      // Cannot set amount
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
        // ORACLE CHECK: Sam Altman verification logic
        final isValid = _coingecko.verifyRate(quote.price, (await _coingecko.getPrices())!['SOL']!);
        if (!isValid) {
           throw Exception("SECURITY BLOCK: Terindikasi manipulasi harga oracle. Transaksi dibatalkan.");
        }

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
       _intentController.addError("Gagal menetapkan nominal: $e");
    }
  }

  // STEP 2: REQUEST AUTHORIZATION (LAUNCH WALLET)
  Future<void> requestAuthorization(String intentId) async {
    if (_currentIntent == null) return;
    
    // Update state locally first for UI responsiveness
    _currentIntent = _currentIntent!.copyWith(state: PaymentState.authorizationRequested);
    _intentController.add(_currentIntent!);

    try {
      final id = _currentIntent!.intentId;
      final solana = SolanaService();
      
      // BOSS RULE: No simulations. Try DIRECT TRANSACTION BRIDGE first if wallet is connected.
      // This is more reliable than Solana Pay for most wallets as it gives us a direct hash.
      if (solana.isConnected) {
        try {
          // 1. Get transaction via backend POST (Real Mainnet Transaction)
          final baseUrl = await SOLQService.getPersistedBaseUrl();
          final txData = await SOLQService(baseUrl: baseUrl).getSolanaPayTransaction(id, solana.connectedAddress!);
          final txBase64 = txData['transaction'];
          
          if (txBase64 != null) {
            await solana.signSwapTransaction(txBase64);
            return;
          }
        } catch (e) {
             // Fallback
        }
      }

      // FALLBACK: Standard Solana Pay Protocol (Universal)
      // This works by having the wallet app fetch the transaction from our backend.
      final baseUrl = await SOLQService.getPersistedBaseUrl();
      final host = baseUrl.replaceAll('http://', '').replaceAll('/v1', '');
      
      // Solana Pay URI format: solana:https://<host>/solana-pay/<id>
      // We use https if possible, or http for local/dev debugging (though BOSS wants REAL).
      final scheme = baseUrl.startsWith('https') ? 'https' : 'http';
      final solanaPayUrl = "solana:$scheme://$host/solana-pay/$id";
      
      final uri = Uri.parse(solanaPayUrl);
      
      // Launch and hope the OS picks it up
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      } else {
        // Last Effort: Direct link to well-known wallets
        final universalUri = Uri.parse("solana:connect?redirect=$solanaPayUrl"); 
        await launchUrl(universalUri, mode: LaunchMode.externalApplication);
      }

    } catch (e) {
      // Auth Request Error
      _currentIntent = _currentIntent!.copyWith(state: PaymentState.failed);
      _intentController.add(_currentIntent!);
    }
  }

  // LISTEN FOR WEBHOOK UPDATES (Called by WebhookService)
  Future<void> handleAsyncWebhook(String intentId, String status, String refId) async {
    if (_currentIntent == null || _currentIntent!.intentId != intentId) {
      return;
    }

    final normalizedStatus = status.toUpperCase();
    if (normalizedStatus == 'COMPLETED' || normalizedStatus == 'SUCCESS') {
       _currentIntent = _currentIntent!.copyWith(
         state: PaymentState.completed,
         settlementReference: refId
       );
       _intentController.add(_currentIntent!);
       // Optionally sync full details
       try {
        final updatedData = await SOLQService().getPaymentIntentStatus(intentId);
        _currentIntent = PaymentIntent.fromJson(updatedData);
        _intentController.add(_currentIntent!);
       } catch(e) {
         // Sync failed
       }
    } else if (status == 'FAILED') {
       _currentIntent = _currentIntent!.copyWith(state: PaymentState.failed);
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

    if (status == 'completed' || status == 'COMPLETED') {
       _currentIntent = _currentIntent!.copyWith(
         state: PaymentState.completed,
         settlementReference: txHash
       );
       _intentController.add(_currentIntent!);
    } else if (status == 'failed' || status == 'FAILED') {
       _currentIntent = _currentIntent!.copyWith(state: PaymentState.failed);
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
      }
    } catch (e) {
      // Log failure silently or via proper logger in real prod, but BOSS wants NO PRINT
    }
  }
}
