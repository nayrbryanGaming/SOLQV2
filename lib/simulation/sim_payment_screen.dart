import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:http/http.dart' as http;
import '../config/app_config.dart';
import 'sim_success_screen.dart';

class SimPaymentScreen extends StatefulWidget {
  final String rawQris;
  final Map<String, dynamic> merchantData;

  const SimPaymentScreen({
    super.key,
    required this.rawQris,
    required this.merchantData,
  });

  @override
  State<SimPaymentScreen> createState() => _SimPaymentScreenState();
}

class _SimPaymentScreenState extends State<SimPaymentScreen> {
  String _selectedToken = 'SOL';
  final _amountCtrl     = TextEditingController(text: '50000');
  Map<String, dynamic>? _quote;
  bool _loadingQuote    = false;
  Timer? _quoteTimer;
  int _countdown        = 30;

  @override
  void initState() {
    super.initState();
    _fetchQuote();
  }

  @override
  void dispose() {
    _quoteTimer?.cancel();
    _amountCtrl.dispose();
    super.dispose();
  }

  Future<void> _fetchQuote() async {
    setState(() { _loadingQuote = true; });
    _quoteTimer?.cancel();

    try {
      final amt = int.tryParse(_amountCtrl.text) ?? 50000;
      final res = await http.post(
        Uri.parse('${AppConfig.apiBaseUrl}/v1/simulation/quote'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'amount_idr': amt, 'token': _selectedToken}),
      ).timeout(const Duration(seconds: 6));

      if (res.statusCode == 200 && mounted) {
        setState(() {
          _quote       = jsonDecode(res.body) as Map<String, dynamic>;
          _countdown   = 30;
          _loadingQuote = false;
        });
        _startCountdown();
      }
    } catch (_) {
      // Offline fallback quote
      if (mounted) {
        final amt = int.tryParse(_amountCtrl.text) ?? 50000;
        setState(() {
          _quote = {
            'simulation':       true,
            'token':            _selectedToken,
            'amount_idr':       amt,
            'token_needed':     _selectedToken == 'SOL' ? (amt / 2850000.0) : (amt / 16350.0),
            'rate_idr':         _selectedToken == 'SOL' ? 2850000 : 16350,
            'platform_fee_idr': (amt * 0.005).round().clamp(2500, 99999999),
            'network_fee_idr':  2,
            'total_idr':        amt + ((amt * 0.005).round().clamp(2500, 99999999)),
          };
          _countdown    = 30;
          _loadingQuote = false;
        });
        _startCountdown();
      }
    }
  }

  void _startCountdown() {
    _quoteTimer?.cancel();
    _quoteTimer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) { t.cancel(); return; }
      setState(() { _countdown--; });
      if (_countdown <= 0) { t.cancel(); _fetchQuote(); }
    });
  }

  Future<void> _simulatePay() async {
    final amt = int.tryParse(_amountCtrl.text) ?? 50000;
    final merchant = widget.merchantData['merchant'] as Map<String, dynamic>? ?? {};

    // Show processing dialog
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => const _ProcessingDialog(),
    );

    try {
      Map<String, dynamic> result;

      final res = await http.post(
        Uri.parse('${AppConfig.apiBaseUrl}/v1/simulation/pay'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'amount_idr': amt,
          'token':      _selectedToken,
          'merchant':   merchant['name'] ?? 'UNKNOWN',
          'nmid':       merchant['nmid'] ?? '-',
        }),
      ).timeout(const Duration(seconds: 8));

      if (res.statusCode == 200) {
        result = jsonDecode(res.body) as Map<String, dynamic>;
      } else {
        result = _buildFallbackResult(amt, merchant);
      }

      // Simulate blockchain confirmation delay
      await Future.delayed(const Duration(milliseconds: 3200));

      if (mounted) {
        Navigator.pop(context); // close dialog
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (_) => SimSuccessScreen(result: result, merchant: merchant)),
        );
      }
    } catch (_) {
      await Future.delayed(const Duration(milliseconds: 3200));
      if (mounted) {
        Navigator.pop(context);
        final result = _buildFallbackResult(amt, merchant);
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (_) => SimSuccessScreen(result: result, merchant: merchant)),
        );
      }
    }
  }

  Map<String, dynamic> _buildFallbackResult(int amt, Map<String, dynamic> merchant) {
    final fee  = (amt * 0.005).round().clamp(2500, 99999999);
    final rate = _selectedToken == 'SOL' ? 2850000 : 16350;
    return {
      'simulation':             true,
      'status':                 'SETTLEMENT_COMPLETE',
      'amount_idr':             amt,
      'token':                  _selectedToken,
      'token_amount':           amt / (rate * 0.995),
      'rate_idr':               rate,
      'platform_fee_idr':       fee,
      'simulated_tx_signature': List.generate(88, (_) => '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'[DateTime.now().microsecondsSinceEpoch % 58]).join(),
      'idrx_settlement':        {'status': 'COMPLETED', 'amount': amt - fee, 'method': 'IDRX_OFFRAMP_SIMULATED'},
    };
  }

  String _fmt(num v, {int decimals = 0}) {
    if (decimals == 0) return 'Rp ${v.toInt().toString().replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (m) => '${m[1]}.')}';
    return v.toStringAsFixed(decimals);
  }

  @override
  Widget build(BuildContext context) {
    final merchant = widget.merchantData['merchant'] as Map<String, dynamic>? ?? {};
    final name     = merchant['name'] ?? 'Merchant';
    final city     = merchant['city'] ?? '';
    final nmid     = merchant['nmid'] ?? '-';
    final qrType   = widget.merchantData['qr_type'] ?? 'STATIC';
    final q        = _quote;
    final amountIdr = int.tryParse(_amountCtrl.text) ?? 50000;

    return Scaffold(
      backgroundColor: const Color(0xFF0A0A14),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: const Text('Konfirmasi Pembayaran', style: TextStyle(color: Colors.white, fontSize: 16)),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => Navigator.pop(context),
        ),
        actions: [
          Container(
            margin: const EdgeInsets.only(right: 12),
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: const Color(0xFFFF6B00).withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: const Color(0xFFFF6B00)),
            ),
            child: const Text('SIMULASI', style: TextStyle(color: Color(0xFFFF6B00), fontSize: 10, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [

          // ── Merchant Card ──
          _card(Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              const Icon(Icons.store, color: Color(0xFF8B2EE8), size: 20),
              const SizedBox(width: 8),
              Expanded(child: Text(name, style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold), overflow: TextOverflow.ellipsis)),
            ]),
            if (city.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(city, style: const TextStyle(color: Colors.white54, fontSize: 13)),
            ],
            const SizedBox(height: 8),
            Row(children: [
              _tagChip(qrType == 'DYNAMIC' ? 'QR DINAMIS' : 'QR STATIS',
                  qrType == 'DYNAMIC' ? const Color(0xFF00FF94) : Colors.white38),
              const SizedBox(width: 8),
              if (nmid != '-') _tagChip('NMID: $nmid', Colors.white38),
            ]),
          ])).animate().fadeIn(duration: 300.ms),

          const SizedBox(height: 16),

          // ── Amount Input ──
          _card(Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Nominal Pembayaran', style: TextStyle(color: Colors.white54, fontSize: 12)),
            const SizedBox(height: 8),
            TextField(
              controller: _amountCtrl,
              keyboardType: TextInputType.number,
              style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.bold),
              decoration: const InputDecoration(
                prefixText: 'Rp ',
                prefixStyle: TextStyle(color: Colors.white54, fontSize: 22),
                border: InputBorder.none,
                hintText: '0',
                hintStyle: TextStyle(color: Colors.white24),
              ),
              onChanged: (_) => _fetchQuote(),
            ),
          ])).animate().fadeIn(duration: 400.ms),

          const SizedBox(height: 16),

          // ── Token Selector ──
          Row(children: ['SOL', 'USDC', 'IDRX'].map((tok) {
            final sel = tok == _selectedToken;
            return Expanded(
              child: GestureDetector(
                onTap: () { setState(() { _selectedToken = tok; }); _fetchQuote(); },
                child: Container(
                  margin: const EdgeInsets.symmetric(horizontal: 4),
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  decoration: BoxDecoration(
                    color: sel ? const Color(0xFF8B2EE8) : const Color(0xFF14142A),
                    borderRadius: BorderRadius.circular(12),
                    border: sel ? null : Border.all(color: Colors.white12),
                  ),
                  child: Text(tok, textAlign: TextAlign.center,
                      style: TextStyle(color: sel ? Colors.white : Colors.white54, fontWeight: FontWeight.bold)),
                ),
              ),
            );
          }).toList()),

          const SizedBox(height: 16),

          // ── Quote Breakdown ──
          if (_loadingQuote)
            const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator(color: Color(0xFF8B2EE8))))
          else if (q != null)
            _card(Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                const Text('Rincian Biaya', style: TextStyle(color: Colors.white70, fontSize: 13, fontWeight: FontWeight.bold)),
                Row(children: [
                  Icon(Icons.timer_outlined, color: _countdown < 10 ? Colors.orange : const Color(0xFF00FF94), size: 14),
                  const SizedBox(width: 4),
                  Text('${_countdown}s', style: TextStyle(color: _countdown < 10 ? Colors.orange : const Color(0xFF00FF94), fontSize: 12)),
                ]),
              ]),
              const SizedBox(height: 12),
              _row('Nominal merchant', _fmt(amountIdr)),
              _row('Kurs 1 $_selectedToken', '≈ Rp ${(q['rate_idr'] as num).toInt().toString().replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (m) => '${m[1]}.')}'),
              _row('Token dibutuhkan', '${(q['token_needed'] as num).toStringAsFixed(_selectedToken == 'IDRX' ? 0 : 6)} $_selectedToken'),
              _row('Biaya jaringan', 'Gratis ✓ (ditanggung SOLQ)'),
              _row('Biaya layanan (0.5%)', _fmt((q['platform_fee_idr'] as num).toInt())),
              const Divider(color: Colors.white12, height: 20),
              _row('TOTAL', _fmt((q['total_idr'] as num).toInt()), highlight: true),
            ])).animate().fadeIn(duration: 400.ms),

          const SizedBox(height: 24),

          // ── Pay Button ──
          SizedBox(
            width: double.infinity,
            height: 56,
            child: ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF8B2EE8),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              ),
              onPressed: q != null ? _simulatePay : null,
              child: Text(
                q != null ? 'Bayar ${_fmt(amountIdr)} [SIMULASI]' : 'Menghitung...',
                style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
              ),
            ),
          ).animate().fadeIn(duration: 500.ms),

          const SizedBox(height: 12),
          const Center(
            child: Text(
              'Tidak ada dana nyata yang dipindahkan dalam mode simulasi',
              style: TextStyle(color: Colors.white38, fontSize: 11),
              textAlign: TextAlign.center,
            ),
          ),
        ]),
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

  Widget _tagChip(String label, Color color) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
    decoration: BoxDecoration(
      color: color.withValues(alpha: 0.1),
      borderRadius: BorderRadius.circular(8),
      border: Border.all(color: color.withValues(alpha: 0.4)),
    ),
    child: Text(label, style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.bold)),
  );

  Widget _row(String label, String value, {bool highlight = false}) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 4),
    child: Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: TextStyle(color: highlight ? Colors.white : Colors.white54, fontSize: highlight ? 14 : 13, fontWeight: highlight ? FontWeight.bold : FontWeight.normal)),
        Text(value, style: TextStyle(color: highlight ? const Color(0xFF00FF94) : Colors.white, fontSize: highlight ? 16 : 13, fontWeight: highlight ? FontWeight.bold : FontWeight.normal)),
      ],
    ),
  );
}

