import 'dart:io' show Platform;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/solana_service.dart';
import '../services/language_service.dart';
import '../config/app_config.dart';

const _kBgSheet = Color(0xFFFAF9F6);
const _kInk     = Color(0xFF0E0E0C);
const _kInk3    = Color(0xFF76766E);
const _kLine    = Color(0xFFE6E4DD);
const _kRed     = Color(0xFFB91C1C);

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
  bool _showManual = false;
  String? _errorMsg;
  final _addrCtrl = TextEditingController();

  @override
  void dispose() {
    _addrCtrl.dispose();
    super.dispose();
  }

  Future<void> _doConnect() async {
    if (_connecting) return;
    setState(() { _connecting = true; _errorMsg = null; });

    final solana = SolanaService();
    try {
      if (AppConfig.isSimulation) {
        await solana.demoConnect();
      } else {
        await solana.connect();
      }
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (!mounted) return;
      final msg = e.toString();
      setState(() {
        _connecting = false;
        // Surface actionable error for unsupported OS / old API level
        if (msg.contains('API_TOO_LOW') || msg.contains('API 31')) {
          _errorMsg = 'Perangkat Anda butuh Android 12+ untuk MWA.\nGunakan "Input Manual" di bawah.';
          _showManual = true;
        } else if (msg.contains('NO_WALLET') || msg.contains('wallet')) {
          _errorMsg = 'Phantom / Solflare belum terpasang.\nGunakan "Input Manual" di bawah.';
          _showManual = true;
        } else if (msg.contains('CANCELLED')) {
          _errorMsg = 'Koneksi dibatalkan.';
        } else if (msg.contains('TIMEOUT') || msg.contains('TimeoutException')) {
          _errorMsg = 'Wallet tidak merespons (timeout 60s). Coba lagi.';
        } else {
          _errorMsg = 'Koneksi gagal. Pastikan Phantom/Solflare terpasang.';
          _showManual = true;
        }
      });
    }
  }

  Future<void> _doManualConnect() async {
    final addr = _addrCtrl.text.trim();
    if (addr.length < 32 || addr.length > 44) {
      setState(() => _errorMsg = 'Alamat Solana tidak valid (32–44 karakter).');
      return;
    }
    setState(() { _connecting = true; _errorMsg = null; });
    try {
      await SolanaService().connectManual(addr);
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) setState(() { _connecting = false; _errorMsg = e.toString(); });
    }
  }

  @override
  Widget build(BuildContext context) {
    final lang = context.watch<LanguageService>();
    final bottomPadding = MediaQuery.of(context).viewInsets.bottom;

    return Container(
      decoration: const BoxDecoration(
        color: _kBgSheet,
        borderRadius: BorderRadius.only(
          topLeft: Radius.circular(20),
          topRight: Radius.circular(20),
        ),
      ),
      padding: EdgeInsets.only(bottom: 40 + bottomPadding),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Handle
          Container(
            width: 36, height: 4,
            margin: const EdgeInsets.symmetric(vertical: 14),
            decoration: BoxDecoration(color: _kLine, borderRadius: BorderRadius.circular(2)),
          ),

          // Title
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 4),
            child: Text(
              lang.t('connect_wallet'),
              style: const TextStyle(color: _kInk, fontSize: 16, fontWeight: FontWeight.w700, letterSpacing: -0.2),
            ),
          ),

          const SizedBox(height: 4),

          // Subtitle
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Text(
              AppConfig.isSimulation
                  ? 'Demo mode — no real wallet needed'
                  : Platform.isAndroid
                      ? 'Non-custodial  ·  Solana Mainnet  ·  MWA'
                      : 'Non-custodial  ·  Solana Mainnet',
              style: const TextStyle(color: _kInk3, fontSize: 12),
            ),
          ),

          const SizedBox(height: 24),

          // Error message
          if (_errorMsg != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: _kRed.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: _kRed.withValues(alpha: 0.3)),
                ),
                child: Text(
                  _errorMsg!,
                  style: const TextStyle(color: _kRed, fontSize: 12),
                ),
              ),
            ),

          if (_errorMsg != null) const SizedBox(height: 16),

          // ── MWA Connect button ──
          if (!_showManual || _errorMsg == null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: _connecting ? null : _doConnect,
                  icon: _connecting
                      ? const SizedBox(
                          width: 18, height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFFFAF9F6)),
                        )
                      : const Icon(Icons.account_balance_wallet_outlined, size: 20),
                  label: Text(
                    _connecting ? 'Menghubungkan...' : 'Connect Wallet',
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _kInk,
                    foregroundColor: const Color(0xFFFAF9F6),
                    disabledBackgroundColor: _kLine,
                    padding: const EdgeInsets.symmetric(vertical: 18),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    elevation: 0,
                  ),
                ),
              ),
            ),

          // ── Manual address input (shown after MWA failure or tap) ──
          if (_showManual) ...[
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Atau masukkan alamat wallet Solana:',
                    style: TextStyle(color: _kInk3, fontSize: 12, fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _addrCtrl,
                    autocorrect: false,
                    enableSuggestions: false,
                    decoration: InputDecoration(
                      hintText: 'e.g. ABC123...xyz (44 chars)',
                      hintStyle: const TextStyle(color: _kInk3, fontSize: 13),
                      filled: true,
                      fillColor: const Color(0xFFF0EFE9),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                        borderSide: BorderSide.none,
                      ),
                    ),
                    style: const TextStyle(color: _kInk, fontSize: 13, fontFamily: 'monospace'),
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: _connecting ? null : _doManualConnect,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF1D4ED8),
                        foregroundColor: Colors.white,
                        disabledBackgroundColor: _kLine,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        elevation: 0,
                      ),
                      child: const Text('Gunakan Alamat Ini', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                    ),
                  ),
                ],
              ),
            ),
          ],

          const SizedBox(height: 16),

          // Toggle manual / retry MWA
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (!_showManual)
                  TextButton(
                    onPressed: () => setState(() { _showManual = true; _errorMsg = null; }),
                    child: const Text('Input Manual', style: TextStyle(color: _kInk3, fontSize: 12)),
                  )
                else
                  TextButton(
                    onPressed: _connecting ? null : () => setState(() { _showManual = false; _errorMsg = null; }),
                    child: const Text('Coba MWA lagi', style: TextStyle(color: _kInk3, fontSize: 12)),
                  ),
              ],
            ),
          ),

          if (AppConfig.isSimulation)
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 24),
              child: Row(
                children: [
                  Icon(Icons.info_outline, size: 13, color: _kInk3),
                  SizedBox(width: 6),
                  Text('Demo mode — no real wallet needed', style: TextStyle(color: _kInk3, fontSize: 11)),
                ],
              ),
            )
          else
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Text(
                _showManual
                    ? 'Mode manual: transaksi via Solana Pay URL (tidak perlu MWA)'
                    : 'Requires Phantom, Solflare, or any MWA-compatible wallet',
                style: const TextStyle(color: _kInk3, fontSize: 11),
                textAlign: TextAlign.center,
              ),
            ),
        ],
      ),
    );
  }
}
