import 'dart:async';
import 'dart:io';
import 'package:url_launcher/url_launcher.dart';
import '../models/payment_intent.dart';
import 'solq_service.dart';
import 'solana_service.dart';
import 'coingecko_service.dart';
import 'jupiter_service.dart';
import 'payment_history_service.dart';
import 'qris_parser.dart';

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
          if (SolanaService().isLikelySignature(signature)) {
            confirmOnChain(intentId, signature);
          } else if (_currentIntent != null &&
              _currentIntent!.intentId == intentId) {
            // Wallet callback can arrive before exposing signature payload.
            _currentIntent =
                _currentIntent!.copyWith(state: PaymentState.awaitingSettlement);
            _intentController.add(_currentIntent!);
            unawaited(syncStatus());
          }
        }
      } else if (event != "CONNECTED" &&
          event != "DISCONNECTED" &&
          event != "DISCONNECT" &&
          event != "WAITING_BROWSER") {
        // Handle raw signature only when it matches Solana signature format.
        if (_currentIntent != null &&
            SolanaService().isLikelySignature(event)) {
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
      _currentIntent =
          _currentIntent!.copyWith(state: PaymentState.awaitingSettlement);
      _intentController.add(_currentIntent!);

      // Phase 4 Truth: Poll Solana RPC for finalization
      final isFinalized = await SolanaService().waitForSignature(signature);

      if (!isFinalized) {
        _currentIntent = _currentIntent!.copyWith(state: PaymentState.failed);
        _intentController.add(_currentIntent!);
        return;
      }

      // Try backend confirm (optional — mark completed from on-chain proof if backend down)
      try {
        final baseUrl = await SOLQService.getWorkingBaseUrl()
            .timeout(const Duration(seconds: 4));
        final result = await SOLQService(baseUrl: baseUrl)
            .confirmPaymentAndGetResult(
              intentId,
              signature,
              payerAccount: SolanaService().connectedAddress,
              context: {
                'amount_idr': _currentIntent!.amountIdr,
                'merchant_name': _currentIntent!.merchantName,
                'merchant_id': _currentIntent!.nmid,
                'merchant_account': _currentIntent!.merchantAccount,
                'bank_code': _currentIntent!.bankCode,
                'currency_source': _currentIntent!.currency,
              },
            )
            .timeout(const Duration(seconds: 8));

        final status = result['status']?.toString().toUpperCase() ?? '';
        if (status == 'COMPLETED') {
          final settledPayer = result['payer_account']?.toString();
          await SolanaService().syncConnectedAddressFromOnChain(settledPayer);
          _currentIntent = _currentIntent!.copyWith(
            state: PaymentState.completed,
            settlementReference:
                result['txHash'] ?? result['settlement_ref'] ?? signature,
          );
          _intentController.add(_currentIntent!);
          // Save to payment history
          await PaymentHistoryService().addPaymentToHistory(_currentIntent!);
          return;
        } else if (status == 'FAILED') {
          _currentIntent = _currentIntent!.copyWith(state: PaymentState.failed);
          _intentController.add(_currentIntent!);
          return;
        }
      } catch (_) {
        // Backend offline or settlement still pending.
        // Never mark this as completed without an explicit settlement confirmation.
      }

      // On-chain finalized only means authorization succeeded.
      // Settlement must still be confirmed explicitly by backend/webhook.
      _currentIntent = _currentIntent!.copyWith(
        state: PaymentState.awaitingSettlement,
        settlementReference: signature,
      );
      _intentController.add(_currentIntent!);
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
        throw Exception("Gagal sinkronisasi harga pasar. Periksa koneksi internet Anda.");
      }

      // 2. Call Backend to parse and register intent (auto-discover: local → cloud)
      final baseUrl = await SOLQService.getWorkingBaseUrl();
      final solq = SOLQService(baseUrl: baseUrl);
      final response = await solq.createPaymentIntent(qrisPayload);

      _currentIntent = PaymentIntent.fromJson(response);
      final localParsed = QrisParser.parse(qrisPayload);
      if (localParsed.isValid) {
        final currentName = _currentIntent!.merchantName.trim();
        final isGenericName =
            currentName.isEmpty ||
            currentName.toUpperCase() == 'SME MERCHANT' ||
            currentName.toUpperCase() == 'UNKNOWN MERCHANT';

        _currentIntent = _currentIntent!.copyWith(
          merchantName: isGenericName ? localParsed.merchantName : null,
          merchantAccount:
              _currentIntent!.merchantAccount ?? localParsed.merchantAccount,
          nmid: _currentIntent!.nmid ?? localParsed.merchantId,
        );
      }

      // 3. Enrich with Real-Time Quote from Jupiter
      if (_currentIntent!.amountIdr != "0" &&
          _currentIntent!.amountIdr != "0.0") {
        final quote = await _jupiter.getQuote(_currentIntent!.amountIdr);
        if (quote != null) {
          // ORACLE CHECK: Verify Jupiter price vs Market
          final isValid =
              _coingecko.verifyRate(quote.price, marketPrices['SOL']!);
          if (!isValid) {
            throw Exception(
                "Keamanan: Terdeteksi deviasi harga yang mencurigakan (> 2.5%). Transaksi dibatalkan untuk perlindungan dana.");
          }

          _currentIntent = _currentIntent!.copyWith(
            quotedRate: quote.price,
            estimatedCryptoAmount: quote.outAmount,
            platformFee: quote.platformFeeIdr,
            networkFee: quote.networkFeeSol,
            slippage: quote.slippagePct * 100,
            maxFee:
                quote.maxTotalFeeIdr + double.parse(_currentIntent!.amountIdr),
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
      if (e is TimeoutException ||
          e.toString().contains('TimeoutException') ||
          e.toString().contains('Future not completed')) {
        errorMsg =
            'Server Cloud tidak merespons. Gunakan endpoint HTTPS yang valid (contoh: https://solq.vercel.app/api/v1).';
      } else if (e is SocketException ||
          e.toString().contains('SocketException') ||
          e.toString().contains('No route to host') ||
          e.toString().contains('Connection refused')) {
        errorMsg =
            'Koneksi Gagal: Tidak dapat menjangkau server cloud. Periksa jaringan internet Anda.';
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
      final response = await SOLQService(baseUrl: baseUrl)
          .createPaymentIntent(_currentIntent!.qrisPayload!, amount: amount);

      _currentIntent = PaymentIntent.fromJson(response);

      // Enrich with Real-Time Quote
      final quote = await _jupiter.getQuote(amountIdr);
      if (quote != null) {
        final marketPrices = await _coingecko.getPrices();
        if (marketPrices != null && marketPrices['SOL'] != null) {
          final isValid =
              _coingecko.verifyRate(quote.price, marketPrices['SOL']!);
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
      if (e is TimeoutException ||
          e.toString().contains('TimeoutException') ||
          e.toString().contains('Future not completed')) {
        errorMsg =
            'SERVER TIMEOUT: Backend cloud tidak merespons. Coba lagi beberapa saat.';
      } else if (e is SocketException ||
          e.toString().contains('SocketException') ||
          e.toString().contains('Connection refused')) {
        errorMsg = 'KONEKSI GAGAL: Tidak dapat terhubung ke backend cloud.';
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
    _currentIntent =
        _currentIntent!.copyWith(state: PaymentState.authorizationRequested);
    _intentController.add(_currentIntent!);

    try {
      final id = _currentIntent!.intentId;
      final solana = SolanaService();

      // Try DIRECT TRANSACTION if wallet is connected
      if (solana.isConnected) {
        try {
          final baseUrl = await SOLQService.getWorkingBaseUrl();
          final txData =
              await SOLQService(baseUrl: baseUrl).getSolanaPayTransaction(
            id,
            solana.connectedAddress!,
            metadata: {
              'amount_idr': _currentIntent!.amountIdr,
              'merchant_name': _currentIntent!.merchantName,
              'merchant_account': _currentIntent!.merchantAccount,
              'bank_code': _currentIntent!.bankCode,
              'currency_source': _currentIntent!.currency,
            },
          );
          final txBase64 = txData['transaction'];

          if (txBase64 is String && txBase64.trim().isNotEmpty) {
            await solana.signSwapTransaction(txBase64.trim());
            return;
          }

          // Continue to URL fallback if provider endpoint only returns metadata.
          throw Exception('Transaction payload unavailable');
        } catch (_) {
          // Fallback to Solana Pay
        }
      }

      // FALLBACK: Solana Pay Protocol
      final baseUrl = await SOLQService.getWorkingBaseUrl();
      var hostRoot = baseUrl;
      if (hostRoot.endsWith('/api/v1')) {
        hostRoot = hostRoot.substring(0, hostRoot.length - '/api/v1'.length);
      } else if (hostRoot.endsWith('/v1')) {
        hostRoot = hostRoot.substring(0, hostRoot.length - '/v1'.length);
      }
      final paymentRequestUrl = Uri.parse("$hostRoot/solana-pay/$id");

      final launched = await launchUrl(
        paymentRequestUrl,
        mode: LaunchMode.externalApplication,
      );

      if (!launched) {
        throw Exception('Tidak bisa membuka wallet URL');
      }
    } catch (e) {
      _currentIntent = _currentIntent!.copyWith(state: PaymentState.failed);
      _intentController.add(_currentIntent!);
    }
  }

  // LISTEN FOR WEBHOOK UPDATES (Called by WebhookService)
  Future<void> handleAsyncWebhook(
      String intentId, String status, String refId) async {
    if (_currentIntent == null || _currentIntent!.intentId != intentId) return;

    final normalizedStatus = status.toUpperCase();
    if (normalizedStatus == 'COMPLETED' || normalizedStatus == 'SUCCESS') {
      _currentIntent = _currentIntent!
          .copyWith(state: PaymentState.completed, settlementReference: refId);
      _intentController.add(_currentIntent!);
      // Save to payment history
      await PaymentHistoryService().addPaymentToHistory(_currentIntent!);

      // Sync full details
      try {
        final baseUrl = await SOLQService.getWorkingBaseUrl();
        final updatedData = await SOLQService(baseUrl: baseUrl)
            .getPaymentIntentStatusWithContext(
          intentId,
          amountIdr: _currentIntent!.amountIdr,
          merchantName: _currentIntent!.merchantName,
          merchantId: _currentIntent!.nmid,
          merchantAccount: _currentIntent!.merchantAccount,
          bankCode: _currentIntent!.bankCode,
          payerAccount: SolanaService().connectedAddress,
          currencySource: _currentIntent!.currency,
        );

        final source = updatedData['status_source']?.toString();
        final isStatelessFallback = source == 'stateless_fallback' ||
            source == 'stateless_context_fallback';
        if (!isStatelessFallback) {
          _currentIntent = PaymentIntent.fromJson(updatedData);
          _intentController.add(_currentIntent!);
        }
      } catch (_) {}
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
      _currentIntent = _currentIntent!
          .copyWith(state: PaymentState.completed, settlementReference: txHash);
      _intentController.add(_currentIntent!);
      // Save to payment history
      PaymentHistoryService().addPaymentToHistory(_currentIntent!);
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
      final updatedData = await SOLQService(baseUrl: baseUrl)
          .getPaymentIntentStatusWithContext(
        _currentIntent!.intentId,
        amountIdr: _currentIntent!.amountIdr,
        merchantName: _currentIntent!.merchantName,
        merchantId: _currentIntent!.nmid,
        merchantAccount: _currentIntent!.merchantAccount,
        bankCode: _currentIntent!.bankCode,
        payerAccount: SolanaService().connectedAddress,
        currencySource: _currentIntent!.currency,
      );

      final source = updatedData['status_source']?.toString();
      final isStatelessFallback = source == 'stateless_fallback' ||
          source == 'stateless_context_fallback';

      if (isStatelessFallback) {
        // Keep trusted in-app state if backend is still in stateless fallback.
        return;
      }

      final newIntent = PaymentIntent.fromJson(updatedData);

      if (newIntent.state != _currentIntent!.state) {
        _currentIntent = newIntent;
        _intentController.add(_currentIntent!);
      }
    } catch (_) {}
  }
}
