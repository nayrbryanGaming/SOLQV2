import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/language_service.dart';
import '../services/solana_service.dart';

// Cream design tokens — mirrors E:\CLAUDE DESIGN\SOLQ\screens.jsx
const _kBg       = Color(0xFFFAF9F6);
const _kInk      = Color(0xFF0E0E0C);
const _kInk2     = Color(0xFF3A3A36);
const _kInk3     = Color(0xFF76766E);
const _kLine     = Color(0xFFE6E4DD);
const _kCardAlt  = Color(0xFFF2F0E8);
const _kGreen    = Color(0xFF52A876); // oklch(0.72 0.16 145) approx

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

    return Container(
      color: _kBg,
      child: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // Logo
                _SolqMark(size: 52),
                const SizedBox(height: 6),
                const Text(
                  'SOLQ',
                  style: TextStyle(
                    fontFamily: 'JetBrainsMono',
                    fontSize: 22,
                    fontWeight: FontWeight.w700,
                    color: _kInk,
                    letterSpacing: 4,
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Solana × QRIS',
                  style: TextStyle(fontSize: 12, color: _kInk3, letterSpacing: 0.5),
                ),

                const SizedBox(height: 48),

                // Wallet status chip
                if (solana.isConnected) ...[
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                    decoration: BoxDecoration(
                      color: const Color(0xFFEBF5F0),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: _kGreen.withOpacity(0.35)),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 7,
                          height: 7,
                          decoration: const BoxDecoration(
                            color: _kGreen,
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          lang.t('ready_to_pay'),
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: _kGreen,
                            letterSpacing: 0.5,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '${balance.toStringAsFixed(4)} SOL',
                    style: const TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.w700,
                      color: _kInk,
                      letterSpacing: -0.5,
                    ),
                  ),
                ] else ...[
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                    decoration: BoxDecoration(
                      color: _kCardAlt,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: _kLine),
                    ),
                    child: Text(
                      lang.t('connect_wallet'),
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: _kInk3,
                        letterSpacing: 0.5,
                      ),
                    ),
                  ),
                ],

                const SizedBox(height: 40),

                // Primary scan button — ink black per cream design
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: onStartScan,
                    icon: const Icon(Icons.qr_code_scanner, size: 20),
                    label: Text(lang.t('scan_qris')),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: _kInk,
                      foregroundColor: _kBg,
                      padding: const EdgeInsets.symmetric(vertical: 18),
                      textStyle: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0.3,
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      elevation: 0,
                    ),
                  ),
                ),

                const SizedBox(height: 12),

                // Gallery link — ghost style
                TextButton.icon(
                  onPressed: onPickGallery,
                  icon: const Icon(Icons.photo_library_outlined, size: 16, color: _kInk3),
                  label: Text(
                    lang.t('pick_gallery'),
                    style: const TextStyle(
                      color: _kInk3,
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SolqMark extends StatelessWidget {
  final double size;
  const _SolqMark({required this.size});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: _kInk,
        borderRadius: BorderRadius.circular(size * 0.22),
      ),
      alignment: Alignment.center,
      child: Text(
        'SQ',
        style: TextStyle(
          fontFamily: 'JetBrainsMono',
          fontSize: size * 0.38,
          fontWeight: FontWeight.w700,
          color: _kBg,
          letterSpacing: -0.5,
        ),
      ),
    );
  }
}
