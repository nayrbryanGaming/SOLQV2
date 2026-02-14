import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import 'scan_screen.dart';

class POSScreen extends StatefulWidget {
  const POSScreen({Key? key}) : super(key: key);

  @override
  State<POSScreen> createState() => _POSScreenState();
}

class _POSScreenState extends State<POSScreen> {
  String _amount = '0';
  String? _qrData;
  String _status = 'WAITING_FOR_PAYMENT'; // Mock status

  void _onKeypadTap(String value) {
    setState(() {
      if (value == 'C') {
        _amount = '0';
      } else if (value == 'BS') {
        if (_amount.length > 1) {
          _amount = _amount.substring(0, _amount.length - 1);
        } else {
          _amount = '0';
        }
      } else if (value == '00') {
         if (_amount != '0') _amount += '00';
      } else {
        if (_amount == '0') {
          _amount = value;
        } else {
          _amount += value;
        }
      }
    });
  }

  void _generateQR() {
    // Generate a Mock QRIS Payload using standard format
    // This payload mimics a real QRIS string structure
    final amountInt = int.parse(_amount);
    
    // Construct QRIS Payload
    // ID 26 = Merchant Info (Global)
    // ID 51 = Merchant Account Info (Domestik)
    // ID 52 = MCC
    // ID 53 = Currency (360 = IDR)
    // ID 54 = Transaction Amount
    // ID 58 = Country Code
    // ID 59 = Merchant Name
    // ID 60 = Merchant City
    
    // Simple Mock String for MVP
    final payload = "00020101021126580013ID.CO.GO-JEK011893600914333886566651440014ID.CO.SPIN01071234567520454115303360540${amountInt > 0 ? amountInt.toString().length : 0}${amountInt > 0 ? amountInt : ''}5802ID5909WARUNGPAY6007JAKARTA6304A1B2";
    
    setState(() {
      _qrData = payload;
      _status = 'WAITING_FOR_PAYMENT';
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('WarungPay POS'),
        backgroundColor: Colors.blue[800],
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            icon: const Icon(Icons.qr_code_scanner),
            tooltip: 'Go to Scanner',
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (context) => const ScanScreen()),
              );
            },
          ),
        ],
      ),
      body: Column(
        children: [
          // Display Amount
          Expanded(
            flex: 2,
            child: Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    'Total Belanja (IDR)',
                    style: TextStyle(color: Colors.grey[600]),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    'Rp $_amount',
                    style: const TextStyle(fontSize: 48, fontWeight: FontWeight.bold),
                  ),
                  if (_qrData != null)
                     Padding(
                       padding: const EdgeInsets.only(top: 20.0),
                       child: Container(
                         padding: const EdgeInsets.all(10),
                         decoration: BoxDecoration(
                           color: Colors.white,
                           border: Border.all(color: Colors.grey.shade300),
                           borderRadius: BorderRadius.circular(12),
                         ),
                         child: Column(
                           children: [
                             QrImageView(
                               data: _qrData!,
                               version: QrVersions.auto,
                               size: 200.0,
                             ),
                             const SizedBox(height: 8),
                             Text("Status: $_status", style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.orange)),
                           ],
                         ),
                       ),
                     )
                ],
              ),
            ),
          ),

          // Keypad
          Expanded(
            flex: 3,
            child: Container(
              color: Colors.grey[100],
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  _buildRow(['1', '2', '3']),
                  const SizedBox(height: 10),
                  _buildRow(['4', '5', '6']),
                  const SizedBox(height: 10),
                  _buildRow(['7', '8', '9']),
                  const SizedBox(height: 10),
                   _buildRow(['00', '0', 'BS']),
                  const SizedBox(height: 20),
                  SizedBox(
                    width: double.infinity,
                    height: 60,
                    child: ElevatedButton(
                      onPressed: int.parse(_amount) >= 0 ? _generateQR : null,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.blue[800],
                        foregroundColor: Colors.white,
                      ),
                      child: const Text('GENERATE QR', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRow(List<String> keys) {
    return Expanded(
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: keys.map((key) {
          return Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4.0),
              child: InkWell(
                onTap: () => _onKeypadTap(key),
                borderRadius: BorderRadius.circular(8),
                child: Container(
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(8),
                    boxShadow: [BoxShadow(color: Colors.grey.shade200, blurRadius: 2, offset: Offset(0, 1))]
                  ),
                  alignment: Alignment.center,
                  child: key == 'BS' 
                      ? const Icon(Icons.backspace_outlined) 
                      : Text(key, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w600)),
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}
