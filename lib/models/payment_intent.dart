enum PaymentState {
  CREATED,
  PENDING_AMOUNT, // FOR STATIC QRIS
  AUTHORIZATION_REQUESTED,
  AUTHORIZED,
  AWAITING_SETTLEMENT,
  COMPLETED,
  FAILED,
  EXPIRED
}

class PaymentIntent {
  final String intentId;
  final String merchantName;
  final String amountIdr;
  final String currency;
  final PaymentState state;
  final DateTime? authorizationExpiresAt;
  final String? settlementReference;
  final String? estimatedCryptoAmount;
  final double? quotedRate;
  final double? platformFee;
  final double? networkFee;
  final double? slippage;
  final double? maxFee;
  final String? merchantAccount;
  final DateTime createdAt;
  final DateTime updatedAt;

  PaymentIntent({
    required this.intentId,
    required this.merchantName,
    required this.amountIdr,
    this.currency = 'IDR',
    required this.state,
    this.authorizationExpiresAt,
    this.settlementReference,
    this.estimatedCryptoAmount,
    this.quotedRate,
    this.platformFee,
    this.networkFee,
    this.slippage,
    this.maxFee,
    this.merchantAccount,
    required this.createdAt,
    required this.updatedAt,
  });

  bool get isExpired => 
      state != PaymentState.COMPLETED && 
      state != PaymentState.FAILED &&
      authorizationExpiresAt != null && 
      DateTime.now().isAfter(authorizationExpiresAt!);

  PaymentIntent copyWith({
    PaymentState? state,
    String? amountIdr,
    String? estimatedCryptoAmount,
    double? quotedRate,
    double? platformFee,
    double? networkFee,
    double? slippage,
    double? maxFee,
    DateTime? authorizationExpiresAt,
    String? settlementReference,
    String? merchantAccount,
    DateTime? updatedAt,
  }) {
    return PaymentIntent(
      intentId: this.intentId,
      merchantName: this.merchantName,
      amountIdr: amountIdr ?? this.amountIdr,
      currency: this.currency,
      state: state ?? this.state,
      createdAt: this.createdAt,
      updatedAt: updatedAt ?? DateTime.now(),
      authorizationExpiresAt: authorizationExpiresAt ?? this.authorizationExpiresAt,
      settlementReference: settlementReference ?? this.settlementReference,
      estimatedCryptoAmount: estimatedCryptoAmount ?? this.estimatedCryptoAmount,
      quotedRate: quotedRate ?? this.quotedRate,
      platformFee: platformFee ?? this.platformFee,
      networkFee: networkFee ?? this.networkFee,
      slippage: slippage ?? this.slippage,
      maxFee: maxFee ?? this.maxFee,
      merchantAccount: merchantAccount ?? this.merchantAccount,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'intentId': intentId,
      'merchantName': merchantName,
      'amountIdr': amountIdr,
      'currency': currency,
      'state': state.index,
      'authorizationExpiresAt': authorizationExpiresAt?.toIso8601String(),
      'settlementReference': settlementReference,
      'estimatedCryptoAmount': estimatedCryptoAmount,
      'quotedRate': quotedRate,
      'platformFee': platformFee,
      'networkFee': networkFee,
      'slippage': slippage,
      'maxFee': maxFee,
      'merchantAccount': merchantAccount,
      'createdAt': createdAt.toIso8601String(),
      'updatedAt': updatedAt.toIso8601String(),
    };
  }

  factory PaymentIntent.fromJson(Map<String, dynamic> json) {
    return PaymentIntent(
      intentId: json['intentId'],
      merchantName: json['merchantName'],
      amountIdr: json['amountIdr'],
      currency: json['currency'] ?? 'IDR',
      state: PaymentState.values[json['state']],
      authorizationExpiresAt: json['authorizationExpiresAt'] != null 
          ? DateTime.parse(json['authorizationExpiresAt']) 
          : null,
      settlementReference: json['settlementReference'],
      estimatedCryptoAmount: json['estimatedCryptoAmount'],
      quotedRate: json['quotedRate'],
      platformFee: json['platformFee'],
      networkFee: json['networkFee'],
      slippage: json['slippage'],
      maxFee: json['maxFee'],
      merchantAccount: json['merchantAccount'],
      createdAt: DateTime.parse(json['createdAt']),
      updatedAt: json['updatedAt'] != null 
          ? DateTime.parse(json['updatedAt']) 
          : DateTime.parse(json['createdAt']),
    );
  }
}
