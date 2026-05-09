import 'package:flutter/material.dart';
import 'sim_scanner_screen.dart';

class SimulationApp extends StatelessWidget {
  const SimulationApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SOLQ Simulation',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF0A0A14),
        colorScheme: const ColorScheme.dark(
          primary:   Color(0xFF8B2EE8),
          secondary: Color(0xFF00FF94),
          surface:   Color(0xFF14142A),
        ),
        fontFamily: 'Inter',
        useMaterial3: true,
      ),
      home: const SimScannerScreen(),
    );
  }
}
