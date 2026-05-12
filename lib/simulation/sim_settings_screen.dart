import 'package:flutter/material.dart';
import '../services/language_service.dart';

class SimSettingsScreen extends StatefulWidget {
  const SimSettingsScreen({super.key});

  @override
  State<SimSettingsScreen> createState() => _SimSettingsScreenState();
}

class _SimSettingsScreenState extends State<SimSettingsScreen> {
  final _lang = LanguageService();

  @override
  Widget build(BuildContext context) {
    final isEn = _lang.currentLanguage == AppLanguage.en;

    return Scaffold(
      backgroundColor: const Color(0xFF0A0A14),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0A0A14),
        foregroundColor: Colors.white,
        elevation: 0,
        title: Text(
          isEn ? 'Settings' : 'Pengaturan',
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
        children: [
          // ── Language ──
          _SectionHeader(label: isEn ? 'LANGUAGE' : 'BAHASA'),
          _SettingsTile(
            leading: const Icon(Icons.language_rounded, color: Color(0xFF8B2EE8), size: 20),
            title: isEn ? 'App Language' : 'Bahasa Aplikasi',
            subtitle: isEn ? 'English / Indonesia' : 'Inggris / Indonesia',
            trailing: _LangToggle(
              isEn: isEn,
              onChanged: (lang) async {
                await _lang.setLanguage(lang);
                if (mounted) setState(() {});
              },
            ),
          ),
          const SizedBox(height: 24),

          // ── About ──
          _SectionHeader(label: isEn ? 'ABOUT' : 'TENTANG'),
          _SettingsTile(
            leading: const Icon(Icons.info_outline_rounded, color: Color(0xFF00FF94), size: 20),
            title: 'SOLQ Simulation',
            subtitle: isEn ? 'Demo mode — no real funds' : 'Mode demo — tidak ada dana nyata',
          ),
          _SettingsTile(
            leading: const Icon(Icons.verified_rounded, color: Color(0xFF00D4FF), size: 20),
            title: isEn ? 'Settlement Rail' : 'Jalur Settlement',
            subtitle: 'BI-FAST via Xendit',
          ),
          _SettingsTile(
            leading: const Icon(Icons.percent_rounded, color: Color(0xFFF59E0B), size: 20),
            title: isEn ? 'Platform Fee' : 'Biaya Platform',
            subtitle: '0.5% — on-chain verifiable',
          ),
          const SizedBox(height: 32),

          Center(
            child: Text(
              'SOLQ v2.0 · Solana × QRIS',
              style: TextStyle(color: Colors.white.withValues(alpha: 0.25), fontSize: 11),
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String label;
  const _SectionHeader({required this.label});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 16, bottom: 8),
      child: Text(
        label,
        style: const TextStyle(
          color: Color(0xFF6B7280),
          fontSize: 10,
          fontWeight: FontWeight.w700,
          letterSpacing: 1.2,
        ),
      ),
    );
  }
}

class _SettingsTile extends StatelessWidget {
  final Widget leading;
  final String title;
  final String subtitle;
  final Widget? trailing;

  const _SettingsTile({
    required this.leading,
    required this.title,
    required this.subtitle,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: const Color(0xFF14142A),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFF1E1E3A)),
      ),
      child: Row(
        children: [
          leading,
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w500)),
                const SizedBox(height: 2),
                Text(subtitle,
                    style: const TextStyle(color: Color(0xFF6B7280), fontSize: 12)),
              ],
            ),
          ),
          if (trailing != null) ...[const SizedBox(width: 12), trailing!],
        ],
      ),
    );
  }
}

class _LangToggle extends StatelessWidget {
  final bool isEn;
  final ValueChanged<AppLanguage> onChanged;

  const _LangToggle({required this.isEn, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF0A0A14),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFF1E1E3A)),
      ),
      padding: const EdgeInsets.all(3),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _tab('ID', !isEn, () => onChanged(AppLanguage.id)),
          _tab('EN', isEn,  () => onChanged(AppLanguage.en)),
        ],
      ),
    );
  }

  Widget _tab(String label, bool active, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 5),
        decoration: BoxDecoration(
          color: active ? const Color(0xFF8B2EE8) : Colors.transparent,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: active ? Colors.white : const Color(0xFF6B7280),
            fontSize: 11,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.5,
          ),
        ),
      ),
    );
  }
}
