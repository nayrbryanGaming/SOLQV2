class WalletService {
  // Simulates a wallet signature (e.g. Phantom / Solflare)
  static Future<String> signTransaction(String amount, String currency) async {
    // 1. Trigger Wallet Popup (Simulated)
    await Future.delayed(const Duration(seconds: 1));
    
    // 2. Return Mock Signature
    return "sig_mock_${DateTime.now().millisecondsSinceEpoch}_${currency}";
  }
}
