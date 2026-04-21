import 'package:flutter_test/flutter_test.dart';
import 'package:solq/models/payment_intent.dart';

void main() {
  group('PaymentIntent mapping fallback', () {
    test('uses qris translation fields when top-level merchant fields are missing', () {
      final json = <String, dynamic>{
        'id': 'pi_test_001',
        'status': 'CREATED',
        'amount_details': {
          'fiat_amount': '25000',
          'currency_source': 'IDR',
          'crypto_amount': '1.6',
          'quote_id': 'qt_001',
          'rate': 15500,
        },
        'qris_translation': {
          'merchant_name': 'WARUNG MAKMUR',
          'merchant_id': 'ID1022334455667788',
          'merchant_account': '1022334455',
          'bank_code': 'GOPAY',
        },
      };

      final intent = PaymentIntent.fromJson(json);

      expect(intent.merchantName, equals('WARUNG MAKMUR'));
      expect(intent.nmid, equals('ID1022334455667788'));
      expect(intent.merchantAccount, equals('1022334455'));
      expect(intent.bankCode, equals('GOPAY'));
      expect(intent.amountIdr, equals('25000'));
      expect(intent.state, equals(PaymentState.created));
    });
  });
}
