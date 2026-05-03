import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config/app_config.dart';

class SOLQService {
  String baseUrl;

  // Persistence Key
  static const String _prefKey = 'solq_server_ip';
  static String get defaultBaseUrl => AppConfig.apiBaseUrl;
  static const String revenueWallet = 'ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m';

  // ── CLOUD BACKENDS (Priority: Vercel production first) ──
  static List<String> get _cloudFallbackUrls => AppConfig.apiBaseUrlFallbacks;

  // Timeouts — generous to handle slow mobile/wifi connections
  static const Duration _timeout = Duration(seconds: 18);
  static const Duration _cloudTimeout = Duration(seconds: 4);
  static const int _maxRetries = 2;
  // Keep scan flow snappy so camera does not look frozen while waiting API.
  static const Duration _scanIntentTimeout = Duration(seconds: 4);
  static const int _scanIntentRetries = 1;

  SOLQService({String? baseUrl}) : baseUrl = baseUrl ?? defaultBaseUrl;

  static bool _isLocalOrPrivateHost(String host) {
    final lower = host.toLowerCase();
    if (lower == 'localhost' || lower == '127.0.0.1' || lower == '0.0.0.0') {
      return true;
    }
    if (lower.startsWith('10.') || lower.startsWith('192.168.')) return true;

    final octets = lower.split('.');
    final secondOctet = octets.length > 1 ? int.tryParse(octets[1]) : null;
    final is172Private = octets.length >= 2 &&
        octets[0] == '172' &&
        secondOctet != null &&
        secondOctet >= 16 &&
        secondOctet <= 31;
    return is172Private;
  }

  static bool isLocalOrPrivateUrl(String candidateUrl) {
    final host = Uri.tryParse(candidateUrl)?.host ?? '';
    if (host.isEmpty) return true; // Treat empty/invalid as unsafe
    return _isLocalOrPrivateHost(host);
  }

  static String normalizeCloudBaseUrl(String rawInput) {
    final input = rawInput.trim();
    if (input.isEmpty) {
      throw const FormatException('URL backend tidak boleh kosong.');
    }

    var candidate = input;
    if (!candidate.startsWith('http://') && !candidate.startsWith('https://')) {
      candidate = 'https://$candidate';
    }

    final parsed = Uri.tryParse(candidate);
    if (parsed == null || parsed.host.isEmpty) {
      throw const FormatException('Format URL backend tidak valid.');
    }

    if (parsed.scheme.toLowerCase() != 'https') {
      throw const FormatException('Backend harus HTTPS. HTTP tidak diizinkan.');
    }

    if (_isLocalOrPrivateHost(parsed.host)) {
      throw const FormatException(
          'Localhost/IP private tidak diizinkan. Gunakan endpoint cloud.');
    }

    // Custom domain currently serves frontend-only and returns 404 for API paths.
    // Force known healthy API host until domain mapping is fixed in Vercel.
    if (parsed.host.toLowerCase() == 'solq.my.id') {
      return defaultBaseUrl;
    }

    var path = parsed.path;
    if (path.isEmpty || path == '/') {
      path = '/api/v1';
    } else if (path == '/api' || path == '/v1') {
      path = '/api/v1';
    }

    // Keep explicit /api/v1 or /v1 as-is, otherwise default to /api/v1 for
    // common custom domain inputs.
    if (!path.endsWith('/api/v1') && !path.endsWith('/v1')) {
      path = '/api/v1';
    }

    // Build clean URL without trailing ? from query removal
    final cleanUri = Uri(
      scheme: parsed.scheme,
      host: parsed.host,
      port: parsed.port,
      path: path,
    );
    return cleanUri.toString();
  }

  static bool _isCloudUrl(String value) {
    return value.contains('solq.my.id') ||
        value.contains('vercel.app') ||
        value.contains('railway.app') ||
        value.contains('onrender.com') ||
        value.contains('koyeb.app') ||
        value.contains('fly.dev') ||
        value.contains('glitch.me');
  }

  static Future<bool> _isReachableBaseUrl(String candidate,
      {Duration? timeout}) async {
    final checkTimeout = timeout ?? _cloudTimeout;
    final root = candidate.replaceAll('/v1', '');

    final healthCandidates = <Uri>[
      Uri.parse('$root/health'),
      Uri.parse('$root/api/health'),
      Uri.parse('$candidate/stats'),
      Uri.parse('$root/v1/stats'),
      Uri.parse('$root/api/v1/stats'),
    ];

    final probes = healthCandidates.map((url) async {
      try {
        final resp = await http.get(url).timeout(checkTimeout);
        return resp.statusCode == 200;
      } catch (_) {
        return false;
      }
    }).toList();

    final results = await Future.wait(probes);
    return results.any((ok) => ok);
  }

