import 'package:flutter_test/flutter_test.dart';
import 'package:solq/services/qris_parser.dart';

String _crc16CcittFalse(String data) {
  var crc = 0xFFFF;
  for (final unit in data.codeUnits) {
    crc ^= (unit << 8) & 0xFFFF;
    for (var bit = 0; bit < 8; bit++) {
      if ((crc & 0x8000) != 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return crc.toRadixString(16).toUpperCase().padLeft(4, '0');
}

String _tlv(String id, String value) {
  final len = value.length.toString().padLeft(2, '0');
  return '$id$len$value';
}

String _buildValidQris({String amount = '0', String merchant = 'KEDAI SOLQ'}) {
  final merchantInfo = [
    _tlv('00', 'ID.CO.QRIS.WWW'),
    _tlv('01', '936005030000087914'),
    _tlv('02', '91300091884403'),
    _tlv('03', 'UMI'),
  ].join();

  final body = [
    _tlv('00', '01'),
    _tlv('01', '11'),
    _tlv('26', merchantInfo),
    _tlv('52', '5499'),
    _tlv('53', '360'),
    _tlv('54', amount),
    _tlv('58', 'ID'),
    _tlv('59', merchant),
    _tlv('60', 'JAKARTA'),
    _tlv('61', '12345'),
    '6304',
  ].join();

  final crc = _crc16CcittFalse(body);
  return '$body$crc';
}

void main() {
  group('QRIS Parser Verification (Zero-Error Standards)', () {
    test('Should detect correct Merchant Name and static amount', () {
      final payload = _buildValidQris(amount: '0', merchant: 'KEDAI SOLQ');
      
      final result = QrisParser.parse(payload);
      
      expect(result.isValid, isTrue);
      expect(result.merchantName, equals('KEDAI SOLQ'));
      expect(result.isStatic, isTrue);
      expect(result.amount, equals('0'));
    });

    test('Should fail on invalid CRC', () {
      final payload = _buildValidQris(amount: '0', merchant: 'KEDAI SOLQ');
      final corrupted = '${payload.substring(0, payload.length - 4)}0000';
      
      final result = QrisParser.parse(corrupted);
      
      expect(result.isValid, isFalse);
      expect(result.errorReason, contains('CRC ERROR'));
    });

    test('Should parse payload with scanner whitespace noise', () {
      final cleanPayload =
          _buildValidQris(amount: '0', merchant: 'KEDAI SOLQ');

      // Common camera/clipboard artifacts: line breaks and extra spaces.
      final noisyPayload =
          '${cleanPayload.substring(0, 60)}\n${cleanPayload.substring(60, 120)}\n${cleanPayload.substring(120)}  ';

      final clean = QrisParser.parse(cleanPayload);
      final noisy = QrisParser.parse(noisyPayload);

      expect(clean.isValid, isTrue);
      expect(noisy.isValid, isTrue);
      expect(noisy.merchantName, equals(clean.merchantName));
      expect(noisy.isStatic, equals(clean.isStatic));
      expect(noisy.amount, equals(clean.amount));
    });

    test('Normalization keeps merchant spaces so CRC remains valid', () {
      final cleanPayload =
          _buildValidQris(amount: '25000', merchant: 'TOKO MAJU JAYA');

      final noisyPayload =
          '\n\t$cleanPayload\r\n';

      final normalized = QrisParser.normalizeScannedPayload(noisyPayload);
      final parsed = QrisParser.parse(normalized);

      expect(normalized, contains('TOKO MAJU JAYA'));
      expect(parsed.isValid, isTrue);
      expect(parsed.merchantName, equals('TOKO MAJU JAYA'));
      expect(parsed.amount, equals('25000'));
    });
  });
}
