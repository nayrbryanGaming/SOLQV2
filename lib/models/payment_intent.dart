enum PaymentState {
  CREATED,
  AWAITING_AUTHORIZATION, // Was AWAITING_SIGNATURE
  AUTHORIZED,             // New intermediate state
  AWAITING_SETTLEMENT,    // Was PROCESSING
  COMPLETED,
  FAILED,
  EXPIRED                 // New state for timeout
}

class PaymentIntent {
  final String id;
  final String merchantName;
  final String amount;
  final String acquirer;
  final PaymentState state;
  final DateTime createdAt;
  
  // Regulator-Safe Terminology
  final String? authorizationSignature; // Was signature
  final DateTime? authorizationExpiresAt; // New safety rule
  
  final String? partnerRef;

  PaymentIntent({
    required this.id,
    required this.merchantName,
    required this.amount,
    required this.acquirer,
    required this.state,
    required this.createdAt,
    this.authorizationSignature,
    this.authorizationExpiresAt,
    this.partnerRef,
  });

  bool get isExpired => 
      state != PaymentState.COMPLETED && 
      state != PaymentState.FAILED &&
      authorizationExpiresAt != null && 
      DateTime.now().isAfter(authorizationExpiresAt!);

  PaymentIntent copyWith({
    PaymentState? state,
    String? authorizationSignature,
    DateTime? authorizationExpiresAt,
    String? partnerRef,
  }) {
    return PaymentIntent(
      id: this.id,
      merchantName: this.merchantName,
      amount: this.amount,
      acquirer: this.acquirer,
      state: state ?? this.state,
      createdAt: this.createdAt,
      authorizationSignature: authorizationSignature ?? this.authorizationSignature,
      authorizationExpiresAt: authorizationExpiresAt ?? this.authorizationExpiresAt,
      partnerRef: partnerRef ?? this.partnerRef,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'merchantName': merchantName,
      'amount': amount,
      'acquirer': acquirer,
      'state': state.index,
      'createdAt': createdAt.toIso8601String(),
      'authorizationSignature': authorizationSignature,
      'authorizationExpiresAt': authorizationExpiresAt?.toIso8601String(),
      'partnerRef': partnerRef,
    };
  }

  factory PaymentIntent.fromJson(Map<String, dynamic> json) {
    return PaymentIntent(
      id: json['id'],
      merchantName: json['merchantName'],
      amount: json['amount'],
      acquirer: json['acquirer'],
      state: PaymentState.values[json['state']],
      createdAt: DateTime.parse(json['createdAt']),
      authorizationSignature: json['authorizationSignature'],
      authorizationExpiresAt: json['authorizationExpiresAt'] != null 
          ? DateTime.parse(json['authorizationExpiresAt']) 
          : null,
      partnerRef: json['partnerRef'],
    );
  }
}
