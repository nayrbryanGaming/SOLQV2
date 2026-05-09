import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/solana_service.dart';
import '../services/language_service.dart';
import '../config/app_config.dart';

const _kBg      = Color(0xFFFFFFFF);
const _kBgSheet = Color(0xFFFAF9F6);
const _kInk     = Color(0xFF0E0E0C);
const _kInk3    = Color(0xFF76766E);
const _kLine    = Color(0xFFE6E4DD);

class WalletPicker extends StatefulWidget {
  const WalletPicker({super.key});

  @override
  State<WalletPicker> createState() => _WalletPickerState();

  static void show(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (context) => const WalletPicker(),
    );
  }
}

class _WalletPickerState extends State<WalletPicker> {
  bool _connecting = false;

  Future<void> _doConnect() async {
    if (_connecting) return;
    setState(() => _connecting = true);

    final solana = SolanaService();
    try {
      if (AppConfig.isSimulation) {
        // Demo mode: connect with a fake address — no Phantom required.
        await solana.demoConnect();
      } else {
        await solana.connect();
      }
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        setState(() => _connecting = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(
            'Wallet tidak dapat terhubung. Pastikan Phantom / Solflare sudah terpasang.',
            style: const TextStyle(color: Colors.white),
          ),
          backgroundColor: const Color(0xFFB91C1C),
          behavior: SnackBarBehavior.floating,
        ));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final lang = context.watch<LanguageService>();

    return Container(
      decoration: const BoxDecoration(
        color: _kBgSheet,
        borderRadius: BorderRadius.only(
          topLeft: Radius.circular(20),
          topRight: Radius.circular(20),
        ),
      ),
      padding: const EdgeInsets.only(bottom: 40),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Handle
          Container(
            width: 36,
            height: 4,
            margin: const EdgeInsets.symmetric(vertical: 14),
            decoration: BoxDecoration(
              color: _kLine,
              borderRadius: BorderRadius.circular(2),
            ),
          ),

          // Title
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 4),
            child: Text(
              lang.t('connect_wallet'),
              style: const TextStyle(
                color: _kInk,
                fontSize: 16,
                fontWeight: FontWeight.w700,
                letterSpacing: -0.2,
              ),
            ),
          ),

          const SizedBox(height: 8),

          // Subtitle
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 24),
            child: Text(
              'Non-custodial  ·  Solana Mainnet',
              style: TextStyle(color: _kInk3, fontSize: 12),
            ),
          ),

          const SizedBox(height: 28),

          // Connect button — ink black
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _connecting ? null : _doConnect,
                icon: _connecting
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Color(0xFFFAF9F6),
                        ),
                      )
                    : const Icon(Icons.account_balance_wallet_outlined, size: 20),
                label: Text(
                  _connecting ? 'Menghubungkan...' : 'Connect Wallet',
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: _kInk,
                  foregroundColor: const Color(0xFFFAF9F6),
                  disabledBackgroundColor: const Color(0xFFE6E4DD),
                  padding: const EdgeInsets.symmetric(vertical: 18),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                  elevation: 0,
                ),
              ),
            ),
          ),

          const SizedBox(height: 16),

          if (AppConfig.isSimulation)
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 24),
              child: Row(
                children: [
                  Icon(Icons.info_outline, size: 13, color: _kInk3),
                  SizedBox(width: 6),
                  Text(
                    'Demo mode — no real wallet needed',
                    style: TextStyle(color: _kInk3, fontSize: 11),
                  ),
                ],
              ),
            )
          else
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 24),
              child: Text(
                'Requires Phantom, Solflare, or any MWA-compatible wallet',
                style: TextStyle(color: _kInk3, fontSize: 11),
                textAlign: TextAlign.center,
              ),
            ),
        ],
      ),
    );
  }
}
