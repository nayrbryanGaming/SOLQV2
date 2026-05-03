import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';
import '../services/language_service.dart';
import '../services/solana_service.dart';

class IdleView extends StatelessWidget {
  final SolanaService solana;
  final double balance;
  final VoidCallback onStartScan;
  final VoidCallback onPickGallery;

  const IdleView({
    Key? key,
    required this.solana,
    required this.balance,
    required this.onStartScan,
    required this.onPickGallery,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final lang = context.watch<LanguageService>();

    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          // Logo
          Image.asset(
            'assets/logo.png',
            height: 140,
            errorBuilder: (context, error, stackTrace) => const Icon(
              Icons.account_balance_wallet,
              size: 100,
              color: Color(0xFF00FF94),
            ),
          ).animate().scale(duration: 800.ms, curve: Curves.easeOutBack),
          
          const SizedBox(height: 32),
          
          // Wallet Status
          if (solana.isConnected)
            Column(
              children: [
                Text(
                  lang.t('ready_to_pay'),
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 2,
                    color: const Color(0xFF00FF94).withOpacity(0.8),
                  ),
                ).animate().fadeIn(duration: 600.ms).slideY(begin: 0.2, end: 0),
                const SizedBox(height: 8),
                Text(
                  "BAL: ${balance.toStringAsFixed(4)} SOL",
                  style: const TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w900,
                    color: Colors.white,
                  ),
                ).animate().shimmer(duration: 2.seconds, color: const Color(0xFF00FF94).withOpacity(0.2)),
              ],
            )
          else
            Text(
              lang.t('connect_wallet'),
              style: const TextStyle(
                color: Colors.white70,
                fontWeight: FontWeight.bold,
                letterSpacing: 1,
              ),
            ),
            
          const SizedBox(height: 48),
          
          // Scan Button
          ElevatedButton.icon(
            onPressed: onStartScan,
            icon: const Icon(Icons.qr_code_scanner),
            label: Text(lang.t('scan_qris')),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF00FF94),
              foregroundColor: Colors.black,
              padding: const EdgeInsets.symmetric(horizontal: 48, vertical: 20),
              textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900, letterSpacing: 1),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              elevation: 12,
              shadowColor: const Color(0xFF00FF94).withOpacity(0.4),
            ),
          ).animate(onPlay: (controller) => controller.repeat(reverse: true))
           .scale(duration: 2.seconds, begin: const Offset(1.0, 1.0), end: const Offset(1.03, 1.03), curve: Curves.easeInOut),
           
          const SizedBox(height: 16),
          
          // Gallery Link
          TextButton.icon(
            onPressed: onPickGallery,
            icon: const Icon(Icons.photo_library, size: 18, color: Colors.white38),
            label: Text(
              lang.t('pick_gallery'),
              style: const TextStyle(color: Colors.white70, fontWeight: FontWeight.bold),
            ),
          ),
        ],
      ),
    );
  }
}
