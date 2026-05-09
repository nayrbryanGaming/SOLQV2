import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/payment_intent.dart';
import '../services/language_service.dart';
import '../services/orchestrator_service.dart';

// Cream design tokens
const _kBg      = Color(0xFFFAF9F6);
const _kInk     = Color(0xFF0E0E0C);
const _kInk2    = Color(0xFF3A3A36);
const _kInk3    = Color(0xFF76766E);
const _kLine    = Color(0xFFE6E4DD);
const _kCard    = Color(0xFFFFFFFF);
const _kCardAlt = Color(0xFFF2F0E8);
const _kGreen   = Color(0xFF52A876);
const _kGreenSoft = Color(0xFFEBF5F0);
const _kWarn    = Color(0xFFD97706);
const _kWarnSoft = Color(0xFFFEF3C7);
const _kErr     = Color(0xFFB91C1C);
const _kErrSoft = Color(0xFFFEE2E2);

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
    return Container(
      color: _kBg,
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(24, 48, 24, 32),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildStatusBadge(intent),
            const SizedBox(height: 28),

            Text(intent.merchantName.toUpperCase(),
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                  color: _kInk,
                  letterSpacing: -0.3,
                )),
            const SizedBox(height: 2),
            Text(lang.t('merchant_detected'),
                style: const TextStyle(fontSize: 11, color: _kInk3, letterSpacing: 0.3)),

            const SizedBox(height: 28),
            Container(
              height: 1,
              color: _kLine,
            ),
            const SizedBox(height: 28),

            if (intent.state == PaymentState.pendingAmount)
              _buildAmountInput(intent, lang)
            else
              _buildAmountDisplay(intent),

            const SizedBox(height: 28),
            if (intent.state == PaymentState.created && intent.amountIdr != "0")
              _buildSettlementTrackPicker(intent, lang),

            const SizedBox(height: 24),
            if (intent.state == PaymentState.created && intent.amountIdr != "0")
              _buildActionButtons(intent, lang),

            if (intent.state == PaymentState.authorizationRequested)
              _buildWaitingWallet(intent),

            if (intent.state == PaymentState.awaitingSettlement ||
                intent.state == PaymentState.authorized)
              const Column(
                children: [
                  LinearProgressIndicator(
                    color: _kGreen,
                    backgroundColor: _kLine,
                  ),
                  SizedBox(height: 16),
                  Text("Verifying on-chain...",
                      style: TextStyle(color: _kInk3, fontSize: 12)),
                ],
              ),

            const SizedBox(height: 24),
            if (intent.state != PaymentState.completed)
              Center(
                child: TextButton(
                  onPressed: widget.onReset,
                  child: Text(lang.t('cancel'),
                      style: const TextStyle(
                          color: _kInk3, fontSize: 12, letterSpacing: 0.5)),
                ),
              ),

            const SizedBox(height: 28),
            _buildSafetyWarning(lang),
          ],
        ),
      ),
    );
  }

  Widget _buildStatusBadge(PaymentIntent intent) {
    String text = "PROCESSING";
    Color bg = _kCardAlt;
    Color fg = _kInk2;

    switch (intent.state) {
      case PaymentState.created:
        text = "READY TO SWAP"; bg = _kGreenSoft; fg = _kGreen; break;
      case PaymentState.pendingAmount:
        text = "ENTER AMOUNT"; bg = const Color(0xFFEFF6FF); fg = const Color(0xFF1D4ED8); break;
      case PaymentState.authorizationRequested:
        text = "WAITING FOR WALLET"; bg = _kWarnSoft; fg = _kWarn; break;
      case PaymentState.authorized:
        text = "AUTHORIZED"; bg = _kWarnSoft; fg = _kWarn; break;
      case PaymentState.awaitingSettlement:
        text = "SETTLING..."; bg = const Color(0xFFEFF6FF); fg = const Color(0xFF1D4ED8); break;
      default: break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: fg.withValues(alpha: 0.25)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(color: fg, shape: BoxShape.circle),
          ),
          const SizedBox(width: 8),
          Text(text,
              style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: fg,
                  letterSpacing: 0.8)),
        ],
      ),
    );
  }

  Widget _buildAmountDisplay(PaymentIntent intent) {
    final lang = context.read<LanguageService>();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('AMOUNT',
            style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700,
                color: _kInk3, letterSpacing: 1.5)),
        const SizedBox(height: 6),
        Row(
          crossAxisAlignment: CrossAxisAlignment.baseline,
          textBaseline: TextBaseline.alphabetic,
          children: [
            const Icon(Icons.lock_outline, size: 14, color: _kGreen),
            const SizedBox(width: 6),
            Text('Rp ${intent.amountIdr}',
                style: const TextStyle(
                  fontSize: 36,
                  color: _kInk,
                  fontWeight: FontWeight.w700,
                  letterSpacing: -1,
                )),
          ],
        ),
        if (intent.estimatedCryptoAmount != null)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(
              "≈ ${((double.tryParse(intent.estimatedCryptoAmount ?? "0") ?? 0) / 100).toStringAsFixed(2)} IDRX",
              style: const TextStyle(color: _kInk3, fontSize: 13, fontWeight: FontWeight.w500),
            ),
          ),
        if (intent.state == PaymentState.created && (intent.amountIdr != '0'))
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: _isRefreshingQuote
                ? Row(children: [
                    const SizedBox(width: 12, height: 12,
                        child: CircularProgressIndicator(strokeWidth: 2, color: _kWarn)),
                    const SizedBox(width: 8),
                    Text(lang.t('refreshing_quote'),
                        style: const TextStyle(color: _kWarn, fontSize: 11)),
                  ])
                : Row(children: [
                    const Icon(Icons.timer_outlined, size: 12, color: _kInk3),
                    const SizedBox(width: 4),
                    Text('${lang.t('quote_expires_in')} ${_quoteSecondsLeft}s',
                        style: TextStyle(
                          color: _quoteSecondsLeft <= 5 ? _kErr : _kInk3,
                          fontSize: 11,
                        )),
                  ]),
          ),
      ],
    );
  }

  Widget _buildAmountInput(PaymentIntent intent, LanguageService lang) {
    return Column(
      children: [
        Text('Rp ${_manualAmount.isEmpty ? "0" : _manualAmount}',
            style: const TextStyle(fontSize: 40, color: _kInk, fontWeight: FontWeight.w700)),
        const SizedBox(height: 16),
        GridView.count(
          shrinkWrap: true,
          crossAxisCount: 3,
          childAspectRatio: 1.8,
          children: List.generate(12, (index) {
            String val = "";
            if (index < 9) {
              val = "${index + 1}";
            } else if (index == 9) {
              val = "CLR";
            } else if (index == 10) {
              val = "0";
            } else if (index == 11) {
              val = "OK";
            }
            return TextButton(
              onPressed: () {
                setState(() {
                  if (val == "CLR") {
                    _manualAmount = "";
                  } else if (val == "OK") {
                    if (_manualAmount.isNotEmpty && _manualAmount != "0") {
                      OrchestratorService().setAmount(intent.intentId, _manualAmount);
                      _manualAmount = "";
                    }
                  } else {
                    _manualAmount += val;
                  }
                });
              },
              child: Text(val, style: const TextStyle(color: _kInk, fontSize: 18, fontWeight: FontWeight.w500)),
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
        Text(lang.t('settlement_track'),
            style: const TextStyle(
                fontSize: 10, fontWeight: FontWeight.w700, color: _kInk3, letterSpacing: 1.5)),
        const SizedBox(height: 12),
        _trackOption(id: 'instant', icon: Icons.bolt, title: 'INSTANT',
            fgColor: _kWarn, bgColor: _kWarnSoft, lang: lang),
        const SizedBox(height: 8),
        _trackOption(id: 'standard', icon: Icons.swap_horiz, title: 'STANDARD',
            fgColor: _kGreen, bgColor: _kGreenSoft, isRecommended: true, lang: lang),
        const SizedBox(height: 8),
        _trackOption(id: 'economy', icon: Icons.diamond_outlined, title: 'ECONOMY',
            fgColor: const Color(0xFF1D4ED8), bgColor: const Color(0xFFEFF6FF), lang: lang),
      ],
    );
  }

  Widget _trackOption({
    required String id,
    required IconData icon,
    required String title,
    required Color fgColor,
    required Color bgColor,
    bool isRecommended = false,
    required LanguageService lang,
  }) {
    final isSelected = widget.settlementTrack == id;
    return GestureDetector(
      onTap: () => widget.onTrackChanged(id),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: isSelected ? bgColor : _kCard,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: isSelected ? fgColor.withValues(alpha: 0.4) : _kLine),
        ),
        child: Row(
          children: [
            Icon(icon, color: isSelected ? fgColor : _kInk3, size: 18),
            const SizedBox(width: 12),
            Text(title,
                style: TextStyle(
                    color: isSelected ? _kInk : _kInk2,
                    fontWeight: FontWeight.w600,
                    fontSize: 13)),
            if (isRecommended) ...[
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                    color: fgColor.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(4)),
                child: Text(lang.t('recommended'),
                    style: TextStyle(
                        fontSize: 9, color: fgColor, fontWeight: FontWeight.w700)),
              ),
            ],
            const Spacer(),
            if (isSelected)
              Icon(Icons.check_circle, color: fgColor, size: 16)
            else
              Container(
                width: 16,
                height: 16,
                decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(color: _kLine, width: 1.5)),
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _confirmAndPay(PaymentIntent intent, LanguageService lang) async {
    final idrxAmount = intent.estimatedCryptoAmount != null
        ? ((double.tryParse(intent.estimatedCryptoAmount!) ?? 0) / 100).toStringAsFixed(2)
        : null;

    final confirmed = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        backgroundColor: _kCard,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text(lang.t('confirm_payment'),
            style: const TextStyle(color: _kInk, fontWeight: FontWeight.w700)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _confirmRow(lang.t('merchant'), intent.merchantName),
            const SizedBox(height: 8),
            _confirmRow(lang.t('amount'), 'Rp ${intent.amountIdr}',
                valueColor: _kGreen),
            if (idrxAmount != null) ...[
              const SizedBox(height: 8),
              _confirmRow('IDRX', '≈ $idrxAmount IDRX'),
            ],
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: _kErrSoft,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: _kErr.withValues(alpha: 0.2)),
              ),
              child: Text(lang.t('warning_real_money'),
                  style: const TextStyle(
                      color: _kErr, fontSize: 11, fontWeight: FontWeight.w600)),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(lang.t('cancel'),
                style: const TextStyle(color: _kInk3)),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: _kInk,
              foregroundColor: const Color(0xFFFAF9F6),
              elevation: 0,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
            child: Text(lang.t('pay_now'),
                style: const TextStyle(fontWeight: FontWeight.w700)),
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
        Text(label, style: const TextStyle(color: _kInk3, fontSize: 12)),
        Flexible(
          child: Text(value,
              textAlign: TextAlign.right,
              style: TextStyle(
                color: valueColor ?? _kInk,
                fontWeight: FontWeight.w600,
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
        icon: const Icon(Icons.payment),
        label: Text(lang.t('pay_now'),
            style: const TextStyle(fontWeight: FontWeight.w700, letterSpacing: 0.5)),
        style: ElevatedButton.styleFrom(
          backgroundColor: _kInk,
          foregroundColor: const Color(0xFFFAF9F6),
          disabledBackgroundColor: _kLine,
          padding: const EdgeInsets.symmetric(vertical: 18),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          elevation: 0,
        ),
      ),
    );
  }

  Widget _buildWaitingWallet(PaymentIntent intent) {
    return Column(
      children: [
        const LinearProgressIndicator(color: _kGreen, backgroundColor: _kLine),
        const SizedBox(height: 16),
        OutlinedButton(
          onPressed: () => OrchestratorService().requestAuthorization(intent.intentId),
          style: OutlinedButton.styleFrom(
            foregroundColor: _kInk,
            side: const BorderSide(color: _kLine),
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          ),
          child: const Text("OPEN WALLET",
              style: TextStyle(fontWeight: FontWeight.w700, letterSpacing: 1)),
        ),
      ],
    );
  }

  Widget _buildSafetyWarning(LanguageService lang) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
          color: _kErrSoft,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: _kErr.withValues(alpha: 0.15))),
      child: Row(
        children: [
          const Icon(Icons.warning_amber_rounded, color: _kErr, size: 16),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(lang.t('warning_real_money'),
                    style: const TextStyle(
                        fontSize: 10, fontWeight: FontWeight.w700, color: _kErr)),
                Text(lang.t('warning_deduction'),
                    style: TextStyle(
                        fontSize: 9, color: _kErr.withValues(alpha: 0.7))),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSuccessReceipt(PaymentIntent intent, LanguageService lang) {
    final txHash = intent.settlementReference ?? '';
    return Container(
      color: _kBg,
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            const SizedBox(height: 40),
            Container(
              width: 64,
              height: 64,
              decoration: const BoxDecoration(color: _kGreenSoft, shape: BoxShape.circle),
              child: const Icon(Icons.check, color: _kGreen, size: 32),
            ),
            const SizedBox(height: 16),
            Text(lang.t('payment_success'),
                style: const TextStyle(
                    fontSize: 20, fontWeight: FontWeight.w700, color: _kInk)),
            const SizedBox(height: 32),
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: _kCard,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: _kLine),
              ),
              child: Column(
                children: [
                  Text(intent.merchantName.toUpperCase(),
                      style: const TextStyle(
                          fontSize: 15, fontWeight: FontWeight.w700, color: _kInk)),
                  const Divider(height: 28, color: _kLine),
                  Text("Rp ${intent.amountIdr}",
                      style: const TextStyle(
                          fontSize: 32, fontWeight: FontWeight.w700, color: _kInk)),
                  const SizedBox(height: 24),
                  if (txHash.isNotEmpty) ...[
                    Text(lang.t('transaction_hash'),
                        style: const TextStyle(fontSize: 10, color: _kInk3)),
                    const SizedBox(height: 8),
                    Text(
                      txHash.length > 14
                          ? '${txHash.substring(0, 8)}...${txHash.substring(txHash.length - 6)}'
                          : txHash,
                      style: const TextStyle(
                          fontFamily: 'JetBrainsMono', color: _kGreen, fontSize: 13),
                    ),
                    const SizedBox(height: 16),
                    OutlinedButton(
                      onPressed: () => launchUrl(Uri.parse(
                          "https://explorer.solana.com/tx/$txHash?cluster=mainnet-beta")),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: _kInk,
                        side: const BorderSide(color: _kLine),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8)),
                      ),
                      child: Text(lang.t('explorer')),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 32),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: widget.onReset,
                style: ElevatedButton.styleFrom(
                  backgroundColor: _kInk,
                  foregroundColor: const Color(0xFFFAF9F6),
                  elevation: 0,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                ),
                child: Text(lang.t('pay_again'),
                    style: const TextStyle(fontWeight: FontWeight.w600)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFailedView(PaymentIntent intent, LanguageService lang) {
    return Container(
      color: _kBg,
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: const BoxDecoration(color: _kErrSoft, shape: BoxShape.circle),
              child: const Icon(Icons.close, color: _kErr, size: 32),
            ),
            const SizedBox(height: 16),
            Text(lang.t('payment_failed'),
                style: const TextStyle(
                    fontSize: 20, fontWeight: FontWeight.w700, color: _kInk)),
            const SizedBox(height: 48),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: widget.onReset,
                style: ElevatedButton.styleFrom(
                  backgroundColor: _kInk,
                  foregroundColor: const Color(0xFFFAF9F6),
                  elevation: 0,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                ),
                child: Text(lang.t('try_again'),
                    style: const TextStyle(fontWeight: FontWeight.w600)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
