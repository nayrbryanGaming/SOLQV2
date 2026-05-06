import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:http/http.dart' as http;
import '../config/app_config.dart';
import 'sim_payment_screen.dart';

class SimScannerScreen extends StatefulWidget {
  const SimScannerScreen({super.key});

  @override
  State<SimScannerScreen> createState() => _SimScannerScreenState();
}

class _SimScannerScreenState extends State<SimScannerScreen>
    with WidgetsBindingObserver {
  // Singleton controller — persists between screen visits (zero black screen)
  static MobileScannerController? _sharedController;

  bool _isProcessing = false;
  bool _torchOn      = false;
  String? _statusMsg;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _ensureController();
  }

  void _ensureController() {
    _sharedController ??= MobileScannerController(
      detectionSpeed: DetectionSpeed.noDuplicates,
      facing:         CameraFacing.back,
      torchEnabled:   false,
      returnImage:    false,
    );
    _sharedController!.start();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    switch (state) {
      case AppLifecycleState.paused:
      case AppLifecycleState.inactive:
        _sharedController?.stop();
        break;
      case AppLifecycleState.resumed:
        _sharedController?.start();
        break;
      case AppLifecycleState.detached:
        _sharedController?.dispose();
        _sharedController = null;
        break;
      default:
        break;
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    // DO NOT dispose controller here — singleton stays alive
    super.dispose();
  }

  Future<void> _onQRDetected(BarcodeCapture capture) async {
    if (_isProcessing) return;
    final raw = capture.barcodes.firstOrNull?.rawValue;
    if (raw == null || raw.isEmpty) return;

    setState(() { _isProcessing = true; _statusMsg = 'Membaca QRIS…'; });
    _sharedController?.stop();

    try {
      final merchant = await _parseQris(raw);
      if (!mounted) return;
      await Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => SimPaymentScreen(
            rawQris:      raw,
            merchantData: merchant,
          ),
        ),
      );
    } catch (e) {
      if (mounted) {
        setState(() { _statusMsg = 'QRIS tidak valid: ${e.toString().replaceAll('Exception:', '').trim()}'; });
        await Future.delayed(const Duration(seconds: 3));
        if (mounted) setState(() { _statusMsg = null; });
      }
    } finally {
      if (mounted) {
        setState(() { _isProcessing = false; });
        _sharedController?.start();
      }
    }
  }

  Future<Map<String, dynamic>> _parseQris(String payload) async {
    // First: try backend parse (full EMVCo + CRC validation)
    try {
      final res = await http.post(
        Uri.parse('${AppConfig.apiBaseUrl}/v1/simulation/parse-qris'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'qris_payload': payload}),
      ).timeout(const Duration(seconds: 5));

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        if (data['qris_valid'] == true) return data;
        throw Exception(data['message'] ?? 'QRIS tidak valid');
      }
    } catch (e) {
      // Fallback to local Dart parser if backend unreachable
    }

    // Fallback: local TLV parse (no CRC check — simulation leniency)
    return _localParse(payload);
  }

  Map<String, dynamic> _localParse(String payload) {
    final Map<String, String> tlv = {};
    int i = 0;
    try {
      while (i + 4 <= payload.length) {
        final tag = payload.substring(i, i + 2);
        final len = int.tryParse(payload.substring(i + 2, i + 4)) ?? 0;
        i += 4;
        if (i + len > payload.length) break;
        tlv[tag] = payload.substring(i, i + len);
        i += len;
      }
    } catch (_) {}

    final name    = tlv['59'] ?? 'Merchant';
    final city    = tlv['60'] ?? '';
    final country = tlv['58'] ?? 'ID';

    // Try to extract NMID from merchant account sub-tags 26-51
    String nmid = '-';
    for (int t = 26; t <= 51; t++) {
      final tagKey = t.toString().padLeft(2, '0');
      final sub    = tlv[tagKey] ?? '';
      if (sub.isNotEmpty) {
        int j = 0;
        while (j + 4 <= sub.length) {
          final subTag = sub.substring(j, j + 2);
          final subLen = int.tryParse(sub.substring(j + 2, j + 4)) ?? 0;
          j += 4;
          if (j + subLen > sub.length) break;
          final subVal = sub.substring(j, j + subLen);
          j += subLen;
          if (subTag == '02') { nmid = subVal; break; }
          if (subTag == '01' && nmid == '-') nmid = subVal;
        }
        if (nmid != '-') break;
      }
    }

    return {
      'simulation':  true,
      'qris_valid':  true,
      'merchant': {
        'name':    name,
        'city':    city,
        'nmid':    nmid,
        'account': nmid,
        'bank':    'AUTO',
        'country': country,
      },
      'qr_type':     payload.contains('0102') ? 'DYNAMIC' : 'STATIC',
      'amount_locked': null,
    };
  }

  void _toggleTorch() {
    _sharedController?.toggleTorch();
    setState(() { _torchOn = !_torchOn; });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0A0A14),
      body: Stack(children: [

        // ── Camera ──
        MobileScanner(
          controller: _sharedController!,
          onDetect:   _onQRDetected,
        ),

        // ── Overlay ──
        _ScanOverlay(isProcessing: _isProcessing),

        // ── Top bar ──
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                _chip('SIMULATION MODE', const Color(0xFFFF6B00)),
                IconButton(
                  icon: Icon(
                    _torchOn ? Icons.flashlight_on : Icons.flashlight_off,
                    color: Colors.white,
                  ),
                  onPressed: _toggleTorch,
                ),
              ],
            ),
          ),
        ),

        // ── Bottom instructions ──
        Align(
          alignment: Alignment.bottomCenter,
          child: SafeArea(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 40, left: 24, right: 24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (_statusMsg != null)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                      decoration: BoxDecoration(
                        color: const Color(0xFF14142A),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: const Color(0xFF8B2EE8)),
                      ),
                      child: Text(
                        _statusMsg!,
                        style: const TextStyle(color: Colors.white, fontSize: 14),
                        textAlign: TextAlign.center,
                      ),
                    ).animate().fadeIn()
                  else
                    const Text(
                      'Arahkan kamera ke kode QRIS merchant',
                      style: TextStyle(color: Colors.white70, fontSize: 15),
                      textAlign: TextAlign.center,
                    ),
                  const SizedBox(height: 12),
                  const Text(
                    'Nama toko, NMID, dan kota akan terbaca otomatis',
                    style: TextStyle(color: Colors.white38, fontSize: 12),
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
          ),
        ),
      ]),
    );
  }

  Widget _chip(String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withOpacity(0.2),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color, width: 1),
      ),
      child: Text(label, style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.bold)),
    );
  }
}

// Scan viewfinder overlay
class _ScanOverlay extends StatelessWidget {
  final bool isProcessing;
  const _ScanOverlay({required this.isProcessing});

  @override
  Widget build(BuildContext context) {
    return ColorFiltered(
      colorFilter: ColorFilter.mode(Colors.black.withOpacity(0.55), BlendMode.srcOut),
      child: Stack(children: [
        Container(color: Colors.transparent),
        Center(
          child: Container(
            width: 260, height: 260,
            decoration: BoxDecoration(
              color: Colors.black,
              borderRadius: BorderRadius.circular(20),
            ),
          ),
        ),
      ]),
    );
  }
}
