import 'package:flutter_test/flutter_test.dart';

import 'package:solq/main.dart';

void main() {
  test('SOLQ app constructor smoke test', () {
    const app = SOLQApp();
    expect(app, isNotNull);
  });
}

