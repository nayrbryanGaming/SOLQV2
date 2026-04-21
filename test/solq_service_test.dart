import 'package:flutter_test/flutter_test.dart';
import 'package:solq/services/solq_service.dart';

void main() {
  group('SOLQService cloud-only endpoint policy', () {
    test('maps custom domain to working api host', () {
      final normalized = SOLQService.normalizeCloudBaseUrl('solq.my.id');
      expect(normalized, equals('https://solq.vercel.app/api/v1'));
    });

    test('keeps valid https api/v1 endpoint', () {
      final normalized = SOLQService.normalizeCloudBaseUrl('https://solq.vercel.app/api/v1');
      expect(normalized, equals('https://solq.vercel.app/api/v1'));
    });

    test('normalizes /api endpoint into /api/v1', () {
      final normalized = SOLQService.normalizeCloudBaseUrl('https://solq.vercel.app/api');
      expect(normalized, equals('https://solq.vercel.app/api/v1'));
    });

    test('normalizes bare host into /api/v1', () {
      final normalized = SOLQService.normalizeCloudBaseUrl('https://solq.vercel.app');
      expect(normalized, equals('https://solq.vercel.app/api/v1'));
    });

    test('rejects localhost endpoint', () {
      expect(
        () => SOLQService.normalizeCloudBaseUrl('https://localhost:3000/v1'),
        throwsA(isA<FormatException>()),
      );
    });

    test('rejects private ip endpoint', () {
      expect(
        () => SOLQService.normalizeCloudBaseUrl('https://192.168.1.5/v1'),
        throwsA(isA<FormatException>()),
      );
    });

    test('rejects non-https endpoint', () {
      expect(
        () => SOLQService.normalizeCloudBaseUrl('http://solq.vercel.app/api/v1'),
        throwsA(isA<FormatException>()),
      );
    });
  });
}
