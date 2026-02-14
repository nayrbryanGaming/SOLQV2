import 'dart:async';
import 'package:uuid/uuid.dart';

/// SIMULATED PARTNER API (e.g. Midtrans / Xendit / Oy!)
/// This represents the "Real World" Settlement Rail.
/// WarungPay does NOT settle. WarungPay REQUESTS settlement here.

class SettlementResult {
  final bool success;
  final String referenceId;
  final String status;
  final DateTime timestamp;

  SettlementResult({
    required this.success,
    required this.referenceId,
    required this.status,
    required this.timestamp,
  });
}

class PartnerService {
  // Singleton
  static final PartnerService _instance = PartnerService._internal();
  factory PartnerService() => _instance;
  PartnerService._internal();

  /// INITIATE SETTLEMENT (Disbursement)
  /// Input: Intent ID, Amount, Destination (Acquirer)
  /// Output: Partner Reference ID
  Future<SettlementResult> initiateSettlement({
    required String intentId, 
    required String amountIdr, 
    required String destinationAcquirer
  }) async {
    print("[PARTNER API] Request Received: $intentId -> $amountIdr to $destinationAcquirer");
    
    // Simulate Network Latency (Real HTTP call would go here)
    await Future.delayed(const Duration(seconds: 3));

    // REAL SYSTEM BEHAVIOR: 
    // We send the request. The Partner says "Received, processing".
    // We DO NOT get "COMPLETED" immediately. We get "PENDING".
    // The Webhook (which you must trigger) will finalize it.
    
    print("[PARTNER API] Disbursement Requested. Status: PENDING");

    return SettlementResult(
      success: true,
      referenceId: "REQ-PENDING-${const Uuid().v4().substring(0, 8)}",
      status: "PENDING", // WAITING FOR WEBHOOK
      timestamp: DateTime.now(),
    );
  }
}
