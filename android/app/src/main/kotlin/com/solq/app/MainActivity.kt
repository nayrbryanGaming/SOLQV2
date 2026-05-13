package com.solq.app

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Build
import android.util.Base64
import android.view.WindowManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.net.ServerSocket
import java.security.KeyPairGenerator
import java.security.MessageDigest
import java.security.SecureRandom
import java.security.spec.NamedParameterSpec
import javax.crypto.Cipher
import javax.crypto.KeyAgreement
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

class MainActivity : FlutterActivity() {
    private val MWA_CHANNEL = "com.solq.mwa"
    private var pendingResult: MethodChannel.Result? = null
    private var serverJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
    }

    override fun onDestroy() {
        super.onDestroy()
        serverJob?.cancel()
        scope.cancel()
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, MWA_CHANNEL)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "associate" -> {
                        val portMin = call.argument<Int>("portMin") ?: 8900
                        val portMax = call.argument<Int>("portMax") ?: 9000
                        startMwaAssociation(portMin, portMax, result)
                    }
                    "cancel" -> {
                        serverJob?.cancel()
                        pendingResult?.error("CANCELLED", "MWA cancelled by user", null)
                        pendingResult = null
                        result.success(null)
                    }
                    "signAndSend" -> {
                        val authToken = call.argument<String>("authToken") ?: ""
                        val txBase64  = call.argument<String>("transaction") ?: ""
                        val portMin   = call.argument<Int>("portMin") ?: 8900
                        val portMax   = call.argument<Int>("portMax") ?: 9000
                        if (authToken.isEmpty() || txBase64.isEmpty()) {
                            result.error("INVALID_ARGS", "authToken and transaction required", null)
                        } else {
                            startMwaSign(authToken, txBase64, portMin, portMax, result)
                        }
                    }
                    "isWalletInstalled" -> {
                        val solanaIntent = Intent(Intent.ACTION_VIEW, Uri.parse("solana-wallet://"))
                        val phantomIntent = Intent(Intent.ACTION_VIEW, Uri.parse("phantom://"))
                        val pm = packageManager
                        val hasSolana = pm.queryIntentActivities(solanaIntent, 0).isNotEmpty()
                        val hasPhantom = pm.queryIntentActivities(phantomIntent, 0).isNotEmpty()
                        result.success(hasSolana || hasPhantom)
                    }
                    else -> result.notImplemented()
                }
            }
    }

    private fun startMwaAssociation(portMin: Int, portMax: Int, result: MethodChannel.Result) {
        if (pendingResult != null) {
            result.error("BUSY", "MWA connection already in progress", null)
            return
        }
        // MWA crypto requires API 31+ for X25519 key agreement
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            result.error(
                "API_TOO_LOW",
                "MWA requires Android 12 (API 31). Device is API ${Build.VERSION.SDK_INT}. Please enter your wallet address manually.",
                null
            )
            return
        }
        pendingResult = result

        serverJob = scope.launch {
            try {
                // ── Step 1: Find open port ────────────────────────────────────────────
                val serverSocket = (portMin..portMax).firstNotNullOfOrNull { port ->
                    try { ServerSocket(port).also { it.soTimeout = 70_000 } }
                    catch (_: IOException) { null }
                }
                if (serverSocket == null) {
                    failWith("NO_PORT", "No free port in range $portMin–$portMax")
                    return@launch
                }
                val port = serverSocket.localPort

                // ── Step 2: X25519 keypair ────────────────────────────────────────────
                val keyGen = KeyPairGenerator.getInstance("XDH").also {
                    it.initialize(NamedParameterSpec.X25519)
                }
                val keyPair = keyGen.generateKeyPair()
                // Extract raw 32-byte public key from SubjectPublicKeyInfo (last 32 bytes)
                val rawPub = keyPair.public.encoded.takeLast(32).toByteArray()
                val pubB64 = Base64.encodeToString(rawPub, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)

                // ── Step 3: Build association URI and launch wallet ────────────────────
                val assocPayload = JSONObject().apply {
                    put("v", 1)
                    put("port", port)
                    put("pub", pubB64)
                }.toString()
                val assocB64 = Base64.encodeToString(
                    assocPayload.toByteArray(Charsets.UTF_8),
                    Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING
                )
                val walletUri = "solana-wallet://v1/associate?association=$assocB64"

                withContext(Dispatchers.Main) {
                    try {
                        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(walletUri)).also {
                            it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        })
                    } catch (e: ActivityNotFoundException) {
                        serverSocket.close()
                        failWith("NO_WALLET", "No MWA-compatible wallet (Phantom/Solflare) installed")
                    }
                }

                // ── Step 4: Accept WebSocket connection ───────────────────────────────
                val clientSocket = try { serverSocket.accept() }
                catch (e: Exception) {
                    serverSocket.close()
                    failWith("TIMEOUT", "Wallet did not connect within 60 seconds")
                    return@launch
                }
                serverSocket.close()

                val ins = clientSocket.getInputStream()
                val outs = clientSocket.getOutputStream()

                // ── Step 5: WebSocket handshake ───────────────────────────────────────
                if (!doWebSocketHandshake(ins, outs)) {
                    clientSocket.close()
                    failWith("WS_FAIL", "WebSocket handshake failed")
                    return@launch
                }

                // ── Step 6: MWA hello + ECDH ─────────────────────────────────────────
                val helloFrame = readWsText(ins) ?: run {
                    clientSocket.close()
                    failWith("WS_FAIL", "No hello from wallet")
                    return@launch
                }
                val helloJson = JSONObject(helloFrame)
                val walletPubB64 = helloJson.getString("pub")
                val walletPubRaw = Base64.decode(walletPubB64, Base64.URL_SAFE or Base64.NO_PADDING)

                // Compute ECDH shared secret
                val walletPubKey = buildX25519PublicKey(walletPubRaw)
                val ka = KeyAgreement.getInstance("XDH")
                ka.init(keyPair.private)
                ka.doPhase(walletPubKey, true)
                val sharedSecret = ka.generateSecret()
                val sessionKey = MessageDigest.getInstance("SHA-256").digest(sharedSecret)

                // Send our hello
                sendWsText(
                    outs, JSONObject().apply {
                        put("pub", pubB64)
                    }.toString()
                )

                // ── Step 7: Send authorize request ────────────────────────────────────
                val rng = SecureRandom()
                val nonce = ByteArray(12).also { rng.nextBytes(it) }
                val reqJson = JSONObject().apply {
                    put("id", 1)
                    put("method", "authorize")
                    put("params", JSONObject().apply {
                        put("identity", JSONObject().apply {
                            put("uri", "https://solq.my.id")
                            put("icon", "https://solq.my.id/logo.png")
                            put("name", "SOLQ")
                        })
                        put("cluster", "mainnet-beta")
                    })
                }.toString().toByteArray(Charsets.UTF_8)

                val encrypted = encryptAesGcm(reqJson, sessionKey, nonce)
                val msg = Base64.encodeToString(nonce + encrypted, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
                sendWsText(outs, msg)

                // ── Step 8: Receive authorize response ────────────────────────────────
                val respMsg = readWsText(ins) ?: run {
                    clientSocket.close()
                    failWith("WS_FAIL", "No authorize response from wallet")
                    return@launch
                }
                clientSocket.close()

                val respRaw = Base64.decode(respMsg, Base64.URL_SAFE or Base64.NO_PADDING)
                val respNonce = respRaw.copyOfRange(0, 12)
                val respCipher = respRaw.copyOfRange(12, respRaw.size)
                val respPlain = decryptAesGcm(respCipher, sessionKey, respNonce)
                val respJson = JSONObject(String(respPlain, Charsets.UTF_8))

                val resultObj = respJson.optJSONObject("result")
                    ?: run {
                        val errMsg = respJson.optJSONObject("error")?.optString("message") ?: "Unknown error"
                        failWith("WALLET_ERROR", errMsg)
                        return@launch
                    }

                val accounts = resultObj.getJSONArray("accounts")
                val publicKey = accounts.getJSONObject(0).getString("address")
                val authToken = resultObj.getString("auth_token")

                withContext(Dispatchers.Main) {
                    pendingResult?.success(
                        mapOf("publicKey" to publicKey, "authToken" to authToken)
                    )
                    pendingResult = null
                }
            } catch (e: Exception) {
                failWith("ERROR", e.message ?: "Unknown MWA error")
            }
        }
    }

    private fun startMwaSign(
        authToken: String,
        txBase64: String,
        portMin: Int,
        portMax: Int,
        result: MethodChannel.Result,
    ) {
        if (pendingResult != null) {
            result.error("BUSY", "MWA operation already in progress", null)
            return
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            result.error("API_TOO_LOW", "MWA requires Android 12 (API 31). Device is API ${Build.VERSION.SDK_INT}.", null)
            return
        }
        pendingResult = result

        serverJob = scope.launch {
            try {
                // ── Step 1: Find open port ────────────────────────────────────────────
                val serverSocket = (portMin..portMax).firstNotNullOfOrNull { port ->
                    try { ServerSocket(port).also { it.soTimeout = 70_000 } }
                    catch (_: IOException) { null }
                }
                if (serverSocket == null) {
                    failWith("NO_PORT", "No free port in range $portMin–$portMax")
                    return@launch
                }
                val port = serverSocket.localPort

                // ── Step 2: X25519 keypair ────────────────────────────────────────────
                val keyGen = KeyPairGenerator.getInstance("XDH").also {
                    it.initialize(NamedParameterSpec.X25519)
                }
                val keyPair = keyGen.generateKeyPair()
                val rawPub = keyPair.public.encoded.takeLast(32).toByteArray()
                val pubB64 = Base64.encodeToString(rawPub, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)

                // ── Step 3: Build URI and open wallet for signing ─────────────────────
                val assocPayload = JSONObject().apply {
                    put("v", 1)
                    put("port", port)
                    put("pub", pubB64)
                }.toString()
                val assocB64 = Base64.encodeToString(
                    assocPayload.toByteArray(Charsets.UTF_8),
                    Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING
                )
                val walletUri = "solana-wallet://v1/associate?association=$assocB64"

                withContext(Dispatchers.Main) {
                    try {
                        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(walletUri)).also {
                            it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        })
                    } catch (e: ActivityNotFoundException) {
                        serverSocket.close()
                        failWith("NO_WALLET", "No MWA-compatible wallet installed")
                    }
                }

                // ── Step 4: Accept WebSocket connection ───────────────────────────────
                val clientSocket = try { serverSocket.accept() }
                catch (e: Exception) {
                    serverSocket.close()
                    failWith("TIMEOUT", "Wallet did not connect within 70 seconds")
                    return@launch
                }
                serverSocket.close()

                val ins  = clientSocket.getInputStream()
                val outs = clientSocket.getOutputStream()

                // ── Step 5: WebSocket handshake ───────────────────────────────────────
                if (!doWebSocketHandshake(ins, outs)) {
                    clientSocket.close()
                    failWith("WS_FAIL", "WebSocket handshake failed")
                    return@launch
                }

                // ── Step 6: ECDH ──────────────────────────────────────────────────────
                val helloFrame = readWsText(ins) ?: run {
                    clientSocket.close()
                    failWith("WS_FAIL", "No hello from wallet")
                    return@launch
                }
                val helloJson   = JSONObject(helloFrame)
                val walletPubB64 = helloJson.getString("pub")
                val walletPubRaw = Base64.decode(walletPubB64, Base64.URL_SAFE or Base64.NO_PADDING)

                val walletPubKey = buildX25519PublicKey(walletPubRaw)
                val ka = KeyAgreement.getInstance("XDH")
                ka.init(keyPair.private)
                ka.doPhase(walletPubKey, true)
                val sessionKey = MessageDigest.getInstance("SHA-256").digest(ka.generateSecret())

                sendWsText(outs, JSONObject().apply { put("pub", pubB64) }.toString())

                val rng = SecureRandom()

                // ── Step 7: Reauthorize ───────────────────────────────────────────────
                val nonce1 = ByteArray(12).also { rng.nextBytes(it) }
                val reAuthReqBytes = JSONObject().apply {
                    put("id", 1)
                    put("method", "reauthorize")
                    put("params", JSONObject().apply {
                        put("auth_token", authToken)
                        put("identity", JSONObject().apply {
                            put("uri", "https://solq.my.id")
                            put("icon", "https://solq.my.id/logo.png")
                            put("name", "SOLQ")
                        })
                    })
                }.toString().toByteArray(Charsets.UTF_8)

                sendWsText(outs, Base64.encodeToString(
                    nonce1 + encryptAesGcm(reAuthReqBytes, sessionKey, nonce1),
                    Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING
                ))

                val reAuthMsg = readWsText(ins) ?: run {
                    clientSocket.close()
                    failWith("WS_FAIL", "No reauthorize response from wallet")
                    return@launch
                }
                val reAuthRaw   = Base64.decode(reAuthMsg, Base64.URL_SAFE or Base64.NO_PADDING)
                val reAuthPlain = decryptAesGcm(
                    reAuthRaw.copyOfRange(12, reAuthRaw.size), sessionKey,
                    reAuthRaw.copyOfRange(0, 12)
                )
                val reAuthJson = JSONObject(String(reAuthPlain, Charsets.UTF_8))
                val reAuthResult = reAuthJson.optJSONObject("result")
                    ?: run {
                        val errMsg = reAuthJson.optJSONObject("error")?.optString("message") ?: "Reauthorize failed"
                        clientSocket.close()
                        failWith("WALLET_ERROR", errMsg)
                        return@launch
                    }
                val newAuthToken = reAuthResult.optString("auth_token").ifEmpty { authToken }

                // ── Step 8: sign_and_send_transactions ────────────────────────────────
                val nonce2 = ByteArray(12).also { rng.nextBytes(it) }
                val signReqBytes = JSONObject().apply {
                    put("id", 2)
                    put("method", "sign_and_send_transactions")
                    put("params", JSONObject().apply {
                        put("payloads", JSONArray().apply { put(txBase64) })
                        put("options", JSONObject().apply {
                            put("commitment", "confirmed")
                        })
                    })
                }.toString().toByteArray(Charsets.UTF_8)

                sendWsText(outs, Base64.encodeToString(
                    nonce2 + encryptAesGcm(signReqBytes, sessionKey, nonce2),
                    Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING
                ))

                val signMsg = readWsText(ins) ?: run {
                    clientSocket.close()
                    failWith("WS_FAIL", "No sign response from wallet")
                    return@launch
                }
                clientSocket.close()

                val signRaw   = Base64.decode(signMsg, Base64.URL_SAFE or Base64.NO_PADDING)
                val signPlain = decryptAesGcm(
                    signRaw.copyOfRange(12, signRaw.size), sessionKey,
                    signRaw.copyOfRange(0, 12)
                )
                val signJson = JSONObject(String(signPlain, Charsets.UTF_8))

                val signResult = signJson.optJSONObject("result")
                    ?: run {
                        val errMsg = signJson.optJSONObject("error")?.optString("message") ?: "Signing rejected"
                        failWith("WALLET_ERROR", errMsg)
                        return@launch
                    }

                val signatures = signResult.optJSONArray("signatures")
                val firstSig   = if (signatures != null && signatures.length() > 0) signatures.getString(0) else null

                if (firstSig.isNullOrEmpty()) {
                    failWith("NO_SIG", "No signature returned from wallet")
                    return@launch
                }

                withContext(Dispatchers.Main) {
                    pendingResult?.success(mapOf(
                        "signature" to firstSig,
                        "authToken" to newAuthToken,
                    ))
                    pendingResult = null
                }
            } catch (e: Exception) {
                failWith("ERROR", e.message ?: "Unknown signing error")
            }
        }
    }

    // ── WebSocket helpers ─────────────────────────────────────────────────────

    private fun doWebSocketHandshake(ins: InputStream, outs: OutputStream): Boolean {
        return try {
            val buf = ByteArray(4096)
            val n = ins.read(buf)
            if (n <= 0) return false
            val request = String(buf, 0, n)
            val wsKey = Regex("Sec-WebSocket-Key:\\s*(.+)").find(request)
                ?.groupValues?.get(1)?.trim() ?: return false
            val acceptKey = Base64.encodeToString(
                MessageDigest.getInstance("SHA-1").digest(
                    (wsKey + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").toByteArray()
                ), Base64.NO_WRAP
            )
            val response = "HTTP/1.1 101 Switching Protocols\r\n" +
                "Upgrade: websocket\r\nConnection: Upgrade\r\n" +
                "Sec-WebSocket-Accept: $acceptKey\r\n\r\n"
            outs.write(response.toByteArray())
            outs.flush()
            true
        } catch (_: Exception) { false }
    }

    private fun readWsText(ins: InputStream): String? {
        return try {
            val b1 = ins.read(); val b2 = ins.read()
            if (b1 < 0 || b2 < 0) return null
            val masked = (b2 and 0x80) != 0
            var payloadLen = (b2 and 0x7F).toLong()
            if (payloadLen == 126L) {
                payloadLen = ((ins.read() shl 8) or ins.read()).toLong()
            } else if (payloadLen == 127L) {
                payloadLen = 0L
                repeat(8) { payloadLen = (payloadLen shl 8) or ins.read().toLong() }
            }
            val mask = if (masked) ByteArray(4) { ins.read().toByte() } else null
            val payload = ByteArray(payloadLen.toInt()) { ins.read().toByte() }
            if (mask != null) payload.forEachIndexed { i, _ -> payload[i] = (payload[i].toInt() xor mask[i % 4].toInt()).toByte() }
            String(payload, Charsets.UTF_8)
        } catch (_: Exception) { null }
    }

    private fun sendWsText(outs: OutputStream, text: String) {
        val data = text.toByteArray(Charsets.UTF_8)
        val frame = mutableListOf<Byte>()
        frame.add(0x81.toByte()) // FIN + text opcode
        when {
            data.size <= 125 -> frame.add(data.size.toByte())
            data.size <= 65535 -> {
                frame.add(126.toByte())
                frame.add((data.size shr 8).toByte())
                frame.add((data.size and 0xFF).toByte())
            }
            else -> {
                frame.add(127.toByte())
                for (i in 7 downTo 0) frame.add(((data.size.toLong() shr (8 * i)) and 0xFF).toByte())
            }
        }
        outs.write((frame + data.toList()).toByteArray())
        outs.flush()
    }

    // ── Crypto helpers ────────────────────────────────────────────────────────

    private fun buildX25519PublicKey(rawBytes: ByteArray): java.security.PublicKey {
        // Wrap raw 32-byte X25519 key in SubjectPublicKeyInfo DER structure
        val header = byteArrayOf(
            0x30, 0x2A, // SEQUENCE
            0x30, 0x05, // SEQUENCE (AlgorithmIdentifier)
            0x06, 0x03, 0x2B, 0x65, 0x6E, // OID 1.3.101.110 (X25519)
            0x03, 0x21, 0x00 // BIT STRING, 33 bytes, 0 unused bits
        )
        val derEncoded = header + rawBytes
        val keyFactory = java.security.KeyFactory.getInstance("XDH")
        return keyFactory.generatePublic(java.security.spec.X509EncodedKeySpec(derEncoded))
    }

    private fun encryptAesGcm(plain: ByteArray, key: ByteArray, nonce: ByteArray): ByteArray {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, nonce))
        return cipher.doFinal(plain)
    }

    private fun decryptAesGcm(cipherText: ByteArray, key: ByteArray, nonce: ByteArray): ByteArray {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, nonce))
        return cipher.doFinal(cipherText)
    }

    private suspend fun failWith(code: String, msg: String) {
        withContext(Dispatchers.Main) {
            pendingResult?.error(code, msg, null)
            pendingResult = null
        }
    }
}
