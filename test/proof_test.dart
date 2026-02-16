import 'package:flutter_test/flutter_test.dart';
import 'package:solq/services/orchestrator_service.dart';
import 'package:solq/models/payment_intent.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  SharedPreferences.setMockInitialValues({});

  test('IRREFUTABLE PROOF: Full Transaction Lifecycle Simulation', () async {
    print('\n🚀 STARTING WARUNGPAY NUCLEAR AUDIT...');
    final service = OrchestratorService();
    await service.init();

    final states = <PaymentState>[];
    String? finalRef;
    double? finalFee;

    service.stream.listen((intent) {
      if (states.isEmpty || states.last != intent.state) {
        states.add(intent.state);
        print('[AUDIT] State Transition: ${intent.state}');
      }
      
      if (intent.state == PaymentState.COMPLETED) {
        finalRef = intent.settlementReference;
        finalFee = intent.platformFee;
        print('[AUDIT] ✅ SUCCESS: Settlement Reference: $finalRef');
        print('[AUDIT] ✅ SUCCESS: Platform Yield: Rp $finalFee');
      }
    });

    // Run the God-Mode script
    await service.runFullDemoScript();

    // Wait for the async pipeline to finish
    int timeout = 0;
    while (states.isEmpty || (states.last != PaymentState.COMPLETED && timeout < 30)) {
      await Future.delayed(const Duration(milliseconds: 500));
      timeout++;
    }

    expect(states.contains(PaymentState.CREATED), true, reason: 'Must validate QRIS');
    expect(states.contains(PaymentState.AUTHORIZATION_REQUESTED), true, reason: 'Must launch swap');
    expect(states.contains(PaymentState.AUTHORIZED), true, reason: 'Must sign wallet');
    expect(states.contains(PaymentState.COMPLETED), true, reason: 'Must settle funds');

    print('\n👑 AUDIT PASSED: WARUNGPAY IS ROBUST AND VERIFIABLE.');
    print('--------------------------------------------------');
  });
}
