import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'services/language_service.dart';
import 'simulation/simulation_app.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);

  final lang = LanguageService();
  await lang.init();

  runApp(
    MultiProvider(
      providers: [ChangeNotifierProvider.value(value: lang)],
      child: const SimulationApp(),
    ),
  );
}
