import 'package:flutter/material.dart';
import '../services/payment_history_service.dart';

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
    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 40),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            "RIWAYAT PEMBAYARAN",
            style: TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w900,
              color: Color(0xFF00FF94),
              letterSpacing: 2,
            ),
          ),
          const SizedBox(height: 24),
          FutureBuilder<List<Map<String, dynamic>>>(
            future: _historyFuture,
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const Center(
                  child: CircularProgressIndicator(color: Color(0xFF00FF94)),
                );
              }

              if (snapshot.hasError) {
                return Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.redAccent.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.redAccent.withValues(alpha: 0.3)),
                  ),
                  child: const Text(
                    "Gagal memuat riwayat",
                    style: TextStyle(color: Colors.redAccent),
                  ),
                );
              }

              final history = snapshot.data ?? [];

              if (history.isEmpty) {
                return Container(
                  padding: const EdgeInsets.all(40),
                  child: const Center(
                    child: Column(
                      children: [
                        Icon(Icons.history_outlined, size: 60, color: Colors.white24),
                        SizedBox(height: 16),
                        Text(
                          "BELUM ADA PEMBAYARAN",
                          style: TextStyle(
                            color: Colors.white38,
                            fontSize: 14,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              }

              return Column(
                children: [
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: const Color(0xFF00FF94).withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: const Color(0xFF00FF94).withValues(alpha: 0.3)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Text(
                              "TOTAL TRANSAKSI",
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.bold,
                                color: Color(0xFF00FF94),
                                letterSpacing: 1,
                              ),
                            ),
                            Text(
                              "${history.length}",
                              style: const TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.w900,
                                color: Color(0xFF00FF94),
                              ),
                            ),
                          ],
                        ),
                        const Divider(height: 16, color: Colors.white10),
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
                                    fontSize: 12,
                                    fontWeight: FontWeight.bold,
                                    color: Colors.blueAccent,
                                    letterSpacing: 1,
                                  ),
                                ),
                                Text(
                                  "Rp ${total.toStringAsFixed(0).replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (m) => '${m[1]}.')}",
                                  style: const TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w900,
                                    color: Colors.blueAccent,
                                  ),
                                ),
                              ],
                            );
                          },
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),
                  ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: history.length,
                    separatorBuilder: (context, index) => const SizedBox(height: 12),
                    itemBuilder: (context, index) {
                      final payment = history[index];
                      final merchantName = payment['merchantName'] ?? 'Unknown Merchant';
                      final amountIdr = payment['amountIdr'] ?? '0';
                      final bankCode = payment['bankCode'] ?? 'N/A';
                      final nmid = payment['nmid'] ?? 'N/A';
                      final createdAt = payment['createdAt'] ?? '';

                      // Parse date
                      DateTime? parsedDate;
                      try {
                        parsedDate = DateTime.parse(createdAt);
                      } catch (_) {}

                      return Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.05),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: Colors.white10),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        merchantName.toUpperCase(),
                                        style: const TextStyle(
                                          fontSize: 13,
                                          fontWeight: FontWeight.bold,
                                          color: Colors.white,
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                        maxLines: 1,
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        "$bankCode | NMID: $nmid",
                                        style: const TextStyle(
                                          fontSize: 10,
                                          color: Colors.blueAccent,
                                          fontWeight: FontWeight.w600,
                                        ),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ],
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.end,
                                  children: [
                                    Text(
                                      "Rp ${(double.tryParse(amountIdr.toString()) ?? 0).toStringAsFixed(0).replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (m) => '${m[1]}.')}",
                                      style: const TextStyle(
                                        fontSize: 13,
                                        fontWeight: FontWeight.w900,
                                        color: Color(0xFF00FF94),
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                    if (parsedDate != null)
                                      Text(
                                        "${parsedDate.day}/${parsedDate.month}/${parsedDate.year.toString().substring(2)} ${parsedDate.hour.toString().padLeft(2, '0')}:${parsedDate.minute.toString().padLeft(2, '0')}",
                                        style: const TextStyle(
                                          fontSize: 9,
                                          color: Colors.white38,
                                        ),
                                      ),
                                  ],
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            const Icon(
                              Icons.check_circle,
                              size: 12,
                              color: Color(0xFF00FF94),
                            ),
                            const SizedBox(width: 4),
                            const Text(
                              "BERHASIL",
                              style: TextStyle(
                                fontSize: 9,
                                color: Color(0xFF00FF94),
                                fontWeight: FontWeight.bold,
                                letterSpacing: 1,
                              ),
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
                          title: const Text("HAPUS RIWAYAT?"),
                          backgroundColor: const Color(0xFF1A1A1A),
                          titleTextStyle: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                          content: const Text(
                            "Ini tidak bisa dibatalkan.",
                            style: TextStyle(color: Colors.white70),
                          ),
                          actions: [
                            TextButton(
                              onPressed: () => Navigator.pop(context),
                              child: const Text("BATAL"),
                            ),
                            TextButton(
                              onPressed: () {
                                PaymentHistoryService().clearHistory();
                                Navigator.pop(context);
                                _refreshHistory();
                              },
                              child: const Text("HAPUS SEMUA", style: TextStyle(color: Colors.redAccent)),
                            ),
                          ],
                        ),
                      );
                    },
                    icon: const Icon(Icons.delete_outline, color: Colors.redAccent),
                    label: const Text(
                      "HAPUS RIWAYAT",
                      style: TextStyle(color: Colors.redAccent, fontWeight: FontWeight.bold, letterSpacing: 1),
                    ),
                    style: OutlinedButton.styleFrom(
                      side: const BorderSide(color: Colors.redAccent),
                      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                    ),
                  ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}
