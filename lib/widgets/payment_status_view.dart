import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/payment_intent.dart';
import '../services/language_service.dart';
import '../services/orchestrator_service.dart';

class PaymentStatusView extends StatefulWidget {
  final PaymentIntent intent;
  final String settlementTrack;
  final Function(String) onTrackChanged;
  final VoidCallback onReset;

  const PaymentStatusView({
    Key? key,
    required this.intent,
    required this.settlementTrack,
    required this.onTrackChanged,
    required this.onReset,
  }) : super(key: key);

  @override
  State<PaymentStatusView> createState() => _PaymentStatusViewState();
}

class _PaymentStatusViewState extends State<PaymentStatusView> {
  String _manualAmount = "";

  // BUG-023: Quote countdown
  static const int _quoteLifetimeSeconds = 30;
  Timer? _quoteTimer;
  int _quoteSecondsLeft = _quoteLifetimeSeconds;
  bool _isRefreshingQuote = false;

  @override
  void initState() {
    super.initState();
    _startQuoteCountdown();
  }

  @override
  void didUpdateWidget(PaymentStatusView old) {
    super.didUpdateWidget(old);
    if (widget.intent.state == PaymentState.created &&
        widget.intent.updatedAt != old.intent.updatedAt) {
      _resetQuoteCountdown();
    }
  }