  static Future<String?> _findReachableCloudUrl() async {
    final checks = _cloudFallbackUrls.map((cloudUrl) async {
      final ok = await _isReachableBaseUrl(cloudUrl, timeout: _cloudTimeout);
      return ok ? cloudUrl : null;
    }).toList();

    final results = await Future.wait(checks);
    for (final value in results) {
      if (value != null) {
        return value;
      }
    }
    return null;
  }

  /// Auto-discover working backend: cloud only (localhost is explicitly disallowed)
  static Future<String> getWorkingBaseUrl() async {
    // 1. Try currently persisted URL if it's a valid healthy cloud URL
    final persisted = await getPersistedBaseUrl();
    
    // Safety check: Never allow localhost or private IPs in production
    if (isLocalOrPrivateUrl(persisted)) {
      await setPersistedBaseUrl(defaultBaseUrl);
      return defaultBaseUrl;
    }

    if (_isCloudUrl(persisted)) {
      try {
        if (await _isReachableBaseUrl(persisted, timeout: _cloudTimeout)) {
          return persisted;
        }
      } catch (_) {
        // Fall through to discovery
      }
    }

    // 2. Scan cloud fallbacks for the best available production node
    final reachableCloud = await _findReachableCloudUrl();
    if (reachableCloud != null) {
      await setPersistedBaseUrl(reachableCloud);
      return reachableCloud;
    }

    // 3. Absolute fallback: reset to production default to avoid "localhost not found"
    // We explicitly avoid any local network probes here.
    await setPersistedBaseUrl(defaultBaseUrl);
    return defaultBaseUrl;
  }

  /// Generic POST with retry + timeout
  Future<http.Response> _postWithRetry(
    Uri url,
    Map<String, dynamic> body, {
    Duration? customTimeout,
    int? maxRetries,
  }) async {
    Object? lastError;
    final timeout = customTimeout ?? _timeout;
    final retries = maxRetries ?? _maxRetries;

    for (int attempt = 0; attempt < retries; attempt++) {
      try {
        final response = await http
            .post(
              url,
              headers: {'Content-Type': 'application/json'},
              body: jsonEncode(body),
            )
            .timeout(timeout);
        return response;
      } on TimeoutException catch (e) {
        lastError = e;
        await Future.delayed(Duration(milliseconds: 500 * (attempt + 1)));
      } catch (e) {
        lastError = e;
        await Future.delayed(Duration(milliseconds: 500 * (attempt + 1)));
      }
    }
    throw TimeoutException(
      'Koneksi Gagal: Server cloud tidak merespons. Silakan periksa internet Anda. ($lastError)',
    );
  }

  /// Generic GET with retry + timeout
  Future<http.Response> _getWithRetry(Uri url,
      {Duration? customTimeout, int? maxRetries}) async {
    Object? lastError;
    final timeout = customTimeout ?? _timeout;
    final retries = maxRetries ?? _maxRetries;

    for (int attempt = 0; attempt < retries; attempt++) {
      try {
        final response = await http.get(url).timeout(timeout);
        return response;
      } on TimeoutException catch (e) {
        lastError = e;
        await Future.delayed(Duration(milliseconds: 500 * (attempt + 1)));
      } catch (e) {
        lastError = e;
        await Future.delayed(Duration(milliseconds: 500 * (attempt + 1)));
      }
    }
    throw TimeoutException(
      'Koneksi Gagal: Server cloud tidak merespons. Silakan periksa internet Anda. ($lastError)',
    );
  }

  static Future<String> getPersistedBaseUrl() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString(_prefKey);
    
    // Force migration if saved is localhost, private IP, or empty
    if (saved == null || saved.trim().isEmpty) {
      return defaultBaseUrl;
    }

    final host = Uri.tryParse(saved)?.host.toLowerCase() ?? '';
    final isUnsafe = host == 'localhost' || 
                     host == '127.0.0.1' || 
                     host.startsWith('192.168.') || 
                     host.startsWith('10.') ||
                     host.isEmpty;
    
    if (isUnsafe) {
      await prefs.setString(_prefKey, defaultBaseUrl);
      return defaultBaseUrl;
    }

