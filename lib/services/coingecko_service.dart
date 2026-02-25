import 'dart:convert';
import 'package:http/http.dart' as http;

/// CoinGecko Oracle Service
/// Sam Altman Challenge: Real-time, manipulation-proof pricing
/// Provides independent price verification against Jupiter quotes
class CoinGeckoService {
  static const String _baseUrl = "https://api.coingecko.com/api/v3";
  
  // CoinGecko Token IDs
  static const String solId = "solana";
  static const String usdcId = "usd-coin";
  static const String idrxId = "idrx"; // If listed, otherwise use USDC as proxy
  
  // Circuit Breaker Settings (Sam Altman Security Standard)
  static const double maxAllowedDeviationPercent = 2.0; // 2% max deviation
  static const Duration priceValidityWindow = Duration(minutes: 5);
  
  Map<String, double>? _cachedPrices;
  DateTime? _lastFetchTime;

  /// Fetch Real-Time Prices from CoinGecko
  /// Returns: {'SOL': price_in_idr, 'USDC': price_in_idr}
  /// This is the ORACLE LAYER that prevents price manipulation
  Future<Map<String, double>?> getPrices() async {
    try {
      // Cache optimization: strictly 60 seconds as per Elon/Sam requirement
      if (_cachedPrices != null && _lastFetchTime != null) {
        final age = DateTime.now().difference(_lastFetchTime!);
        if (age.inSeconds < 60) {
          print("[COINGECKO] Using cached prices (${age.inSeconds}s old)");
          return _cachedPrices;
        }
      }
      
      final url = Uri.parse("$_baseUrl/simple/price?ids=$solId,$usdcId&vs_currencies=idr&include_24hr_change=true");
      final response = await http.get(url).timeout(const Duration(seconds: 5));
      
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        
        final prices = {
          'SOL': (data[solId]['idr'] as num).toDouble(),
          'USDC': (data[usdcId]['idr'] as num).toDouble(),
        };
        
        final solChange24h = (data[solId]['idr_24h_change'] as num?)?.toDouble() ?? 0.0;
        
        print("[COINGECKO] Live Market Prices:");
        print("  SOL: Rp ${prices['SOL']!.toStringAsFixed(0)} (24h: ${solChange24h >= 0 ? '+' : ''}${solChange24h.toStringAsFixed(2)}%)");
        print("  USDC: Rp ${prices['USDC']!.toStringAsFixed(0)}");
        
        // Update cache
        _cachedPrices = prices;
        _lastFetchTime = DateTime.now();
        
        return prices;
      } else {
        print("[COINGECKO] HTTP Error ${response.statusCode}");
      }
    } catch (e) {
      print("[COINGECKO ERROR] FATAL: $e");
      // ABSOLUTE RULE: If pricing is not deterministic -> STOP.
    }
    return null;
  }

  /// CIRCUIT BREAKER: Verify Jupiter Quote vs CoinGecko Market Price
  /// Sam Altman Standard: Prevent price manipulation, MEV attacks, oracle failures
  /// Returns: true if quote is within 2% of market, false if suspicious
  bool verifyRate(double jupiterQuotePrice, double coinGeckoMarketPrice) {
    if (coinGeckoMarketPrice <= 0) {
      print("[PRICE CHECK] 🚨 CoinGecko price unavailable. HARD FAIL.");
      return false; // BLOCK transaction. No oracle = No safety.
    }
    
    final deviation = (jupiterQuotePrice - coinGeckoMarketPrice).abs() / coinGeckoMarketPrice;
    final deviationPercent = deviation * 100;
    
    final isValid = deviation < (maxAllowedDeviationPercent / 100);
    
    final status = isValid ? "✅ VERIFIED" : "🚨 CIRCUIT BREAKER TRIGGERED";
    print("[PRICE CHECK] $status");
    print("  Jupiter Quote: Rp ${jupiterQuotePrice.toStringAsFixed(0)}");
    print("  CoinGecko Market: Rp ${coinGeckoMarketPrice.toStringAsFixed(0)}");
    print("  Deviation: ${deviationPercent.toStringAsFixed(3)}% (Max: $maxAllowedDeviationPercent%)");
    
    if (!isValid) {
      print("[SECURITY] 🚨 PRICE MANIPULATION DETECTED OR ORACLE DESYNC");
      print("  This transaction is BLOCKED for user safety");
    }
    
    return isValid;
  }
  
  /// Get User-Facing Price Summary (Transparency)
  String getPriceSummary() {
    if (_cachedPrices == null) return "Price data unavailable";
    
    final age = _lastFetchTime != null 
        ? DateTime.now().difference(_lastFetchTime!).inSeconds 
        : 999;
    
    return "SOL: Rp ${_cachedPrices!['SOL']!.toStringAsFixed(0)} | "
           "USDC: Rp ${_cachedPrices!['USDC']!.toStringAsFixed(0)} | "
           "Updated: ${age}s ago";
  }
}

