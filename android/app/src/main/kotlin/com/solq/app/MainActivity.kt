package com.solq.app

import android.os.Bundle
import android.view.WindowManager
import io.flutter.embedding.android.FlutterActivity

class MainActivity: FlutterActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // BUG-035 FIX: Prevent screenshots and screen recording in production.
        // FLAG_SECURE blocks screenshots, recent apps thumbnail, and screen casting.
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
    }
}