    try {
      final normalized = normalizeCloudBaseUrl(saved);
      if (normalized != saved) {
        await prefs.setString(_prefKey, normalized);
      }
      return normalized;
    } catch (_) {
      await prefs.setString(_prefKey, defaultBaseUrl);
      return defaultBaseUrl;
    }
  }

  static Future<void> setPersistedBaseUrl(String url) async {
    // Production Guard: Prevent accidental switch to local dev nodes
    if (isLocalOrPrivateUrl(url)) {
      return; // Silently ignore unsafe URLs
    }
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefKey, url);
  }

  Future<Map<String, dynamic>> createPaymentIntent(String qrisPayload,
      {int? amount}) async {
    final body = <String, dynamic>{
      'qris_payload': qrisPayload,
      'currency': 'IDRX',
    };
    if (amount != null) {
      body['input_amount'] = amount.toString();
    }

    final root = baseUrl.replaceAll('/v1', '');
    final candidates = <Uri>[
      Uri.parse('$baseUrl/payment-intents'),
      Uri.parse('$root/api/payment-intents'),
      Uri.parse('$root/v1/payment-intents'),
    ];
    final attempted = <String>[];

    http.Response? lastResponse;
    for (final url in candidates) {
      attempted.add(url.toString());
      final response = await _postWithRetry(
        url,
        body,
        customTimeout: _scanIntentTimeout,
        maxRetries: _scanIntentRetries,
      );
      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      }
      // Continue probing only for route mismatch.
      if (response.statusCode != 404) {
        throw Exception('Gagal membuat payment intent: ${response.body}');
      }
      lastResponse = response;
    }

    throw Exception(
      'Gagal membuat payment intent (404). Coba endpoint: ${attempted.join(' | ')} '
      'Response: ${lastResponse?.body ?? 'endpoint not found'}',
    );
  }

  Future<Map<String, dynamic>> getPaymentIntentStatus(String id) async {
    final root = baseUrl.replaceAll('/v1', '');
    final candidates = <Uri>[
      Uri.parse('$baseUrl/payment-intents/$id'),
      Uri.parse('$baseUrl/$id'),
      Uri.parse('$root/api/payment-intents/$id'),
      Uri.parse('$root/v1/payment-intents/$id'),
    ];
    final attempted = <String>[];

    http.Response? lastResponse;
    for (final url in candidates) {
      attempted.add(url.toString());
      final response = await _getWithRetry(url);
      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      }
      if (response.statusCode != 404) {
        throw Exception('Gagal mengambil status pembayaran: ${response.body}');
      }
      lastResponse = response;
    }

    throw Exception(
      'Gagal mengambil status pembayaran (404). Coba endpoint: ${attempted.join(' | ')} '
      'Response: ${lastResponse?.body ?? 'endpoint not found'}',
    );
  }

  Future<Map<String, dynamic>> getPaymentIntentStatusWithContext(
    String id, {
    String? amountIdr,
    String? merchantName,
    String? merchantId,
    String? merchantAccount,
    String? bankCode,
    String? payerAccount,
    String? currencySource,
  }) async {
    final root = baseUrl.replaceAll('/v1', '');
    final query = <String, String>{};

    if (amountIdr != null && amountIdr.trim().isNotEmpty) {
      query['amount_idr'] = amountIdr.trim();
    }
    if (merchantName != null && merchantName.trim().isNotEmpty) {
      query['merchant_name'] = merchantName.trim();
    }
    if (merchantId != null && merchantId.trim().isNotEmpty) {
      query['merchant_id'] = merchantId.trim();
    }
    if (merchantAccount != null && merchantAccount.trim().isNotEmpty) {
      query['merchant_account'] = merchantAccount.trim();
    }
    if (bankCode != null && bankCode.trim().isNotEmpty) {
      query['bank_code'] = bankCode.trim();
    }
    if (payerAccount != null && payerAccount.trim().isNotEmpty) {
      query['payer_account'] = payerAccount.trim();
    }
    if (currencySource != null && currencySource.trim().isNotEmpty) {
      query['currency_source'] = currencySource.trim();
    }

    final candidates = <Uri>[
      Uri.parse('$baseUrl/payment-intents/$id').replace(queryParameters: query.isEmpty ? null : query),
      Uri.parse('$baseUrl/$id').replace(queryParameters: query.isEmpty ? null : query),
      Uri.parse('$root/api/payment-intents/$id').replace(queryParameters: query.isEmpty ? null : query),
      Uri.parse('$root/v1/payment-intents/$id').replace(queryParameters: query.isEmpty ? null : query),
    ];
    final attempted = <String>[];

    http.Response? lastResponse;
    for (final url in candidates) {
      attempted.add(url.toString());
      final response = await _getWithRetry(url);
      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      }
      if (response.statusCode != 404) {
        throw Exception('Gagal mengambil status pembayaran: ${response.body}');
      }
      lastResponse = response;
    }

    throw Exception(
      'Gagal mengambil status pembayaran (404). Coba endpoint: ${attempted.join(' | ')} '
      'Response: ${lastResponse?.body ?? 'endpoint not found'}',
    );
  }

  void _appendConfirmContext(
    Map<String, dynamic> body,
    Map<String, dynamic>? context,
  ) {
    if (context == null || context.isEmpty) return;

    final merchantName = context['merchant_name']?.toString().trim();
    if (merchantName != null && merchantName.isNotEmpty) {
      body['merchant_name'] = merchantName;
    }

    final merchantId = context['merchant_id']?.toString().trim();
    if (merchantId != null && merchantId.isNotEmpty) {
      body['merchant_id'] = merchantId;
      body['nmid'] = merchantId;
    }

    final merchantAccount = context['merchant_account']?.toString().trim();
    if (merchantAccount != null && merchantAccount.isNotEmpty) {
      body['merchant_account'] = merchantAccount;
    }

    final bankCode = context['bank_code']?.toString().trim();
    if (bankCode != null && bankCode.isNotEmpty) {
      body['bank_code'] = bankCode;
    }

    final currencySource = context['currency_source']?.toString().trim();
    if (currencySource != null && currencySource.isNotEmpty) {
      body['currency_source'] = currencySource;
    }

    final amountParsed =
        double.tryParse('${context['amount_idr'] ?? ''}') ??
            double.tryParse('${context['amountIdr'] ?? ''}');
    if (amountParsed != null && amountParsed >= 0) {
      body['amount_idr'] = amountParsed;
    }
  }

  Future<void> confirmPayment(String id, String txHash,
      {String? payerAccount, Map<String, dynamic>? context}) async {
    final body = <String, dynamic>{'tx_hash': txHash};
    if (payerAccount != null && payerAccount.trim().isNotEmpty) {
      body['payer_account'] = payerAccount.trim();
    }
    _appendConfirmContext(body, context);

    final root = baseUrl.replaceAll('/v1', '');
    final candidates = <Uri>[
      Uri.parse('$baseUrl/payment-intents/$id/confirm'),
      Uri.parse('$baseUrl/$id'),
      Uri.parse('$root/api/payment-intents/$id/confirm'),
      Uri.parse('$root/v1/payment-intents/$id/confirm'),
    ];
    final attempted = <String>[];

    http.Response? lastResponse;
    for (final url in candidates) {
      attempted.add(url.toString());
      final response = await _postWithRetry(url, body);
      if (response.statusCode == 200) {
        return;
      }
      if (response.statusCode != 404) {
        throw Exception('Gagal konfirmasi: ${response.body}');
      }
      lastResponse = response;
    }

    throw Exception(
      'Gagal konfirmasi (404). Coba endpoint: ${attempted.join(' | ')} '
      'Response: ${lastResponse?.body ?? 'endpoint not found'}',
    );
  }

  /// Same as confirmPayment but returns the parsed JSON response
  Future<Map<String, dynamic>> confirmPaymentAndGetResult(
      String id, String txHash,
      {String? payerAccount, Map<String, dynamic>? context}) async {
    final body = <String, dynamic>{'tx_hash': txHash};
    if (payerAccount != null && payerAccount.trim().isNotEmpty) {
      body['payer_account'] = payerAccount.trim();
    }
    _appendConfirmContext(body, context);

    final root = baseUrl.replaceAll('/v1', '');
    final candidates = <Uri>[
      Uri.parse('$baseUrl/payment-intents/$id/confirm'),
      Uri.parse('$baseUrl/$id'),
      Uri.parse('$root/api/payment-intents/$id/confirm'),
      Uri.parse('$root/v1/payment-intents/$id/confirm'),
    ];
    final attempted = <String>[];

    http.Response? lastResponse;
    for (final url in candidates) {
      attempted.add(url.toString());
      final response = await _postWithRetry(url, body);
      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      }
      if (response.statusCode != 404) {
        try {
          return jsonDecode(response.body);
        } catch (_) {
          throw Exception('Konfirmasi gagal: ${response.statusCode}');
        }
      }
      lastResponse = response;
    }

    throw Exception(
      'Konfirmasi gagal (404). Coba endpoint: ${attempted.join(' | ')} '
      'Status: ${lastResponse?.statusCode ?? 404}',
    );
  }

  Future<Map<String, dynamic>> getStats() async {
    final attempted = <String>{};
    try {
      String discoveredBase = baseUrl;
      try {
        discoveredBase =
            await getWorkingBaseUrl().timeout(const Duration(seconds: 4));
      } catch (_) {
        discoveredBase = baseUrl;
      }

      final baseCandidates = <String>{
        baseUrl,
        discoveredBase,
        defaultBaseUrl,
        ..._cloudFallbackUrls,
      };

      for (final candidateBase in baseCandidates) {
        String normalized;
        try {
          normalized = normalizeCloudBaseUrl(candidateBase);
        } catch (_) {
          continue;
        }

        final root = normalized.endsWith('/api/v1')
            ? normalized.substring(0, normalized.length - '/api/v1'.length)
            : normalized.replaceAll('/v1', '');

        final candidates = <Uri>[
          Uri.parse('$normalized/stats'),
          Uri.parse('$root/v1/stats'),
          Uri.parse('$root/api/v1/stats'),
        ];

        for (final url in candidates) {
          if (!attempted.add(url.toString())) {
            continue;
          }

          final response =
              await http.get(url).timeout(const Duration(seconds: 4));
          if (response.statusCode != 200) {
            continue;
          }

          final decoded = jsonDecode(response.body);
          if (decoded is Map<String, dynamic>) {
            return {
              ...decoded,
              'success_count': decoded['success_count'] ?? 0,
              'unique_wallet_users': decoded['unique_wallet_users'] ?? 0,
              'total_intents': decoded['total_intents'] ?? 0,
            };
          }
        }
      }
    } catch (_) {}

    return {
      'success_count': 0,
      'unique_wallet_users': 0,
      'total_intents': 0,
    };
  }

  Future<Map<String, dynamic>> getSolanaPayTransaction(
      String intentId, String account,
      {Map<String, dynamic>? metadata}) async {
    var hostRoot = baseUrl;
    if (hostRoot.endsWith('/api/v1')) {
      hostRoot = hostRoot.substring(0, hostRoot.length - '/api/v1'.length);
    } else if (hostRoot.endsWith('/v1')) {
      hostRoot = hostRoot.substring(0, hostRoot.length - '/v1'.length);
    }

    final legacyRoot = baseUrl.replaceAll('/v1', '');
    final candidateRoots = <String>{
      hostRoot,
      legacyRoot,
      '$hostRoot/api',
      ..._cloudFallbackUrls.map((url) {
        if (url.endsWith('/api/v1')) {
          return url.substring(0, url.length - '/api/v1'.length);
        }
        if (url.endsWith('/v1')) {
          return url.substring(0, url.length - '/v1'.length);
        }
        return url;
      }),
    };
    final candidates = candidateRoots
        .map((root) => Uri.parse('$root/solana-pay/$intentId'))
        .toList();
    final attempted = <String>[];
    final requestBody = <String, dynamic>{'account': account};
    if (metadata != null && metadata.isNotEmpty) {
      requestBody.addAll(metadata);
    }

    http.Response? lastResponse;
    Map<String, dynamic>? fallbackNoTxPayload;
    for (final url in candidates) {
      attempted.add(url.toString());
      final response = await _postWithRetry(url, requestBody);
      if (response.statusCode == 200) {
        final parsed = jsonDecode(response.body) as Map<String, dynamic>;
        final tx = parsed['transaction'];
        if (tx is String && tx.trim().isNotEmpty) {
          return parsed;
        }
        fallbackNoTxPayload = parsed;
        continue;
      }
      if (response.statusCode != 404) {
        throw Exception('Gagal mengambil transaksi: ${response.body}');
      }
      lastResponse = response;
    }

    if (fallbackNoTxPayload != null) {
      return fallbackNoTxPayload;
    }

    throw Exception(
      'Gagal mengambil transaksi (404). Coba endpoint: ${attempted.join(' | ')} '
      'Response: ${lastResponse?.body ?? 'endpoint not found'}',
    );
  }

  /// Quick reachability ping — returns true if backend is online
  Future<bool> ping() async {
    try {
      return await _isReachableBaseUrl(baseUrl,
          timeout: const Duration(seconds: 5));
    } catch (_) {
      return false;
    }
  }
}