class _ProcessingDialog extends StatefulWidget {
  const _ProcessingDialog();
  @override
  State<_ProcessingDialog> createState() => _ProcessingDialogState();
}

class _ProcessingDialogState extends State<_ProcessingDialog> {
  int _step = 0;
  static const _steps = [
    'Menyiapkan transaksi…',
    'Menunggu tanda tangan wallet…',
    '✓ Tanda tangan diterima',
    'Mengirim ke jaringan Solana…',
    'Memverifikasi on-chain (~2-3 detik)…',
    '✓ Terkonfirmasi on-chain',
    'Mengirim Rupiah ke merchant via IDRX…',
  ];
  Timer? _t;

  @override
  void initState() {
    super.initState();
    _t = Timer.periodic(const Duration(milliseconds: 650), (_) {
      if (mounted && _step < _steps.length - 1) setState(() { _step++; });
    });
  }

  @override
  void dispose() { _t?.cancel(); super.dispose(); }

  @override
  Widget build(BuildContext context) => Dialog(
    backgroundColor: const Color(0xFF14142A),
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
    child: Padding(
      padding: const EdgeInsets.all(28),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        const SizedBox(
          width: 56, height: 56,
          child: CircularProgressIndicator(
            color: Color(0xFF8B2EE8), strokeWidth: 3,
          ),
        ),
        const SizedBox(height: 20),
        Text(_steps[_step],
          style: const TextStyle(color: Colors.white, fontSize: 15),
          textAlign: TextAlign.center,
        ).animate(key: ValueKey(_step)).fadeIn(duration: 200.ms),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(
            color: const Color(0xFFFF6B00).withValues(alpha: 0.2),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: const Color(0xFFFF6B00)),
          ),
          child: const Text('SIMULASI', style: TextStyle(color: Color(0xFFFF6B00), fontSize: 10, fontWeight: FontWeight.bold)),
        ),
      ]),
    ),
  );
}