  void _startQuoteCountdown() {
    if (widget.intent.state != PaymentState.created) return;
    if (widget.intent.amountIdr == '0' || widget.intent.amountIdr == '0.0') return;
    _quoteTimer?.cancel();
    _quoteTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      if (_quoteSecondsLeft > 0) {
        setState(() => _quoteSecondsLeft--);
      } else {
        _quoteTimer?.cancel();
        _doRefreshQuote();
      }
    });
  }

  void _resetQuoteCountdown() {
    _quoteTimer?.cancel();
    setState(() {
      _isRefreshingQuote = false;
      _quoteSecondsLeft = _quoteLifetimeSeconds;
    });
    _startQuoteCountdown();
  }

  Future<void> _doRefreshQuote() async {
    if (!mounted || _isRefreshingQuote) return;
    setState(() => _isRefreshingQuote = true);
    await OrchestratorService().refreshQuote();
    if (mounted && _isRefreshingQuote) {
      setState(() {
        _isRefreshingQuote = false;
        _quoteSecondsLeft = _quoteLifetimeSeconds;
      });
      _startQuoteCountdown();
    }
  }

  @override
  void dispose() {
    _quoteTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final lang = context.watch<LanguageService>();

    if (widget.intent.state == PaymentState.completed) {
      return _buildSuccessReceipt(widget.intent, lang);
    }
    if (widget.intent.state == PaymentState.failed) {
      return _buildFailedView(widget.intent, lang);
    }

    return _buildProcessView(widget.intent, lang);
  }

  Widget _buildProcessView(PaymentIntent intent, LanguageService lang) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(32.0),
      child: Column(
        children: [
          _buildStatusHeader(intent),
          const SizedBox(height: 32),
          Text(intent.merchantName.toUpperCase(),
              style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, letterSpacing: 1)),
          const SizedBox(height: 4),
          Text(lang.t('merchant_detected'),
              style: const TextStyle(fontSize: 10, color: Colors.white38, letterSpacing: 1)),
          
          const SizedBox(height: 24),
          if (intent.state == PaymentState.pendingAmount)
            _buildAmountInput(intent, lang)
          else
            _buildAmountDisplay(intent),

          const SizedBox(height: 32),
          if (intent.state == PaymentState.created && intent.amountIdr != "0")
            _buildSettlementTrackPicker(intent, lang)
          else
            const SizedBox.shrink(),

          const SizedBox(height: 24),
          if (intent.state == PaymentState.created && intent.amountIdr != "0")
            _buildActionButtons(intent, lang),

          if (intent.state == PaymentState.authorizationRequested)
            _buildWaitingWallet(intent),

          if (intent.state == PaymentState.awaitingSettlement || intent.state == PaymentState.authorized)
            const Column(
              children: [
                CircularProgressIndicator(color: Color(0xFF00FF94), strokeWidth: 2),
                SizedBox(height: 16),
                Text("Verifying on-chain...", style: TextStyle(color: Colors.white38, fontSize: 12)),
              ],
            ),

          const SizedBox(height: 24),
          if (intent.state != PaymentState.completed)
            TextButton(
                onPressed: widget.onReset,
                child: Text(lang.t('cancel'),
                    style: const TextStyle(color: Colors.white24, fontSize: 12, letterSpacing: 2))),
          
          const SizedBox(height: 32),
          _buildSafetyWarning(lang),
        ],
      ),
    );
  }

  Widget _buildStatusHeader(PaymentIntent intent) {
    String text = "";
    Color color = Colors.white;

    switch (intent.state) {
      case PaymentState.created: text = "READY TO SWAP"; color = Colors.greenAccent; break;
      case PaymentState.pendingAmount: text = "ENTER AMOUNT"; color = Colors.blueAccent; break;
      case PaymentState.authorizationRequested: text = "WAITING FOR WALLET"; color = Colors.amberAccent; break;
      case PaymentState.authorized: text = "AUTHORIZED"; color = Colors.amberAccent; break;
      case PaymentState.awaitingSettlement: text = "SETTLING..."; color = Colors.blueAccent; break;
      default: text = "PROCESSING";
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 16),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Text(text, textAlign: TextAlign.center,
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: color, letterSpacing: 2)),
    );
  }

  Widget _buildAmountDisplay(PaymentIntent intent) {
    final lang = context.read<LanguageService>();
    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.lock, size: 14, color: Colors.greenAccent),
            const SizedBox(width: 8),
            Text('Rp ${intent.amountIdr}',
                style: const TextStyle(fontSize: 32, color: Colors.greenAccent, fontWeight: FontWeight.w900)),
          ],
        ),
        if (intent.estimatedCryptoAmount != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text("~ ${((double.tryParse(intent.estimatedCryptoAmount ?? "0") ?? 0) / 100).toStringAsFixed(2)} IDRX",
                style: const TextStyle(color: Colors.white38, fontSize: 12, fontWeight: FontWeight.bold)),
          ),
        // BUG-023 FIX: Quote expiry countdown
        if (intent.state == PaymentState.created && (intent.amountIdr != '0'))
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: _isRefreshingQuote
                ? Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const SizedBox(width: 12, height: 12,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.amber)),
                      const SizedBox(width: 8),
                      Text(lang.t('refreshing_quote'),
                          style: const TextStyle(color: Colors.amber, fontSize: 11)),
                    ],
                  )
                : Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.timer_outlined, size: 12, color: Colors.white38),
                      const SizedBox(width: 4),
                      Text('${lang.t('quote_expires_in')} ${_quoteSecondsLeft}s',
                          style: TextStyle(
                            color: _quoteSecondsLeft <= 5 ? Colors.redAccent : Colors.white38,
                            fontSize: 11,
                          )),
                    ],
                  ),
          ),
      ],
    );
  }

  Widget _buildAmountInput(PaymentIntent intent, LanguageService lang) {
    return Column(
      children: [
        Text('Rp ${_manualAmount.isEmpty ? "0" : _manualAmount}',
            style: const TextStyle(fontSize: 40, color: Colors.white, fontWeight: FontWeight.bold)),
        const SizedBox(height: 16),
        GridView.count(
          shrinkWrap: true,
          crossAxisCount: 3,
          childAspectRatio: 1.8,
          children: List.generate(12, (index) {
            String val = "";
            if (index < 9) val = "${index + 1}";
            else if (index == 9) val = "CLR";
            else if (index == 10) val = "0";
            else if (index == 11) val = "OK";

            return TextButton(
              onPressed: () {
                setState(() {
                  if (val == "CLR") _manualAmount = "";
                  else if (val == "OK") {
                    if (_manualAmount.isNotEmpty && _manualAmount != "0") {
                      OrchestratorService().setAmount(intent.intentId, _manualAmount);
                      _manualAmount = "";
                    }
                  } else {
                    _manualAmount += val;
                  }
                });
              },
              child: Text(val, style: const TextStyle(color: Colors.white, fontSize: 18)),
            );
          }),
        ),
      ],
    );
  }

  Widget _buildSettlementTrackPicker(PaymentIntent intent, LanguageService lang) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(lang.t('settlement_track'), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w900, color: Colors.white54, letterSpacing: 2)),
        const SizedBox(height: 12),
        _trackOption(id: 'instant', icon: Icons.bolt, title: 'INSTANT', color: Colors.amberAccent, lang: lang),
        const SizedBox(height: 8),
        _trackOption(id: 'standard', icon: Icons.swap_horiz, title: 'STANDARD', color: const Color(0xFF00FF94), isRecommended: true, lang: lang),
        const SizedBox(height: 8),
        _trackOption(id: 'economy', icon: Icons.diamond, title: 'ECONOMY', color: Colors.blueAccent, lang: lang),
      ],
    );
  }

  Widget _trackOption({required String id, required IconData icon, required String title, required Color color, bool isRecommended = false, required LanguageService lang}) {
    final isSelected = widget.settlementTrack == id;
    return GestureDetector(
      onTap: () => widget.onTrackChanged(id),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: isSelected ? color.withOpacity(0.1) : Colors.white.withOpacity(0.03),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: isSelected ? color : Colors.white10),
        ),
        child: Row(
          children: [
            Icon(icon, color: isSelected ? color : Colors.white24, size: 20),
            const SizedBox(width: 12),
            Text(title, style: TextStyle(color: isSelected ? Colors.white : Colors.white38, fontWeight: FontWeight.bold)),
            if (isRecommended) ...[
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(color: color.withOpacity(0.2), borderRadius: BorderRadius.circular(4)),
                child: Text(lang.t('recommended'), style: TextStyle(fontSize: 8, color: color, fontWeight: FontWeight.bold)),
              ),
            ],
            const Spacer(),
            if (isSelected) Icon(Icons.check_circle, color: color, size: 16),
          ],
        ),
      ),
    );
  }

  // BUG-029 FIX: Show confirmation dialog before opening Phantom for signing.
  Future<void> _confirmAndPay(PaymentIntent intent, LanguageService lang) async {
    final idrxAmount = intent.estimatedCryptoAmount != null
        ? ((double.tryParse(intent.estimatedCryptoAmount!) ?? 0) / 100).toStringAsFixed(2)
        : null;

    final confirmed = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF141414),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text(lang.t('confirm_payment'),
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _confirmRow(lang.t('merchant'), intent.merchantName),
            const SizedBox(height: 8),
            _confirmRow(lang.t('amount'), 'Rp ${intent.amountIdr}',
                valueColor: const Color(0xFF00FF94)),
            if (idrxAmount != null) ...[
              const SizedBox(height: 8),
              _confirmRow('IDRX', '≈ $idrxAmount IDRX'),
            ],
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: Colors.redAccent.withOpacity(0.08),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.redAccent.withOpacity(0.2)),
              ),
              child: Text(lang.t('warning_real_money'),
                  style: const TextStyle(color: Colors.redAccent, fontSize: 11,
                      fontWeight: FontWeight.bold)),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(lang.t('cancel'),
                style: const TextStyle(color: Colors.white38)),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF00FF94),
              foregroundColor: Colors.black,
            ),
            child: Text(lang.t('pay_now'),
                style: const TextStyle(fontWeight: FontWeight.w900)),
          ),
        ],
      ),
    );

    if (confirmed == true && mounted) {
      OrchestratorService().requestAuthorization(intent.intentId);
    }
  }

  Widget _confirmRow(String label, String value, {Color? valueColor}) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: const TextStyle(color: Colors.white54, fontSize: 12)),
        Flexible(
          child: Text(value,
              textAlign: TextAlign.right,
              style: TextStyle(
                color: valueColor ?? Colors.white,
                fontWeight: FontWeight.bold,
                fontSize: 13,
              )),
        ),
      ],
    );
  }

  Widget _buildActionButtons(PaymentIntent intent, LanguageService lang) {
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton.icon(
        onPressed: _isRefreshingQuote ? null : () => _confirmAndPay(intent, lang),
        icon: const Icon(Icons.payment, color: Colors.black),
        label: Text(lang.t('pay_now'), style: const TextStyle(color: Colors.black, fontWeight: FontWeight.w900, letterSpacing: 2)),
        style: ElevatedButton.styleFrom(
          backgroundColor: const Color(0xFF00FF94),
          disabledBackgroundColor: Colors.white12,
          padding: const EdgeInsets.symmetric(vertical: 18),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      ),
    );
  }

  Widget _buildWaitingWallet(PaymentIntent intent) {
    return Column(
      children: [
        const LinearProgressIndicator(color: Color(0xFF00FF94), backgroundColor: Colors.white10),
        const SizedBox(height: 16),
        ElevatedButton(
          onPressed: () => OrchestratorService().requestAuthorization(intent.intentId),
          style: ElevatedButton.styleFrom(backgroundColor: Colors.white10, padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12)),
          child: const Text("OPEN WALLET", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        ),
      ],
    );
  }

  Widget _buildSafetyWarning(LanguageService lang) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: Colors.redAccent.withOpacity(0.05), borderRadius: BorderRadius.circular(8), border: Border.all(color: Colors.redAccent.withOpacity(0.1))),
      child: Row(
        children: [
          const Icon(Icons.warning_amber_rounded, color: Colors.redAccent, size: 16),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(lang.t('warning_real_money'), style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.redAccent)),
                Text(lang.t('warning_deduction'), style: TextStyle(fontSize: 9, color: Colors.white.withOpacity(0.4))),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSuccessReceipt(PaymentIntent intent, LanguageService lang) {
    final txHash = intent.settlementReference ?? '';
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        children: [
          const Icon(Icons.check_circle, color: Color(0xFF00FF94), size: 64),
          const SizedBox(height: 16),
          Text(lang.t('payment_success'), style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: Color(0xFF00FF94))),
          const SizedBox(height: 32),
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.03), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white10)),
            child: Column(
              children: [
                Text(intent.merchantName.toUpperCase(), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                const Divider(height: 32, color: Colors.white10),
                Text("Rp ${intent.amountIdr}", style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w900)),
                const SizedBox(height: 24),
                if (txHash.isNotEmpty) ...[
                  Text(lang.t('transaction_hash'), style: const TextStyle(fontSize: 10, color: Colors.white38)),
                  const SizedBox(height: 8),
                  Text(
                    txHash.length > 14
                        ? '${txHash.substring(0, 8)}...${txHash.substring(txHash.length - 6)}'
                        : txHash,
                    style: const TextStyle(fontFamily: 'monospace', color: Color(0xFF00FF94)),
                  ),
                  const SizedBox(height: 16),
                  OutlinedButton(
                    onPressed: () => launchUrl(Uri.parse("https://explorer.solana.com/tx/$txHash?cluster=mainnet-beta")),
                    child: Text(lang.t('explorer')),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 32),
          ElevatedButton(onPressed: widget.onReset, child: Text(lang.t('pay_again'))),
        ],
      ),
    );
  }

  Widget _buildFailedView(PaymentIntent intent, LanguageService lang) {
    return Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.error_outline, color: Colors.redAccent, size: 64),
          const SizedBox(height: 16),
          Text(lang.t('payment_failed'), style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: Colors.redAccent)),
          const SizedBox(height: 48),
          ElevatedButton(onPressed: widget.onReset, child: Text(lang.t('try_again'))),
        ],
      ),
    );
  }
}
