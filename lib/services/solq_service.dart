import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class SOLQService {
  String baseUrl;

  // Persistence Key
  static const String _prefKey = 'solq_server_ip';
  static const String defaultBaseUrl = 'http://192.168.18.15:3000/v1';

  // ── FREE CLOUD BACKENDS (24/7 Fallback) ──
  // Priority: Render → Fly.io → Koyeb → Glitch → Heroku
  // Update these URLs after deploying to each platform
  // NOTE: Railway sekarang bayar → pakai alternatives gratis berikut
  static const List<String> _cloudFallbackUrls = [
    'https://solq-backend.onrender.com/v1',       // Render (free tier, 24/7) ✅ RECOMMENDED
    'https://solq-backend.fly.dev/v1',            // Fly.io (free tier, 3 shared-cpu-1x 256MB)
    'https://solq-backend.koyeb.app/v1',          // Koyeb (free tier, 24/7)
    'https://solq-glitch.glitch.me/v1',           // Glitch (free, 24/7 dengan project activity)
    // Railway no longer recommended (paid tier required)
    // 'https://nayrbryanGaming.up.railway.app/v1',  // Railway (NOW PAID) ❌ SKIP
  ];

  // Timeouts — generous to handle slow mobile/wifi connections
  static const Duration _timeout = Duration(seconds: 30);
  static const Duration _cloudTimeout = Duration(seconds: 10);
  static const int _maxRetries = 3;

  SOLQService({String? baseUrl}) : baseUrl = baseUrl ?? defaultBaseUrl;

  /// Auto-discover working backend: local first, then cloud fallbacks
  static Future<String> getWorkingBaseUrl() async {
    final persisted = await getPersistedBaseUrl();

    // If user already set a cloud URL, use it directly
    if (persisted.contains('railway.app') ||
        persisted.contains('onrender.com') ||
        persisted.contains('koyeb.app') ||
        persisted.contains('fly.dev') ||
        persisted.contains('glitch.me')) {
      return persisted;
    }

    // Try local first (fast check 3s)
    try {
      final localUrl = Uri.parse(persisted.replaceAll('/v1', '') + '/health');
      final resp = await http.get(localUrl).timeout(const Duration(seconds: 3));
      if (resp.statusCode == 200) return persisted;
    } catch (_) {}

    // Try cloud fallbacks in order
    for (final cloudUrl in _cloudFallbackUrls) {
      try {
        final healthUrl = Uri.parse(cloudUrl.replaceAll('/v1', '') + '/health');
        final resp = await http.get(healthUrl).timeout(const Duration(seconds: 8));
        if (resp.statusCode == 200) {
          // Auto-save the working cloud URL for next time
          await setPersistedBaseUrl(cloudUrl);
          return cloudUrl;
        }
      } catch (_) {}
    }

    // Last resort: return persisted (will fail gracefully)
    return persisted;
  }

  /// Generic POST with retry + timeout
  Future<http.Response> _postWithRetry(Uri url, Map<String, dynamic> body) async {
    Object? lastError;
    for (int attempt = 0; attempt < _maxRetries; attempt++) {
      try {
        final response = await http.post(
          url,
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode(body),
        ).timeout(_timeout);
        return response;
      } on TimeoutException catch (e) {
        lastError = e;
        await Future.delayed(Duration(milliseconds: 500 * (attempt + 1)));
      } catch (e) {
        lastError = e;
        await Future.delayed(Duration(milliseconds: 500 * (attempt + 1)));
      }
    }
    throw TimeoutException('Server tidak merespons (${lastError.toString()}). Periksa koneksi WiFi dan pastikan backend berjalan di ${baseUrl}.');
  }

  /// Generic GET with retry + timeout
  Future<http.Response> _getWithRetry(Uri url, {Duration? customTimeout}) async {
    Object? lastError;
    final timeout = customTimeout ?? _timeout;
    for (int attempt = 0; attempt < _maxRetries; attempt++) {
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
    throw TimeoutException('Server tidak merespons (${lastError.toString()}). Periksa koneksi WiFi dan pastikan backend berjalan di ${baseUrl}.');
  }

  static Future<String> getPersistedBaseUrl() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_prefKey) ?? defaultBaseUrl;
  }

  static Future<void> setPersistedBaseUrl(String url) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefKey, url);
  }

  Future<Map<String, dynamic>> createPaymentIntent(String qrisPayload, {int? amount}) async {
    final url = Uri.parse('$baseUrl/payment-intents');
    final body = <String, dynamic>{
      'qris_payload': qrisPayload,
      'currency': 'IDRX',
    };
    if (amount != null) {
      body['input_amount'] = amount.toString();
    }
    final response = await _postWithRetry(url, body);
    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    } else {
      throw Exception('Gagal membuat payment intent: ${response.body}');
    }
  }

  Future<Map<String, dynamic>> getPaymentIntentStatus(String id) async {
    final url = Uri.parse('$baseUrl/payment-intents/$id');
    final response = await _getWithRetry(url);
    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    } else {
      throw Exception('Gagal mengambil status pembayaran');
    }
  }

  Future<void> confirmPayment(String id, String txHash) async {
    final url = Uri.parse('$baseUrl/payment-intents/$id/confirm');
    final response = await _postWithRetry(url, {'tx_hash': txHash});
    if (response.statusCode != 200) {
      throw Exception('Gagal konfirmasi: ${response.body}');
    }
  }

  /// Same as confirmPayment but returns the parsed JSON response
  Future<Map<String, dynamic>> confirmPaymentAndGetResult(String id, String txHash) async {
    final url = Uri.parse('$baseUrl/payment-intents/$id/confirm');
    final response = await _postWithRetry(url, {'tx_hash': txHash});
    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    } else {
      try {
        return jsonDecode(response.body);
      } catch (_) {
        throw Exception('Konfirmasi gagal: ${response.statusCode}');
      }
    }
  }

  Future<Map<String, dynamic>> getStats() async {
    try {
      final url = Uri.parse('$baseUrl/stats');
      final response = await http.get(url).timeout(const Duration(seconds: 5));
      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      }
    } catch (_) {}
    return {'success_count': 0};
  }

  Future<Map<String, dynamic>> getSolanaPayTransaction(String intentId, String account) async {
    final rootUrl = baseUrl.replaceAll('/v1', '');
    final url = Uri.parse('$rootUrl/solana-pay/$intentId');
    final response = await _postWithRetry(url, {'account': account});
    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    } else {
      throw Exception('Gagal mengambil transaksi: ${response.body}');
    }
  }

  /// Quick reachability ping — returns true if backend is online
  Future<bool> ping() async {
    try {
      final url = Uri.parse('$baseUrl/stats');
      final response = await http.get(url).timeout(const Duration(seconds: 5));
      return response.statusCode == 200;
    } catch (_) {
      return false;
    }
  }
}

