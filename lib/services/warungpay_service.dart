import 'dart:convert';
import 'package:http/http.dart' as http;

class WarungPayService {
  final String baseUrl;

  // For Android Emulator, use 10.0.2.2 instead of localhost
  WarungPayService({this.baseUrl = 'http://10.0.2.2:3000/v1'});

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
}
