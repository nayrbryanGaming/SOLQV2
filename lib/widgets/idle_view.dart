import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';
import '../services/language_service.dart';
import '../services/solana_service.dart';

class IdleView extends StatelessWidget {
  final SolanaService solana;
  final double balance;
  final VoidCallback onStartScan;
  final VoidCallback onPickGallery;

  const IdleView({
    Key? key,
    required this.solana,
    required this.balance,
    required this.onStartScan,
    required this.onPickGallery,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final lang = context.watch<LanguageService>();

    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          // SOLQ Wordmark Logo
          Image.asset(
            'assets/logos/solq_logo_wordmark_transparent.png',
            height: 100,
            errorBuilder: (_, __, ___) => Image.asset(
              'assets/logos/solq_logo_icon_transparent.png',
              height: 100,
              errorBuilder: (_, __, ___) => _SolqLogoFallback(size: 100),
            ),
          ).animate().scale(duration: 800.ms, curve: Curves.easeOutBack),
          
          const SizedBox(height: 32),
          
          // Wallet Status
          if (solana.isConnected)
            Column(
              children: [
                Text(
                  lang.t('ready_to_pay'),
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 2,
                    color: const Color(0xFF00FF94).withOpacity(0.8),
                  ),
                ).animate().fadeIn(duration: 600.ms).slideY(begin: 0.2, end: 0),
                const SizedBox(height: 8),
                Text(
                  "BAL: ${balance.toStringAsFixed(4)} SOL",
                  style: const TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w900,
                    color: Colors.white,
                  ),
                ).animate().shimmer(duration: 2.seconds, color: const Color(0xFF00FF94).withOpacity(0.2)),
              ],
            )
          else
            Text(
              lang.t('connect_wallet'),
              style: const TextStyle(
                color: Colors.white70,
                fontWeight: FontWeight.bold,
                letterSpacing: 1,
              ),
            ),
            
          const SizedBox(height: 48),
          
          // Scan Button
          ElevatedButton.icon(
            onPressed: onStartScan,
            icon: const Icon(Icons.qr_code_scanner),
            label: Text(lang.t('scan_qris')),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF00FF94),
              foregroundColor: Colors.black,
              padding: const EdgeInsets.symmetric(horizontal: 48, vertical: 20),
              textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900, letterSpacing: 1),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              elevation: 12,
              shadowColor: const Color(0xFF00FF94).withOpacity(0.4),
            ),
          ).animate(onPlay: (controller) => controller.repeat(reverse: true))
           .scale(duration: 2.seconds, begin: const Offset(1.0, 1.0), end: const Offset(1.03, 1.03), curve: Curves.easeInOut),
           
          const SizedBox(height: 16),
          
          // Gallery Link
          TextButton.icon(
            onPressed: onPickGallery,
            icon: const Icon(Icons.photo_library, size: 18, color: Colors.white38),
            label: Text(
              lang.t('pick_gallery'),
              style: const TextStyle(color: Colors.white70, fontWeight: FontWeight.bold),
            ),
          ),
        ],
      ),
    );
  }
}

// Fallback SVG-style Q logo rendered via CustomPaint
class _SolqLogoFallback extends StatelessWidget {
  final double size;
  const _SolqLogoFallback({required this.size});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size * 2.2,
      height: size,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          CustomPaint(size: Size(size, size), painter: _QMarkPainter()),
          const SizedBox(width: 12),
          Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ShaderMask(
                shaderCallback: (bounds) => const LinearGradient(
                  colors: [Color(0xFFC050FF), Color(0xFF14F195)],
                ).createShader(bounds),
                child: Text('SOLQ', style: TextStyle(
                  fontSize: size * 0.38, fontWeight: FontWeight.w900,
                  color: Colors.white, letterSpacing: 3,
                )),
              ),
              Text('SOLANA-BASED PAYMENTS', style: TextStyle(
                fontSize: size * 0.1, fontWeight: FontWeight.w600,
                color: Colors.white54, letterSpacing: 1.5,
              )),
            ],
          ),
        ],
      ),
    );
  }
}

class _QMarkPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final cx = size.width * 0.44;
    final cy = size.height * 0.44;
    final r = size.width * 0.30;

    final purplePaint = Paint()
      ..shader = const LinearGradient(
        begin: Alignment.topLeft, end: Alignment.bottomRight,
        colors: [Color(0xFFC050FF), Color(0xFF4A1A99)],
      ).createShader(Rect.fromCircle(center: Offset(cx, cy), radius: r))
      ..style = PaintingStyle.stroke
      ..strokeWidth = size.width * 0.14
      ..strokeCap = StrokeCap.round;

    final tealPaint = Paint()
      ..shader = const LinearGradient(
        begin: Alignment.bottomLeft, end: Alignment.topRight,
        colors: [Color(0xFF00C4CC), Color(0xFF14F195)],
      ).createShader(Rect.fromCircle(center: Offset(cx, cy), radius: r))
      ..style = PaintingStyle.stroke
      ..strokeWidth = size.width * 0.14
      ..strokeCap = StrokeCap.round;

    // Full circle in purple
    canvas.drawCircle(Offset(cx, cy), r, purplePaint);

    // Teal arc (bottom-right quarter)
    final rect = Rect.fromCircle(center: Offset(cx, cy), radius: r);
    canvas.drawArc(rect, 0.3, 1.1, false, tealPaint);

    // Q tail
    final tailPath = Path()
      ..moveTo(cx + r * 0.7, cy + r * 0.7)
      ..quadraticBezierTo(cx + r * 1.1, cy + r * 1.2, cx + r * 1.4, cy + r * 1.5);
    canvas.drawPath(tailPath, tealPaint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
