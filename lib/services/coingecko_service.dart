import 'dart:convert';
import 'package:http/http.dart' as http;

/// CoinGecko Oracle Service - OPTIMIZED FOR MAINNET
/// Sam Altman Challenge: Real-time, manipulation-proof pricing
/// Multi-Oracle Fallback: CoinGecko → Jupiter Price API → ExchangeRate-API
class CoinGeckoService {
  static final CoinGeckoService _instance = CoinGeckoService._internal();
  factory CoinGeckoService() => _instance;
  CoinGeckoService._internal();

  static const String _baseUrl = "https://api.coingecko.com/api/v3";
  static const String _jupiterPriceUrl = "https://lite-api.jup.ag/price/v2";

  // CoinGecko Token IDs
  static const String solId = "solana";
  static const String usdcId = "usd-coin";

  // Circuit Breaker Settings (Sam Altman Security Standard)
  static const double maxAllowedDeviationPercent = 2.5; // 2.5% max deviation (realistic for volatile markets)
  static const Duration priceValidityWindow = Duration(minutes: 5);
  static const Duration cacheWindow = Duration(seconds: 45); // Aggressive cache for speed

  Map<String, double>? _cachedPrices;
  DateTime? _lastFetchTime;
  bool _isInitialized = false;

  /// Initialize service (call once at app start)
  Future<void> init() async {
    if (_isInitialized) return;
    await getPrices(); // Warm up cache
    _isInitialized = true;
  }

  Future<Map<String, double>?> getPrices() async {
    // AGGRESSIVE CACHE: Return immediately if fresh
    if (_cachedPrices != null && _lastFetchTime != null) {
      final age = DateTime.now().difference(_lastFetchTime!);
      if (age < cacheWindow) {
        return _cachedPrices;
      }
    }

    // ORACLE 1: CoinGecko (Primary)
    try {
      final prices = await _fetchFromCoinGecko();
      if (prices != null) {
        _cachedPrices = prices;
        _lastFetchTime = DateTime.now();
        return prices;
      }
    } catch (_) {}

    // ORACLE 2: Jupiter Price API (Backup)
    try {
      final prices = await _fetchFromJupiter();
      if (prices != null) {
        _cachedPrices = prices;
        _lastFetchTime = DateTime.now();
        return prices;
      }
    } catch (_) {}

    // ORACLE 3: Return cached if still valid
    if (_cachedPrices != null && _lastFetchTime != null) {
      if (DateTime.now().difference(_lastFetchTime!) < priceValidityWindow) {
        return _cachedPrices;
      }
    }

    // HARD FAIL - No oracle available
    throw Exception("ORACLE FAILURE: All price sources unavailable. Transaction blocked for safety.");
  }

  Future<Map<String, double>?> _fetchFromCoinGecko() async {
    final url = Uri.parse("$_baseUrl/simple/price?ids=$solId,$usdcId&vs_currencies=idr");
    const String? apiKey = String.fromEnvironment('COINGECKO_API_KEY', defaultValue: '');

    final headers = <String, String>{'Accept': 'application/json'};
    if (apiKey.isNotEmpty) {
      headers['x-cg-demo-api-key'] = apiKey;
    }

    final response = await http.get(url, headers: headers).timeout(const Duration(seconds: 5));

    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      return {
        'SOL': (data[solId]['idr'] as num).toDouble(),
        'USDC': (data[usdcId]['idr'] as num).toDouble(),
      };
    }
    return null;
  }

  Future<Map<String, double>?> _fetchFromJupiter() async {
    // Jupiter returns prices in USDC, we need to convert to IDR
    final jupUrl = Uri.parse("$_jupiterPriceUrl?ids=So11111111111111111111111111111111111111112");
    final jupRes = await http.get(jupUrl).timeout(const Duration(seconds: 4));

    if (jupRes.statusCode == 200) {
      final jupData = jsonDecode(jupRes.body);
      final solUsdc = double.tryParse(jupData['data']?['So11111111111111111111111111111111111111112']?['price']?.toString() ?? '0') ?? 0;

      if (solUsdc <= 0) return null;

      // Get USD/IDR from backup API
      final fxRes = await http.get(Uri.parse("https://api.exchangerate-api.com/v4/latest/USD")).timeout(const Duration(seconds: 3));
      if (fxRes.statusCode == 200) {
        final fxData = jsonDecode(fxRes.body);
        final usdIdr = (fxData['rates']['IDR'] as num?)?.toDouble() ?? 15800;

        return {
          'SOL': solUsdc * usdIdr,
          'USDC': usdIdr,
        };
      }
    }
    return null;
  }

  /// CIRCUIT BREAKER: Verify Jupiter Quote vs CoinGecko Market Price
  /// Sam Altman Standard: Prevent price manipulation, MEV attacks, oracle failures
  /// Returns: true if quote is within tolerance of market, false if suspicious
  bool verifyRate(double jupiterQuotePrice, double coinGeckoMarketPrice) {
    if (coinGeckoMarketPrice <= 0 || jupiterQuotePrice <= 0) {
      return false; // BLOCK transaction. No oracle = No safety.
    }
    
    final deviation = (jupiterQuotePrice - coinGeckoMarketPrice).abs() / coinGeckoMarketPrice;
    return deviation < (maxAllowedDeviationPercent / 100);
  }
  
  /// Get User-Facing Price Summary (Transparency)
  String getPriceSummary() {
    if (_cachedPrices == null) return "Fetching prices...";

    final age = _lastFetchTime != null 
        ? DateTime.now().difference(_lastFetchTime!).inSeconds 
        : 999;
    
    return "SOL: Rp ${_cachedPrices!['SOL']!.toStringAsFixed(0)} | "
           "USDC: Rp ${_cachedPrices!['USDC']!.toStringAsFixed(0)} | "
           "${age}s ago";
  }

  /// Get cached SOL price (fast path for UI)
  double? get cachedSolPrice => _cachedPrices?['SOL'];
  double? get cachedUsdcPrice => _cachedPrices?['USDC'];
}

