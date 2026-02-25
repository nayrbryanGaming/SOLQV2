import 'package:flutter_test/flutter_test.dart';
import 'package:solq/services/qris_parser.dart';

void main() {
  group('QRIS Parser Verification (Zero-Error Standards)', () {
    test('Should detect correct Merchant Name and static amount', () {
      // Sample static QRIS payload (Mocked with valid CRC)
      const payload = "00020101021126590014ID.CO.QRIS.WWW01189360050300000706050201030302040502125204000053033605802ID5912KEDAI KOPI O6007BANDUNG61054012362070703A016304D12C";
      
      final result = QrisParser.parse(payload);
      
      expect(result.isValid, isTrue);
      expect(result.merchantName, equals("KEDAI KOPI O"));
      expect(result.isStatic, isTrue);
      expect(result.amount, equals("0"));
    });

    test('Should fail on invalid CRC', () {
      // Payload with corrupted CRC (last 4 chars changed)
      const payload = "00020101021126590014ID.CO.QRIS.WWW01189360050300000706050201030302040502125204000053033605802ID5912KEDAI KOPI O6007BANDUNG61054012362070703A0163040000";
      
      final result = QrisParser.parse(payload);
      
      expect(result.isValid, isFalse);
      expect(result.errorReason, contains("CRC ERROR"));
    });
  });
}
