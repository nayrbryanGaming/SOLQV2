import 'dart:async';
import 'dart:io';
import 'package:url_launcher/url_launcher.dart';
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

  bool _isInitialized = false;
  final _coingecko = CoinGeckoService();
  final _jupiter = JupiterService();

  // Persistence & Init
  Future<void> init() async {
    if (_isInitialized) return;

    // Warm up price oracle
    try {
      await _coingecko.init();
    } catch (_) {}

    // Listen for wallet signatures
    SolanaService().signatureStream.listen((event) {
      if (event.startsWith("SIGNED:")) {
        final parts = event.split(":");
        if (parts.length >= 3) {
          final intentId = parts[1];
          final signature = parts[2];
          confirmOnChain(intentId, signature);
        }
      } else if (event != "CONNECTED" && event != "DISCONNECTED" && event != "DISCONNECT" && event != "WAITING_BROWSER") {
        // Handle raw signature
        if (_currentIntent != null && event.length > 30) {
           confirmOnChain(_currentIntent!.intentId, event);
        }
      }
    });

    _isInitialized = true;
  }

  Future<void> confirmOnChain(String intentId, String signature) async {
    if (_currentIntent == null) return;

    try {
      // Update UI to verification state
      _currentIntent = _currentIntent!.copyWith(state: PaymentState.awaitingSettlement);
      _intentController.add(_currentIntent!);

      // Phase 4 Truth: Poll Solana RPC for finalization
      final isFinalized = await SolanaService().waitForSignature(signature);
      
      if (!isFinalized) {
        _currentIntent = _currentIntent!.copyWith(state: PaymentState.failed);
        _intentController.add(_currentIntent!);
        return;
      }

      // Confirm with backend — backend verifies on-chain & settles
      final baseUrl = await SOLQService.getWorkingBaseUrl();
      final result = await SOLQService(baseUrl: baseUrl).confirmPaymentAndGetResult(intentId, signature);

      // Parse backend response directly
      final status = result['status']?.toString().toUpperCase() ?? '';
      if (status == 'COMPLETED') {
        _currentIntent = _currentIntent!.copyWith(
          state: PaymentState.completed,
          settlementReference: result['txHash'] ?? result['settlement_ref'] ?? signature,
        );
        _intentController.add(_currentIntent!);
      } else if (status == 'FAILED') {
        _currentIntent = _currentIntent!.copyWith(state: PaymentState.failed);
        _intentController.add(_currentIntent!);
      } else {
        // Fallback: sync status from backend
        await syncStatus();
      }

    } catch (e) {
      _currentIntent = _currentIntent!.copyWith(state: PaymentState.failed);
      _intentController.add(_currentIntent!);
    }
  }

  void reset() {
    _currentIntent = null;
  }

  // STEP 1: CREATE INTENT (FROM QRIS)
  Future<void> createIntent(String qrisPayload) async {
    try {
      // 1. Fetch Real-Time IDR Rate
      final marketPrices = await _coingecko.getPrices();
      if (marketPrices == null || marketPrices['SOL'] == null) {
        throw Exception("ORACLE FAILURE: Gagal mengambil harga pasar.");
      }

      // 2. Call Backend to parse and register intent (auto-discover: local → cloud)
      final baseUrl = await SOLQService.getWorkingBaseUrl();
      final solq = SOLQService(baseUrl: baseUrl);
      final response = await solq.createPaymentIntent(qrisPayload);
      
      _currentIntent = PaymentIntent.fromJson(response);
      
      // 3. Enrich with Real-Time Quote from Jupiter
      if (_currentIntent!.amountIdr != "0" && _currentIntent!.amountIdr != "0.0") {
        final quote = await _jupiter.getQuote(_currentIntent!.amountIdr);
        if (quote != null) {
          // ORACLE CHECK: Verify Jupiter price vs Market
          final isValid = _coingecko.verifyRate(quote.price, marketPrices['SOL']!);
          if (!isValid) {
            throw Exception("SECURITY: Terindikasi manipulasi harga (Deviation > 2.5%).");
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
        } else {
           throw Exception("JUPITER: Gagal mendapatkan rute swap optimal.");
        }
      } else {
        // STATIC QRIS - amount is 0, user must input manually
        _currentIntent = _currentIntent!.copyWith(
          state: PaymentState.pendingAmount,
          qrisPayload: qrisPayload,
        );
      }

      _intentController.add(_currentIntent!);

    } catch (e) {
      String errorMsg;
      if (e is TimeoutException || e.toString().contains('TimeoutException') || e.toString().contains('Future not completed')) {
        errorMsg = 'SERVER TIMEOUT: Backend tidak merespons. Pastikan backend berjalan dan terhubung ke WiFi yang sama. Ketuk ikon ⚙ untuk ubah IP server.';
      } else if (e is SocketException || e.toString().contains('SocketException') || e.toString().contains('No route to host') || e.toString().contains('Connection refused')) {
        errorMsg = 'KONEKSI GAGAL: Tidak dapat terhubung ke server. Pastikan backend berjalan. Ketuk ikon ⚙ untuk ubah IP server.';
      } else {
        errorMsg = 'Gagal memproses: $e';
      }
      _intentController.addError(errorMsg);
    }
  }

  // STEP 1.5: SET MANUAL AMOUNT (IF STATIC QRIS)
  Future<void> setAmount(String intentId, String amountIdr) async {
    if (_currentIntent == null || _currentIntent!.qrisPayload == null) return;

    try {
      int amount = int.parse(amountIdr);
      if (amount <= 0) throw Exception("Nominal harus lebih dari 0");

      // Update intent on backend (auto-discover: local → cloud)
      final baseUrl = await SOLQService.getWorkingBaseUrl();
      final response = await SOLQService(baseUrl: baseUrl).createPaymentIntent(_currentIntent!.qrisPayload!, amount: amount);
      
      _currentIntent = PaymentIntent.fromJson(response);
      
      // Enrich with Real-Time Quote
      final quote = await _jupiter.getQuote(amountIdr);
      if (quote != null) {
        final marketPrices = await _coingecko.getPrices();
        if (marketPrices != null && marketPrices['SOL'] != null) {
          final isValid = _coingecko.verifyRate(quote.price, marketPrices['SOL']!);
          if (!isValid) {
             throw Exception("SECURITY: Terindikasi manipulasi harga.");
          }
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
      String errorMsg;
      if (e is TimeoutException || e.toString().contains('TimeoutException') || e.toString().contains('Future not completed')) {
        errorMsg = 'SERVER TIMEOUT: Backend tidak merespons. Periksa koneksi WiFi dan IP server.';
      } else if (e is SocketException || e.toString().contains('SocketException') || e.toString().contains('Connection refused')) {
        errorMsg = 'KONEKSI GAGAL: Tidak dapat terhubung ke server.';
      } else {
        errorMsg = 'Gagal menetapkan nominal: $e';
      }
      _intentController.addError(errorMsg);
    }
  }

  // STEP 2: REQUEST AUTHORIZATION (LAUNCH WALLET)
  Future<void> requestAuthorization(String intentId) async {
    if (_currentIntent == null) return;
    
    // Update state for UI
    _currentIntent = _currentIntent!.copyWith(state: PaymentState.authorizationRequested);
    _intentController.add(_currentIntent!);

    try {
      final id = _currentIntent!.intentId;
      final solana = SolanaService();
      
      // Try DIRECT TRANSACTION if wallet is connected
      if (solana.isConnected) {
        try {
          final baseUrl = await SOLQService.getWorkingBaseUrl();
          final txData = await SOLQService(baseUrl: baseUrl).getSolanaPayTransaction(id, solana.connectedAddress!);
          final txBase64 = txData['transaction'];
          
          if (txBase64 != null) {
            await solana.signSwapTransaction(txBase64);
            return;
          }
        } catch (_) {
          // Fallback to Solana Pay
        }
      }

      // FALLBACK: Solana Pay Protocol
      final baseUrl = await SOLQService.getWorkingBaseUrl();
      final host = baseUrl.replaceAll('http://', '').replaceAll('https://', '').replaceAll('/v1', '');
      final scheme = baseUrl.startsWith('https') ? 'https' : 'http';
      final solanaPayUrl = "solana:$scheme://$host/solana-pay/$id";
      
      final uri = Uri.parse(solanaPayUrl);
      
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      } else {
        // Direct fallback to Phantom universal link
        final phantomUrl = Uri.parse("https://phantom.app/ul/v1/transaction?redirect=solq://onSign&payload=$solanaPayUrl");
        await launchUrl(phantomUrl, mode: LaunchMode.externalApplication);
      }

    } catch (e) {
      _currentIntent = _currentIntent!.copyWith(state: PaymentState.failed);
      _intentController.add(_currentIntent!);
    }
  }

  // LISTEN FOR WEBHOOK UPDATES (Called by WebhookService)
  Future<void> handleAsyncWebhook(String intentId, String status, String refId) async {
    if (_currentIntent == null || _currentIntent!.intentId != intentId) return;

    final normalizedStatus = status.toUpperCase();
    if (normalizedStatus == 'COMPLETED' || normalizedStatus == 'SUCCESS') {
       _currentIntent = _currentIntent!.copyWith(
         state: PaymentState.completed,
         settlementReference: refId
       );
       _intentController.add(_currentIntent!);

       // Sync full details
       try {
        final updatedData = await SOLQService().getPaymentIntentStatus(intentId);
        _currentIntent = PaymentIntent.fromJson(updatedData);
        _intentController.add(_currentIntent!);
       } catch(_) {}
    } else if (status == 'FAILED') {
       _currentIntent = _currentIntent!.copyWith(state: PaymentState.failed);
       _intentController.add(_currentIntent!);
    }
  }

  // LISTEN FOR COMPLETION (WEBHOOK/POLLING)
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
      final baseUrl = await SOLQService.getWorkingBaseUrl();
      final updatedData = await SOLQService(baseUrl: baseUrl).getPaymentIntentStatus(_currentIntent!.intentId);
      final newIntent = PaymentIntent.fromJson(updatedData);
      
      if (newIntent.state != _currentIntent!.state) {
        _currentIntent = newIntent;
        _intentController.add(_currentIntent!);
      }
    } catch (_) {}
  }
}
