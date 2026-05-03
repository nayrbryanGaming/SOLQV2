import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

enum AppLanguage { en, id }

class LanguageService extends ChangeNotifier {
  static final LanguageService _instance = LanguageService._internal();
  factory LanguageService() => _instance;
  LanguageService._internal();

  AppLanguage _currentLanguage = AppLanguage.en;
  AppLanguage get currentLanguage => _currentLanguage;

  static const String _prefKey = 'app_language';

  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString(_prefKey);
    if (saved == 'id') {
      _currentLanguage = AppLanguage.id;
    } else {
      _currentLanguage = AppLanguage.en;
    }
  }

  Future<void> setLanguage(AppLanguage lang) async {
    _currentLanguage = lang;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefKey, lang == AppLanguage.id ? 'id' : 'en');
    notifyListeners();
  }

  String t(String key) {
    return _translations[_currentLanguage]?[key] ?? key;
  }

  static const Map<AppLanguage, Map<String, String>> _translations = {
    AppLanguage.en: {
      'app_title': 'SOLQ',
      'scan_qris': 'SCAN QRIS NOW',
      'pick_gallery': 'CHOOSE FROM GALLERY',
      'ready_to_pay': 'READY TO PAY',
      'connect_wallet': 'CONNECT WALLET TO START',
      'no_wallet': 'NO WALLET',
      'history': 'HISTORY',
      'pay': 'PAY',
      'settings': 'SETTINGS',
      'language': 'Language',
      'success_today': 'SUCCESS TODAY',
      'unique_wallets': 'UNIQUE WALLETS',
      'analyzing_image': 'Analyzing image...',
      'no_qris_found': 'No QRIS detected in image.',
      'failed_to_analyze': 'Failed to analyze image',
      'camera_access_denied': 'Camera access denied.',
      'ensure_permission': 'Ensure camera permission is active.',
      'try_again': 'TRY AGAIN',
      'reset_camera': 'RESET',
      'merchant_detected': 'MERCHANT DETECTED',
      'pay_now': 'PAY NOW',
      'instant_pay': '⚡ INSTANT PAY',
      'economy_pay': '💎 ECONOMY PAY',
      'cancel': 'CANCEL',
      'warning_real_money': 'REAL MONEY. NOT A SIMULATION.',
      'warning_deduction': 'This transaction deducts SOL from your wallet.',
      'payment_success': 'PAYMENT SUCCESSFUL',
      'payment_failed': 'PAYMENT FAILED',
      'transaction_hash': 'TRANSACTION HASH',
      'explorer': 'Explorer',
      'copied': 'Copied!',
      'pay_again': 'PAY AGAIN',
      'settlement_track': 'SETTLEMENT TRACK',
      'recommended': 'RECOMMENDED',
      'coming_soon': 'COMING SOON',
      'err_price_sync': 'Failed to sync market prices. Check your connection.',
      'err_suspicious_price': 'Security: Suspicious price deviation detected (> 2.5%). Transaction aborted.',
      'err_cloud_timeout': 'Cloud server did not respond. Check your internet.',
      'err_connection_failed': 'Connection Failed: Could not reach cloud server.',
      'err_amount_set': 'Failed to set amount',
    },
    AppLanguage.id: {
      'app_title': 'SOLQ',
      'scan_qris': 'SCAN QRIS SEKARANG',
      'pick_gallery': 'PILIH DARI GALERI',
      'ready_to_pay': 'SIAP MEMBAYAR',
      'connect_wallet': 'HUBUNGKAN WALLET UNTUK MULAI',
      'no_wallet': 'TIDAK ADA WALLET',
      'history': 'RIWAYAT',
      'pay': 'BAYAR',
      'settings': 'PENGATURAN',
      'language': 'Bahasa',
      'success_today': 'SUKSES HARI INI',
      'unique_wallets': 'WALLET UNIK',
      'analyzing_image': 'Menganalisa gambar...',
      'no_qris_found': 'QRIS tidak terdeteksi dalam gambar.',
      'failed_to_analyze': 'Gagal menganalisa gambar',
      'camera_access_denied': 'Kamera tidak dapat diakses.',
      'ensure_permission': 'Pastikan izin kamera aktif.',
      'try_again': 'COBA LAGI',
      'reset_camera': 'RESET',
      'merchant_detected': 'MERCHANT TERDETEKSI',
      'pay_now': 'BAYAR SEKARANG',
      'instant_pay': '⚡ BAYAR INSTAN',
      'economy_pay': '💎 BAYAR HEMAT',
      'cancel': 'BATAL',
      'warning_real_money': 'UANG ASLI. BUKAN SIMULASI.',
      'warning_deduction': 'Transaksi ini memotong saldo SOL di wallet Anda.',
      'payment_success': 'PEMBAYARAN BERHASIL',
      'payment_failed': 'PEMBAYARAN GAGAL',
      'transaction_hash': 'HASH TRANSAKSI',
      'explorer': 'Explorer',
      'copied': 'Disalin!',
      'pay_again': 'BAYAR LAGI',
      'settlement_track': 'JALUR PENYELESAIAN',
      'recommended': 'DIREKOMENDASIKAN',
      'coming_soon': 'SEGERA HADIR',
      'err_price_sync': 'Gagal sinkronisasi harga pasar. Periksa koneksi internet Anda.',
      'err_suspicious_price': 'Keamanan: Terdeteksi deviasi harga yang mencurigakan (> 2.5%). Transaksi dibatalkan.',
      'err_cloud_timeout': 'Server Cloud tidak merespons. Periksa jaringan internet Anda.',
      'err_connection_failed': 'Koneksi Gagal: Tidak dapat menjangkau server cloud.',
      'err_amount_set': 'Gagal menetapkan nominal',
    }
  };
}
