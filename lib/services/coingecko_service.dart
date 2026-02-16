import 'dart:convert';
import 'package:http/http.dart' as http;

class CoinGeckoService {
  static const String _baseUrl = "https://api.coingecko.com/api/v3";
  
  // CoinGecko IDs
  static const String solId = "solana";
  static const String usdcId = "usd-coin";

  Future<Map<String, double>?> getPrices() async {
    try {
      final url = Uri.parse("$_baseUrl/simple/price?ids=$solId,$usdcId&vs_currencies=idr");
      final response = await http.get(url);
      
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return {
          'SOL': (data[solId]['idr'] as num).toDouble(),
          'USDC': (data[usdcId]['idr'] as num).toDouble(),
        };
      }
    } catch (e) {
      print("[COINGECKO ERROR] $e");
    }
    return null;
  }

  /// Verification Logic:
  /// Compare Jupiter Quote vs Market Price
  /// If deviation > 2%, warn or fail
  bool verifyRate(double quotePrice, double marketPrice) {
    final deviation = (quotePrice - marketPrice).abs() / marketPrice;
    print("[PRICE CHECK] Quote: $quotePrice, Market: $marketPrice, Deviation: ${(deviation * 100).toStringAsFixed(2)}%");
    return deviation < 0.02; // 2% tolerance
  }
}
