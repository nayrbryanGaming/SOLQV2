import 'dart:convert';

enum PaymentState {
  created,
  pendingAmount, // FOR STATIC QRIS
  authorizationRequested,
  authorized,
  awaitingSettlement,
  completed,
  failed,
  expired
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
  final String? bankCode;
  final String? nmid;
  final DateTime createdAt;
  final DateTime updatedAt;
  
  // SAM ALTMAN FEE TRANSPARENCY FIELDS
  final double? effectiveFeePercent;  // Total fee as percentage (for transparency)
  final double? userSavingsVsQris;    // How much user saves vs QRIS
  
  // QRIS PAYLOAD PERSISTENCE
  final String? qrisPayload;

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
    this.bankCode,
    this.nmid,
    required this.createdAt,
    required this.updatedAt,
    this.effectiveFeePercent,
    this.userSavingsVsQris,
    this.qrisPayload,
  });

  bool get isExpired => 
      state != PaymentState.completed && 
      state != PaymentState.failed &&
      authorizationExpiresAt != null && 
      DateTime.now().isAfter(authorizationExpiresAt ?? DateTime.now());

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
    String? bankCode,
    String? nmid,
    DateTime? updatedAt,
    double? effectiveFeePercent,
    double? userSavingsVsQris,
    String? qrisPayload,
  }) {
    return PaymentIntent(
      intentId: intentId,
      merchantName: merchantName,
      amountIdr: amountIdr ?? this.amountIdr,
      currency: currency,
      state: state ?? this.state,
      createdAt: createdAt,
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
      bankCode: bankCode ?? this.bankCode,
      nmid: nmid ?? this.nmid,
      effectiveFeePercent: effectiveFeePercent ?? this.effectiveFeePercent,
      userSavingsVsQris: userSavingsVsQris ?? this.userSavingsVsQris,
      qrisPayload: qrisPayload ?? this.qrisPayload,
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
      'bankCode': bankCode,
      'nmid': nmid,
      'createdAt': createdAt.toIso8601String(),
      'updatedAt': updatedAt.toIso8601String(),
      'effectiveFeePercent': effectiveFeePercent,
      'userSavingsVsQris': userSavingsVsQris,
      'qrisPayload': qrisPayload,
    };
  }

  factory PaymentIntent.fromJson(Map<String, dynamic> json) {
    // Map backend string status to Flutter PaymentState enum
    PaymentState mapState(String? status) {
      if (status == 'CREATED') return PaymentState.created;
      if (status == 'AUTHORIZATION_REQUESTED') return PaymentState.authorizationRequested;
      if (status == 'AUTHORIZED') return PaymentState.authorized;
      if (status == 'AWAITING_SETTLEMENT') return PaymentState.awaitingSettlement;
      if (status == 'COMPLETED') return PaymentState.completed;
      if (status == 'FAILED') return PaymentState.failed;
      return PaymentState.created; // Default
    }

    return PaymentIntent(
      intentId: json['id']?.toString() ?? json['intentId']?.toString() ?? '',
      merchantName: json['merchant']?['name']?.toString() ?? json['merchantName']?.toString() ?? 'SME Merchant',
      amountIdr: json['amount_details']?['fiat_amount']?.toString() ?? json['amountIdr']?.toString() ?? '0',
      currency: json['amount_details']?['currency_source']?.toString() ?? json['currency']?.toString() ?? 'IDR',
      state: json['status'] != null ? mapState(json['status']) : (json['state'] != null ? PaymentState.values[json['state'] as int] : PaymentState.created),
      authorizationExpiresAt: json['authorizationExpiresAt'] != null 
          ? DateTime.parse(json['authorizationExpiresAt']) 
          : null,
      settlementReference: json['tx_hash']?.toString() ?? json['settlement_ref']?.toString() ?? json['settlementReference']?.toString(),
      estimatedCryptoAmount: json['amount_details']?['crypto_amount']?.toString() ?? json['estimatedCryptoAmount']?.toString(),
      quotedRate: json['amount_details']?['rate']?.toDouble() ?? json['quotedRate']?.toDouble(),
      platformFee: json['platformFee']?.toDouble(),
      networkFee: json['networkFee']?.toDouble(),
      slippage: json['slippage']?.toDouble(),
      maxFee: json['maxFee']?.toDouble(),
      merchantAccount: json['merchant_account']?.toString() ?? json['merchantAccount']?.toString(),
      bankCode: json['bank_code']?.toString() ?? json['bankCode']?.toString(),
      nmid: json['nmid']?.toString(),
      createdAt: json['createdAt'] != null ? DateTime.parse(json['createdAt']) : DateTime.now(),
      updatedAt: json['updatedAt'] != null 
          ? DateTime.parse(json['updatedAt']) 
          : DateTime.now(),
      effectiveFeePercent: json['effectiveFeePercent']?.toDouble(),
      userSavingsVsQris: json['userSavingsVsQris']?.toDouble(),
      qrisPayload: json['qris_data'] != null ? jsonEncode(json['qris_data']) : json['qrisPayload']?.toString(),
    );
  }
}

