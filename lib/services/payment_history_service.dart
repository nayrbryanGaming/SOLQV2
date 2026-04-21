import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import '../models/payment_intent.dart';

class PaymentHistoryService {
  static final PaymentHistoryService _instance = PaymentHistoryService._internal();
  factory PaymentHistoryService() => _instance;
  PaymentHistoryService._internal();

  static const _storageKey = 'solq_payment_history';

  /// Save a completed payment to history
  Future<void> addPaymentToHistory(PaymentIntent payment) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final historyJson = prefs.getString(_storageKey) ?? '[]';
      final historyList = jsonDecode(historyJson) as List<dynamic>;

      // Create a simplified payment record
      final paymentRecord = {
        'intentId': payment.intentId,
        'merchantName': payment.merchantName,
        'amountIdr': payment.amountIdr,
        'bankCode': payment.bankCode,
        'nmid': payment.nmid,
        'settlementReference': payment.settlementReference,
        'createdAt': payment.createdAt.toIso8601String(),
        'status': 'COMPLETED',
      };

      // Add to front of list (newest first)
      historyList.insert(0, paymentRecord);

      // Keep only last 50 payments in device storage
      if (historyList.length > 50) {
        historyList.removeRange(50, historyList.length);
      }

      await prefs.setString(_storageKey, jsonEncode(historyList));
    } catch (e) {
      debugPrint('[PaymentHistory] Error saving payment: $e');
    }
  }

  /// Get all payment history
  Future<List<Map<String, dynamic>>> getPaymentHistory() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final historyJson = prefs.getString(_storageKey) ?? '[]';
      final historyList = jsonDecode(historyJson) as List<dynamic>;
      return historyList.map((item) => Map<String, dynamic>.from(item as Map)).toList();
    } catch (e) {
      debugPrint('[PaymentHistory] Error retrieving history: $e');
      return [];
    }
  }

  /// Clear all history
  Future<void> clearHistory() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_storageKey);
    } catch (e) {
      debugPrint('[PaymentHistory] Error clearing history: $e');
    }
  }

  /// Get count of payments
  Future<int> getPaymentCount() async {
    final history = await getPaymentHistory();
    return history.length;
  }

  /// Get total amount paid
  Future<double> getTotalAmountPaid() async {
    final history = await getPaymentHistory();
    double total = 0;
    for (final payment in history) {
      try {
        total += double.parse(payment['amountIdr']?.toString() ?? '0');
      } catch (_) {}
    }
    return total;
  }
}
