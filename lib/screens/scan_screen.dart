import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../services/warungpay_service.dart';
import 'payment_confirmation_screen.dart';
import 'pos_screen.dart';

class ScanScreen extends StatefulWidget {
  const ScanScreen({Key? key}) : super(key: key);

  @override
  State<ScanScreen> createState() => _ScanScreenState();
}

class _ScanScreenState extends State<ScanScreen> with WidgetsBindingObserver {
  final WarungPayService _service = WarungPayService();
  bool _isProcessing = false;
  late MobileScannerController _cameraController;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _cameraController = MobileScannerController(
      detectionSpeed: DetectionSpeed.noDuplicates,
      returnImage: false,
    );
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _cameraController.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.inactive) {
      _cameraController.stop();
    } else if (state == AppLifecycleState.resumed) {
      _cameraController.start();
    }
  }

  Future<int?> _showAmountInputDialog(BuildContext context) async {
    final TextEditingController _amountController = TextEditingController();
    return showDialog<int>(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        title: const Text('Enter Amount'),
        content: TextField(
          controller: _amountController,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(
            labelText: 'Amount (IDR)',
            prefixText: 'Rp ',
            border: OutlineInputBorder(),
          ),
          autofocus: true,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('CANCEL'),
          ),
          ElevatedButton(
            onPressed: () {
              final val = int.tryParse(_amountController.text);
              if (val != null && val > 0) {
                Navigator.pop(context, val);
              }
            },
            child: const Text('CONTINUE'),
          ),
        ],
      ),
    );
  }

  void _onDetect(BarcodeCapture capture) async {
    if (_isProcessing) return;
    final List<Barcode> barcodes = capture.barcodes;

    for (final barcode in barcodes) {
      if (barcode.rawValue != null) {
        setState(() {
          _isProcessing = true;
        });

        try {
          final rawValue = barcode.rawValue!;
          // Call backend to create payment intent
          var intent = await _service.createPaymentIntent(rawValue);

          // CHECK FOR STATIC QRIS (Amount = 0)
          if (intent['amount_details']['fiat_amount'] == 0 || intent['amount_details']['fiat_amount'] == 0.0) {
              if (!mounted) return;
              final inputAmount = await _showAmountInputDialog(context);
              if (inputAmount != null && inputAmount > 0) {
                 // Re-create intent with manual amount
                 intent = await _service.createPaymentIntent(rawValue, amount: inputAmount);
              } else {
                 setState(() => _isProcessing = false);
                 return; // User cancelled
              }
          }

          if (!mounted) return;
          
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (context) => PaymentConfirmationScreen(paymentIntent: intent),
            ),
          ).then((_) => setState(() => _isProcessing = false));
          
          break; // Process only the first valid code
        } catch (e) {
          if (!mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Error: ${e.toString()}')),
          );
          setState(() {
            _isProcessing = false;
          });
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Scan QRIS'),
        actions: [
          IconButton(
            icon: const Icon(Icons.store, color: Colors.blue),
            tooltip: 'Merchant POS Mode',
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (context) => const POSScreen()),
              );
            },
          ),
        ],
      ),
      body: MobileScanner(
        controller: _cameraController,
        onDetect: _onDetect,
        errorBuilder: (context, error, child) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                   const Icon(Icons.error, color: Colors.red, size: 48),
                   const SizedBox(height: 16),
                   Text(
                     'Camera Error: ${error.errorCode}',
                     style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                   ),
                   const SizedBox(height: 8),
                   Text(
                     'Details: ${error.errorDetails?.message ?? "Unknown error"}',
                     style: const TextStyle(color: Colors.white70),
                     textAlign: TextAlign.center,
                   ),
                   const SizedBox(height: 24),
                   ElevatedButton(
                     onPressed: () {
                        // Attempt to restart
                        _cameraController.stop();
                        _cameraController.start();
                     },
                     child: const Text("Retry Camera"),
                   )
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
