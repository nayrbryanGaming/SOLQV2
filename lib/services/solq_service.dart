import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class SOLQService {
  String baseUrl;

  // Persistence Key
  static const String _prefKey = 'solq_server_ip';
  static const String defaultBaseUrl = 'http://192.168.18.15:3000/v1';

  SOLQService({String? baseUrl}) : baseUrl = baseUrl ?? defaultBaseUrl;

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
    final body = {
      'qris_payload': qrisPayload,
      'currency': 'IDRX',
    };

    if (amount != null) {
      body['input_amount'] = amount.toString();
    }

    final response = await http.post(
      url,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(body),
    );

    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    } else {
      throw Exception('Failed to create payment intent: ${response.body}');
    }
  }

  Future<Map<String, dynamic>> getPaymentIntentStatus(String id) async {
    final url = Uri.parse('$baseUrl/payment-intents/$id');
    final response = await http.get(url);

    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    } else {
      throw Exception('Failed to get status');
    }
  }

  Future<void> confirmPayment(String id, String txHash) async {
    final url = Uri.parse('$baseUrl/payment-intents/$id/confirm');
    final response = await http.post(
      url,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'tx_hash': txHash,
      }),
    );

    if (response.statusCode != 200) {
       throw Exception('Failed to confirm payment: ${response.body}');
    }
  }

  Future<Map<String, dynamic>> getStats() async {
    final url = Uri.parse('$baseUrl/stats');
    final response = await http.get(url);

    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    } else {
      return {'success_count': 0};
    }
  }

  // FALLBACK: DIRECT TRANSACTION FETCH (Non-SolanaPay Wallets)
  Future<Map<String, dynamic>> getSolanaPayTransaction(String intentId, String account) async {
    // Solana Pay POST endpoint is at the root for standard compliance
    final rootUrl = baseUrl.replaceAll('/v1', '');
    final url = Uri.parse('$rootUrl/solana-pay/$intentId');
    
    final response = await http.post(
      url,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'account': account}),
    );

    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    } else {
      throw Exception('Failed to fetch transaction: ${response.body}');
    }
  }
}

