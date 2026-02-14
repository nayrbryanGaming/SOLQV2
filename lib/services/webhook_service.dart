import 'dart:async';
import 'dart:io';
import 'package:shelf/shelf.dart';
import 'package:shelf/shelf_io.dart' as shelf_io;
import 'package:shelf_router/shelf_router.dart';
import 'dart:convert';
import 'orchestrator_service.dart';

class WebhookService {
  // Singleton
  static final WebhookService _instance = WebhookService._internal();
  factory WebhookService() => _instance;
  WebhookService._internal();

  HttpServer? _server;
  String? _ipAddress;
  String? _lastError;
  bool get isRunning => _server != null;
  String get ipAddress => _ipAddress ?? "Unknown";
  String get statusMessage => _lastError ?? (_server != null ? "Active (Port ${_server!.port})" : "Stopped");
  
  // Start the Local Webhook Server
  Future<void> startServer() async {
    final router = Router();

    // POST /webhook/settlement
    router.post('/webhook/settlement', (Request request) async {
      final payload = await request.readAsString();
      print("[WEBHOOK] Received Payload: $payload");
      
      try {
        final Map<String, dynamic> data = jsonDecode(payload);
        final String intentId = data['intentId'];
        final String status = data['status'];
        final String refId = data['refId'];

        // HARD PROOF #2: Async State Update
        OrchestratorService().handleAsyncWebhook(intentId, status, refId);

        return Response.ok(jsonEncode({'status': 'received'}));
      } catch (e) {
        return Response.internalServerError(body: "Webhook Error: $e");
      }
    });

    try {
      // Find Network IP
      final interfaces = await NetworkInterface.list(type: InternetAddressType.IPv4);
      try {
        // Try to find a non-loopback address (usually wlan0 or eth0)
        final wifiInterface = interfaces.firstWhere(
          (i) => i.name.contains('wlan') || i.name.contains('ap') || i.name.contains('eth'), 
          orElse: () => interfaces.first
        );
        _ipAddress = wifiInterface.addresses.first.address;
      } catch (e) {
        _ipAddress = "127.0.0.1";
      }

      _server = await shelf_io.serve(router.call, InternetAddress.anyIPv4, 8080);
      _lastError = null;
      print('[WEBHOOK SERVER] Listening on http://0.0.0.0:${_server!.port} (Device IP: $_ipAddress)');
    } catch (e) {
      _server = null;
      _lastError = "Start Failed: $e";
      print('[WEBHOOK SERVER] Failed to start: $e');
    }
  }

  void stopServer() {
    _server?.close();
  }
}
