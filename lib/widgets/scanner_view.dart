import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:image_picker/image_picker.dart';
import '../services/language_service.dart';
import '../services/scanner_service.dart';

class ScannerView extends StatefulWidget {
  final Function(String) onDetect;
  final VoidCallback onCancel;

  const ScannerView({
    Key? key,
    required this.onDetect,
    required this.onCancel,
  }) : super(key: key);

  @override
  State<ScannerView> createState() => _ScannerViewState();
}

class _ScannerViewState extends State<ScannerView> {
  // Use singleton — never disposes controller between screen visits (zero black screen)
  final _scanner     = ScannerService.instance;
  Timer? _frameWatchdog;
  bool  _hasDetectedFrame = false;
  bool  _hasScanned       = false;

  @override
  void initState() {
    super.initState();
    _scanner.initialize();
    _scanner.start();
    Future.delayed(const Duration(seconds: 5), () {
      if (mounted) _initWatchdog();
    });
  }

  void _initWatchdog() {
    _frameWatchdog?.cancel();
    _frameWatchdog = Timer.periodic(const Duration(seconds: 8), (_) {
      if (!_hasDetectedFrame && mounted) {
        debugPrint('SCANNER_WATCHDOG: no frame in 8s, stop/start...');
        _scanner.stop();
        Future.delayed(const Duration(milliseconds: 300), () {
          if (mounted) { _scanner.start(); setState(() { _hasDetectedFrame = false; }); }
        });
      }
    });
  }

  Future<void> _softReset() async {
    _scanner.stop();
    await Future.delayed(const Duration(milliseconds: 300));
    if (mounted) {
      _scanner.start();
      setState(() { _hasDetectedFrame = false; _hasScanned = false; });
      _initWatchdog();
    }
  }

  Future<void> _pickFromGallery() async {
    final picker = ImagePicker();
    final image = await picker.pickImage(source: ImageSource.gallery);
    if (image == null) return;
    if (!mounted) return;

    final lang = context.read<LanguageService>();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(lang.t('analyzing_image'))),
    );

    try {
      final success = await _scanner.controller.analyzeImage(image.path);
      if (!mounted) return;
      if (success == null || !success) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(lang.t('no_qris_found')),
            backgroundColor: Colors.orangeAccent,
          ),
        );
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text("${lang.t('failed_to_analyze')}: $e"),
          backgroundColor: Colors.redAccent,
        ),
      );
    }
  }

  @override
  void dispose() {
    _frameWatchdog?.cancel();
    _scanner.stop(); // stop (NOT dispose) — singleton stays alive for next visit
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final lang = context.watch<LanguageService>();

    return Stack(
      children: [
        MobileScanner(
          controller: _scanner.controller,
          fit:        BoxFit.cover,
          onDetect: (capture) {
            if (!_hasDetectedFrame) {
              setState(() => _hasDetectedFrame = true);
              _frameWatchdog?.cancel();
            }
            if (_hasScanned) return;
            for (final barcode in capture.barcodes) {
              if (barcode.rawValue != null) {
                _hasScanned = true;
                HapticFeedback.mediumImpact();
                widget.onDetect(barcode.rawValue!);
                break;
              }
            }
          },
          errorBuilder: (context, error, child) {
            return Container(
              color: Colors.black,
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.videocam_off_outlined,
                        color: Colors.redAccent, size: 48),
                    const SizedBox(height: 16),
                    Text(
                      lang.t('camera_access_denied'),
                      style: const TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      lang.t('ensure_permission'),
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: Colors.white70, fontSize: 13),
                    ),
                    const SizedBox(height: 24),
                    ElevatedButton(
                      onPressed: _softReset,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF00FF94),
                        foregroundColor: Colors.black,
                      ),
                      child: Text(lang.t('try_again')),
                    ),
                  ],
                ),
              ),
            );
          },
        ),
        // Overlay Controls
        Positioned(
          top: MediaQuery.of(context).padding.top + 16,
          right: 16,
          child: Column(
            children: [
              IconButton(
                onPressed: () => _controller?.toggleTorch(),
                icon: const Icon(Icons.flashlight_on, color: Colors.white),
                style: IconButton.styleFrom(backgroundColor: Colors.black45),
              ),
              const SizedBox(height: 12),
              Container(
                decoration: BoxDecoration(
                  color: Colors.black45,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Column(
                  children: [
                    IconButton(
                      onPressed: _softReset,
                      icon: const Icon(Icons.refresh, color: Colors.white, size: 28),
                    ),
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Text(lang.t('reset_camera'),
                          style: const TextStyle(
                              color: Colors.white70,
                              fontSize: 8,
                              fontWeight: FontWeight.bold)),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              IconButton(
                onPressed: widget.onCancel,
                icon: const Icon(Icons.close, color: Colors.white),
                style: IconButton.styleFrom(backgroundColor: Colors.redAccent.withOpacity(0.5)),
              ),
            ],
          ),
        ),
        // Gallery Button
        Positioned(
          bottom: 40,
          left: 0,
          right: 0,
          child: Center(
            child: GestureDetector(
              onTap: _pickFromGallery,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
                decoration: BoxDecoration(
                  color: Colors.black.withOpacity(0.7),
                  borderRadius: BorderRadius.circular(30),
                  border: Border.all(color: Colors.white24, width: 1),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.photo_library, color: Colors.white, size: 20),
                    const SizedBox(width: 10),
                    Text(
                      lang.t('pick_gallery'),
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
        // Frame
        Center(
          child: Container(
            width: 250,
            height: 250,
            decoration: BoxDecoration(
              border: Border.all(
                  color: const Color(0xFF00FF94).withOpacity(0.5),
                  width: 2),
              borderRadius: BorderRadius.circular(16),
            ),
          ),
        ),
      ],
    );
  }
}
