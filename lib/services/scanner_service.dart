import 'package:mobile_scanner/mobile_scanner.dart';

/// Singleton scanner controller — lives for the entire app lifecycle.
/// Prevents black screen on repeated scanner opens/closes.
class ScannerService {
  ScannerService._();
  static final ScannerService instance = ScannerService._();

  MobileScannerController? _controller;
  bool _running = false;

  void initialize() {
    _controller ??= MobileScannerController(
      detectionSpeed: DetectionSpeed.noDuplicates,
      facing:         CameraFacing.back,
      torchEnabled:   false,
      returnImage:    false,
    );
  }

  MobileScannerController get controller {
    initialize();
    return _controller!;
  }

  void start() {
    if (!_running) {
      _controller?.start();
      _running = true;
    }
  }

  void stop() {
    if (_running) {
      _controller?.stop();
      _running = false;
    }
  }

  /// Call ONLY when app is being fully detached (AppLifecycleState.detached).
  void dispose() {
    _controller?.dispose();
    _controller = null;
    _running    = false;
  }

  bool get isRunning => _running;
}
