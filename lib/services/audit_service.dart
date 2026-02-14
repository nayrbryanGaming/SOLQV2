import 'package:shared_preferences/shared_preferences.dart';

class AuditLogService {
  static final AuditLogService _instance = AuditLogService._internal();
  factory AuditLogService() => _instance;
  AuditLogService._internal();

  List<String> _logs = [];
  List<String> get logs => _logs;

  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    _logs = prefs.getStringList('audit_logs') ?? [];
  }

  Future<void> log(String message) async {
    final timestamp = DateTime.now().toIso8601String().split('T')[1].split('.')[0];
    final entry = "[$timestamp] $message";
    
    _logs.insert(0, entry); // Newest first
    if (_logs.length > 50) _logs = _logs.sublist(0, 50); // Keep last 50

    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList('audit_logs', _logs);
  }
  
  Future<void> clear() async {
    _logs.clear();
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('audit_logs');
  }
}
