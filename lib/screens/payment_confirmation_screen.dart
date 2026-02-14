import 'dart:async';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../services/warungpay_service.dart';

class PaymentConfirmationScreen extends StatefulWidget {
  final Map<String, dynamic> paymentIntent;

  const PaymentConfirmationScreen({Key? key, required this.paymentIntent}) : super(key: key);

  @override
  State<PaymentConfirmationScreen> createState() => _PaymentConfirmationScreenState();
}

class _PaymentConfirmationScreenState extends State<PaymentConfirmationScreen> {
  final WarungPayService _service = WarungPayService();
  bool _isProcessing = false;
  String _status = 'Requires Payment';
  Timer? _pollingTimer;

  @override
  void dispose() {
    _pollingTimer?.cancel();
    super.dispose();
  }

  void _startPolling(String id) {
    _pollingTimer = Timer.periodic(const Duration(seconds: 2), (timer) async {
      try {
        final intent = await _service.getPaymentIntentStatus(id);
        setState(() {
          _status = intent['status'];
        });

        if (_status == 'completed' || _status == 'failed') {
          timer.cancel();
          setState(() => _isProcessing = false);
          
          if (_status == 'completed') {
            _showSuccessDialog();
          }
        }
      } catch (e) {
        print("Polling error: $e");
      }
    });
  }

  void _confirmPayment() async {
    setState(() {
      _isProcessing = true;
      _status = 'Processing...';
    });

    try {
      final id = widget.paymentIntent['id'];
      // Mock TX Hash
      final txHash = "sol_tx_${DateTime.now().millisecondsSinceEpoch}";
      
      await _service.confirmPayment(id, txHash);
      _startPolling(id);

    } catch (e) {
      setState(() => _isProcessing = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: ${e.toString()}')),
      );
    }
  }

  void _showSuccessDialog() {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        title: const Icon(Icons.check_circle, color: Colors.green, size: 60),
        content: const Text(
            'Payment Successful!\n\nRupiah has been sent to the Merchant\'s QRIS Wallet.',
            textAlign: TextAlign.center,
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.of(context).popUntil((route) => route.isFirst);
            },
            child: const Text('DONE'),
          )
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final merchant = widget.paymentIntent['merchant'];
    final amountDetails = widget.paymentIntent['amount_details'];
    final fiatAmount = amountDetails['fiat_amount'];
    final currency = amountDetails['currency_source'];
    final currencyFormatter = NumberFormat.currency(locale: 'id_ID', symbol: 'Rp ', decimalDigits: 0);

    return Scaffold(
      appBar: AppBar(title: const Text('Confirm Payment')),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Merchant Info Card
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  children: [
                    Text(
                      merchant['name'] ?? 'Unknown Merchant',
                      style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
                    ),
                    Text(merchant['city'] ?? ''),
                    const SizedBox(height: 10),
                    Text(
                      currencyFormatter.format(fiatAmount),
                      style: const TextStyle(fontSize: 32, fontWeight: FontWeight.bold, color: Colors.green),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 32),
            
            // Payment Method
            ListTile(
              leading: const Icon(Icons.account_balance_wallet, color: Colors.blue),
              title: const Text('Pay with'),
              subtitle: Text(currency, style: const TextStyle(fontWeight: FontWeight.bold)),
              trailing: const Icon(Icons.arrow_forward_ios, size: 16),
            ),
            
            const Spacer(),
            
            // Status Indicator
            if (_isProcessing)
              Column(
                children: [
                   const CircularProgressIndicator(),
                   const SizedBox(height: 16),
                   Text('Status: $_status', style: const TextStyle(fontSize: 16)),
                   const SizedBox(height: 16),
                ],
              ),

            ElevatedButton(
              onPressed: _isProcessing ? null : _confirmPayment,
              style: ElevatedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 16),
                backgroundColor: Colors.blue[800],
                foregroundColor: Colors.white,
              ),
              child: Text(_isProcessing ? 'PROCESSING...' : 'CONFIRM PAYMENT'),
            ),
          ],
        ),
      ),
    );
  }
}
