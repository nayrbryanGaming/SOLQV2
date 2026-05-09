import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/payment_history_service.dart';
import '../services/language_service.dart';

const _kBg      = Color(0xFFFAF9F6);
const _kInk     = Color(0xFF0E0E0C);
const _kInk2    = Color(0xFF3A3A36);
const _kInk3    = Color(0xFF76766E);
const _kLine    = Color(0xFFE6E4DD);
const _kCard    = Color(0xFFFFFFFF);
const _kCardAlt = Color(0xFFF2F0E8);
const _kGreen   = Color(0xFF52A876);
const _kGreenSoft = Color(0xFFEBF5F0);
const _kErr     = Color(0xFFB91C1C);

class PaymentHistoryView extends StatefulWidget {
  const PaymentHistoryView({Key? key}) : super(key: key);

  @override
  State<PaymentHistoryView> createState() => _PaymentHistoryViewState();
}

class _PaymentHistoryViewState extends State<PaymentHistoryView> {
  late Future<List<Map<String, dynamic>>> _historyFuture;

  @override
  void initState() {
    super.initState();
    _refreshHistory();
  }

  void _refreshHistory() {
    setState(() {
      _historyFuture = PaymentHistoryService().getPaymentHistory();
    });
  }

  @override
  Widget build(BuildContext context) {
    final lang = context.watch<LanguageService>();

    return Container(
      color: _kBg,
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(24, 56, 24, 32),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              lang.t('history'),
              style: const TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w700,
                color: _kInk,
                letterSpacing: -0.5,
              ),
            ),
            const SizedBox(height: 24),
            FutureBuilder<List<Map<String, dynamic>>>(
              future: _historyFuture,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(
                    child: Padding(
                      padding: EdgeInsets.all(48),
                      child: CircularProgressIndicator(
                        color: _kInk,
                        strokeWidth: 2,
                      ),
                    ),
                  );
                }

