import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:url_launcher/url_launcher.dart';
import 'sim_scanner_screen.dart';

class SimSuccessScreen extends StatefulWidget {
  final Map<String, dynamic> result;
  final Map<String, dynamic> merchant;

  const SimSuccessScreen({super.key, required this.result, required this.merchant});

  @override
  State<SimSuccessScreen> createState() => _SimSuccessScreenState();
}

class _SimSuccessScreenState extends State<SimSuccessScreen>
    with SingleTickerProviderStateMixin {
  bool _showDetails = false;
  late AnimationController _checkAnim;

  @override
  void initState() {
    super.initState();
    _checkAnim = AnimationController(vsync: this, duration: const Duration(milliseconds: 600));
    Future.delayed(const Duration(milliseconds: 300), () {
      if (mounted) _checkAnim.forward();
    });
  }

  @override
  void dispose() { _checkAnim.dispose(); super.dispose(); }

  String _fmt(num v) =>
      'Rp ${v.toInt().toString().replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (m) => '${m[1]}.')}';

  @override
  Widget build(BuildContext context) {
    final r        = widget.result;
    final m        = widget.merchant;
    final sig      = (r['simulated_tx_signature'] as String?) ?? '';
    final sigShort = sig.length > 8 ? '${sig.substring(0, 4)}…${sig.substring(sig.length - 4)}' : sig;
    final amtIdr   = r['amount_idr'] as num? ?? 0;
    final fee      = r['platform_fee_idr'] as num? ?? 0;
    final token    = r['token'] as String? ?? 'SOL';
    final tokenAmt = r['token_amount'] as num? ?? 0;
    final settle   = r['idrx_settlement'] as Map<String, dynamic>? ?? {};
    final feeSplit = r['fee_split'] as Map<String, dynamic>?;

    return Scaffold(
      backgroundColor: const Color(0xFF0A0A14),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(children: [

            const SizedBox(height: 20),

            // ── Animated checkmark ──
            AnimatedBuilder(
              animation: _checkAnim,
              builder: (_, __) => Container(
                width: 96, height: 96,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: const Color(0xFF00FF94).withValues(alpha: 0.15 * _checkAnim.value),
                  border: Border.all(
                    color: const Color(0xFF00FF94).withValues(alpha: _checkAnim.value),
                    width: 3,
                  ),
                ),
                child: Icon(
                  Icons.check,
                  color: const Color(0xFF00FF94).withValues(alpha: _checkAnim.value),
                  size: 52,
                ),
              ),
            ),

            const SizedBox(height: 20),

            const Text('Pembayaran Berhasil!',
                style: TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.bold))
                .animate().fadeIn(delay: 400.ms),

            const SizedBox(height: 6),

            Text('ke ${m['name'] ?? 'Merchant'}',
                style: const TextStyle(color: Colors.white54, fontSize: 15))
                .animate().fadeIn(delay: 500.ms),

            const SizedBox(height: 4),

            Text(_fmt(amtIdr),
                style: const TextStyle(color: Color(0xFF00FF94), fontSize: 28, fontWeight: FontWeight.bold))
                .animate().fadeIn(delay: 600.ms),

            const SizedBox(height: 4),

            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: const Color(0xFFFF6B00).withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: const Color(0xFFFF6B00)),
              ),
              child: const Text('MODE SIMULASI — TIDAK ADA DANA NYATA',
                  style: TextStyle(color: Color(0xFFFF6B00), fontSize: 10, fontWeight: FontWeight.bold)),
            ).animate().fadeIn(delay: 700.ms),

            const SizedBox(height: 24),

            // ── Detail accordion ──
            GestureDetector(
              onTap: () => setState(() { _showDetails = !_showDetails; }),
              child: _card(Column(children: [
                Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                  const Text('Detail Transaksi', style: TextStyle(color: Colors.white70, fontWeight: FontWeight.bold)),
                  Icon(_showDetails ? Icons.expand_less : Icons.expand_more, color: Colors.white38),
                ]),
                if (_showDetails) ...[
                  const Divider(color: Colors.white12, height: 20),
                  _row('Token dibayar', '${tokenAmt.toStringAsFixed(token == 'IDRX' ? 0 : 6)} $token'),
                  _row('Biaya layanan (0.5%)', _fmt(fee)),
                  if (feeSplit != null) ...[
                    _row('  Platform (70%)', _fmt(feeSplit['platform_share'] as num? ?? 0)),
                    _row('  Dev (30%)', _fmt(feeSplit['dev_share'] as num? ?? 0)),
                  ],
                  _row('Settlement', settle['method']?.toString().replaceAll('_', ' ') ?? 'IDRX'),
                  _row('Merchant dapat', _fmt((settle['amount'] as num?) ?? (amtIdr - fee))),
                  const Divider(color: Colors.white12, height: 20),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Text(
                          'TX Hash: $sigShort',
                          style: const TextStyle(color: Colors.white38, fontSize: 12),
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.copy, size: 16, color: Colors.white38),
                        onPressed: () {
                          Clipboard.setData(ClipboardData(text: sig));
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('Hash disalin')),
                          );
                        },
                      ),
                    ],
                  ),
                  TextButton.icon(
                    icon: const Icon(Icons.open_in_new, size: 14, color: Color(0xFF8B2EE8)),
                    label: const Text('Lihat di Solana Explorer (simulasi)',
                        style: TextStyle(color: Color(0xFF8B2EE8), fontSize: 12)),
                    onPressed: () async {
                      final url = Uri.parse(
                          'https://explorer.solana.com/tx/$sig?cluster=mainnet-beta');
                      if (await canLaunchUrl(url)) launchUrl(url, mode: LaunchMode.externalApplication);
                    },
                  ),
                ],
              ])),
            ).animate().fadeIn(delay: 800.ms),

            const SizedBox(height: 20),

            // ── Action buttons ──
            Row(children: [
              Expanded(
                child: OutlinedButton(
                  style: OutlinedButton.styleFrom(
                    side: const BorderSide(color: Colors.white24),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  onPressed: () => Navigator.of(context).popUntil((r) => r.isFirst),
                  child: const Text('Selesai', style: TextStyle(color: Colors.white)),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF8B2EE8),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  onPressed: () {
                    Navigator.of(context).pushAndRemoveUntil(
                      MaterialPageRoute(builder: (_) => const SimScannerScreen()),
                      (r) => false,
                    );
                  },
                  child: const Text('Bayar Lagi', style: TextStyle(color: Colors.white)),
                ),
              ),
            ]).animate().fadeIn(delay: 900.ms),

          ]),
        ),
      ),
    );
  }

  Widget _card(Widget child) => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: const Color(0xFF14142A),
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: Colors.white12),
    ),
    child: child,
  );

  Widget _row(String label, String value) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 3),
    child: Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: const TextStyle(color: Colors.white54, fontSize: 13)),
        Text(value, style: const TextStyle(color: Colors.white, fontSize: 13)),
      ],
    ),
  );
}
