import 'package:flutter/material.dart';
import '../services/solana_service.dart';

class WalletPicker extends StatelessWidget {
  const WalletPicker({super.key});

  @override
  Widget build(BuildContext context) {
    final solana = SolanaService();

    return Container(
      padding: const EdgeInsets.only(top: 10, bottom: 40),
      decoration: const BoxDecoration(
        color: Color(0xFF1A1A1A),
        borderRadius: BorderRadius.only(
          topLeft: Radius.circular(24),
          topRight: Radius.circular(24),
        ),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Drag handle
          Container(
            width: 40,
            height: 4,
            margin: const EdgeInsets.symmetric(vertical: 12),
            decoration: BoxDecoration(
              color: Colors.white24,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 8),
            child: Text(
              "CONNECT WALLET",
              style: TextStyle(
                color: Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.w900,
                letterSpacing: 2,
              ),
            ),
          ),
          const SizedBox(height: 16),
          
          // Wallet Grid
          Flexible(
            child: GridView.count(
              shrinkWrap: true,
              crossAxisCount: 3,
              mainAxisSpacing: 10,
              crossAxisSpacing: 10,
              padding: const EdgeInsets.symmetric(horizontal: 24),
              children: [
                _walletItem(
                  context,
                  "Phantom",
                  Icons.account_balance_wallet,
                  const Color(0xFFAB9FF2),
                  () => solana.connectPhantom(),
                ),
                _walletItem(
                  context,
                  "Solflare",
                  Icons.wb_sunny_outlined,
                  const Color(0xFFFFA726),
                  () => solana.connectSolflare(),
                ),
                _walletItem(
                  context,
                  "Jupiter",
                  Icons.swap_horiz,
                  const Color(0xFF4CAF50),
                  () => solana.connectJupiter(),
                ),
                _walletItem(
                  context,
                  "MetaMask",
                  Icons.hexagon_outlined,
                  const Color(0xFFF6851B),
                  () => solana.connectMetamask(),
                ),
                _walletItem(
                  context,
                  "Binance",
                  Icons.account_balance,
                  const Color(0xFFF0B90B),
                  () => solana.connectCex('Binance', 
                      'bnc://app.binance.com/defi/wallet/connect?app_url=https://solq.vercel.app&redirect_link=solq://onconnect'),
                ),
                _walletItem(
                  context,
                  "OKX",
                  Icons.grid_view_rounded,
                  Colors.white70,
                  () => solana.connectCex('OKX', 
                      'okx://wallet/dapp/details?dappUrl=https://solq.vercel.app&redirect_link=solq://onconnect'),
                ),
                _walletItem(
                  context,
                  "Trust",
                  Icons.verified_user_outlined,
                  const Color(0xFF3375BB),
                  () => solana.connectCex('Trust', 
                      'trust://solana/connect?app_url=https://solq.vercel.app&redirect_link=solq://onconnect'),
                ),
                _walletItem(
                  context,
                  "Backpack",
                  Icons.backpack_outlined,
                  const Color(0xFFE44040),
                  () => solana.connectCex('Backpack', 
                      'backpack://wallet/connect?app_url=https://solq.vercel.app&redirect_link=solq://onconnect'),
                ),
                _walletItem(
                  context,
                  "Universal",
                  Icons.more_horiz,
                  Colors.white24,
                  () => solana.connectUniversal(),
                ),
              ],
            ),
          ),
          
          const SizedBox(height: 24),
          const Text(
            "Solana Mainnet Only • Non-Custodial",
            style: TextStyle(color: Colors.white24, fontSize: 10, fontWeight: FontWeight.bold),
          ),
        ],
      ),
    );
  }

  Widget _walletItem(BuildContext context, String name, IconData icon, Color color, VoidCallback onTap) {
    return InkWell(
      onTap: () {
        Navigator.pop(context);
        onTap();
      },
      borderRadius: BorderRadius.circular(16),
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.05),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.white12),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: color, size: 28),
            const SizedBox(height: 8),
            Text(
              name,
              style: const TextStyle(
                color: Colors.white70,
                fontSize: 11,
                fontWeight: FontWeight.w600,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  static void show(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (context) => const WalletPicker(),
    );
  }
}