                if (snapshot.hasError) {
                  return Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFEE2E2),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: _kErr.withValues(alpha: 0.2)),
                    ),
                    child: const Text(
                      "Gagal memuat riwayat",
                      style: TextStyle(color: _kErr, fontSize: 13),
                    ),
                  );
                }

                final history = snapshot.data ?? [];

                if (history.isEmpty) {
                  return Padding(
                    padding: const EdgeInsets.symmetric(vertical: 64),
                    child: Center(
                      child: Column(
                        children: [
                          Container(
                            width: 64,
                            height: 64,
                            decoration: const BoxDecoration(
                              color: _kCardAlt,
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(
                              Icons.receipt_long_outlined,
                              size: 30,
                              color: _kInk3,
                            ),
                          ),
                          const SizedBox(height: 16),
                          const Text(
                            "Belum ada pembayaran",
                            style: TextStyle(
                              color: _kInk2,
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 4),
                          const Text(
                            "Transaksi akan muncul di sini",
                            style: TextStyle(color: _kInk3, fontSize: 12),
                          ),
                        ],
                      ),
                    ),
                  );
                }

                return Column(
                  children: [
                    // Summary card
                    Container(
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        color: _kCard,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: _kLine),
                      ),
                      child: Column(
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              const Text(
                                "TOTAL TRANSAKSI",
                                style: TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w700,
                                  color: _kInk3,
                                  letterSpacing: 1.2,
                                ),
                              ),
                              Text(
                                "${history.length}",
                                style: const TextStyle(
                                  fontSize: 20,
                                  fontWeight: FontWeight.w700,
                                  color: _kInk,
                                ),
                              ),
                            ],
                          ),
                          const Divider(height: 20, color: _kLine),
                          FutureBuilder<double>(
                            future: PaymentHistoryService().getTotalAmountPaid(),
                            builder: (context, snapshot) {
                              final total = snapshot.data ?? 0.0;
                              return Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  const Text(
                                    "TOTAL DIBAYAR",
                                    style: TextStyle(
                                      fontSize: 10,
                                      fontWeight: FontWeight.w700,
                                      color: _kInk3,
                                      letterSpacing: 1.2,
                                    ),
                                  ),
                                  Text(
                                    "Rp ${total.toStringAsFixed(0).replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (m) => '${m[1]}.')}",
                                    style: const TextStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.w700,
                                      color: _kInk,
                                    ),
                                  ),
                                ],
                              );
                            },
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 20),

                    ListView.separated(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      itemCount: history.length,
                      separatorBuilder: (context, index) => const SizedBox(height: 8),
                      itemBuilder: (context, index) {
                        final payment = history[index];
                        final merchantName = payment['merchantName'] ?? 'Unknown';
                        final amountIdr = payment['amountIdr'] ?? '0';
                        final bankCode = payment['bankCode'] ?? 'N/A';
                        final createdAt = payment['createdAt'] ?? '';

                        DateTime? parsedDate;
                        try {
                          parsedDate = DateTime.parse(createdAt);
                        } catch (_) {}

                        return Container(
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            color: _kCard,
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: _kLine),
                          ),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Container(
                                width: 36,
                                height: 36,
                                decoration: const BoxDecoration(
                                  color: _kGreenSoft,
                                  shape: BoxShape.circle,
                                ),
                                child: const Icon(Icons.check,
                                    color: _kGreen, size: 18),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      merchantName.toUpperCase(),
                                      style: const TextStyle(
                                        fontSize: 13,
                                        fontWeight: FontWeight.w600,
                                        color: _kInk,
                                      ),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      bankCode,
                                      style: const TextStyle(
                                          fontSize: 11, color: _kInk3),
                                    ),
                                  ],
                                ),
                              ),
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: [
                                  Text(
                                    "Rp ${(double.tryParse(amountIdr.toString()) ?? 0).toStringAsFixed(0).replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (m) => '${m[1]}.')}",
                                    style: const TextStyle(
                                      fontSize: 14,
                                      fontWeight: FontWeight.w700,
                                      color: _kInk,
                                    ),
                                  ),
                                  if (parsedDate != null)
                                    Text(
                                      "${parsedDate.day}/${parsedDate.month}/${parsedDate.year.toString().substring(2)} ${parsedDate.hour.toString().padLeft(2, '0')}:${parsedDate.minute.toString().padLeft(2, '0')}",
                                      style: const TextStyle(
                                          fontSize: 10, color: _kInk3),
                                    ),
                                ],
                              ),
                            ],
                          ),
                        );
                      },
                    ),

                    const SizedBox(height: 32),

                    OutlinedButton.icon(
                      onPressed: () {
                        showDialog(
                          context: context,
                          builder: (context) => AlertDialog(
                            backgroundColor: _kCard,
                            shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(16)),
                            title: const Text("Hapus Riwayat?",
                                style: TextStyle(
                                    color: _kInk, fontWeight: FontWeight.w700)),
                            content: const Text(
                              "Ini tidak bisa dibatalkan.",
                              style: TextStyle(color: _kInk3),
                            ),
                            actions: [
                              TextButton(
                                onPressed: () => Navigator.pop(context),
                                child: const Text("Batal",
                                    style: TextStyle(color: _kInk3)),
                              ),
                              TextButton(
                                onPressed: () {
                                  PaymentHistoryService().clearHistory();
                                  Navigator.pop(context);
                                  _refreshHistory();
                                },
                                child: const Text("Hapus Semua",
                                    style: TextStyle(color: _kErr)),
                              ),
                            ],
                          ),
                        );
                      },
                      icon: const Icon(Icons.delete_outline, color: _kErr, size: 16),
                      label: const Text(
                        "Hapus Riwayat",
                        style: TextStyle(
                            color: _kErr,
                            fontWeight: FontWeight.w600,
                            fontSize: 13),
                      ),
                      style: OutlinedButton.styleFrom(
                        side: const BorderSide(color: _kErr),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 20, vertical: 12),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8)),
                      ),
                    ),
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}
