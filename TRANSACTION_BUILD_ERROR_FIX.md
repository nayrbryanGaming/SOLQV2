# 🔧 SOLQ Transaction Build Error — Solusi Lengkap

## ❌ **Error: "Transaction Build Failed"**

Anda lihat error ini ketika mencoba membayar QRIS dengan SOL di mainnet:

```
Gagal membangun transaksi Jupiter swap. 
Pastikan wallet terkoneksi, saldo SOL/USDC cukup, lalu coba lagi.
```

---

## 🎯 **PENYEBAB ERROR**

1. **ExactOut Mode Terlalu Ketat**
   - SOLQ menggunakan `ExactOut` mode untuk Jupiter swap
   - Ini memastikan user dapat EXACT amount IDR yang diinginkan
   - TAPI jika liquidity tidak cukup, Jupiter gagal
   - Problem: ExactOut memerlukan rute swap yang sangat precise

2. **Insufficient Liquidity di SOL→USDC→IDRX Path**
   - Jupiter lite-api mainnet mungkin tidak selalu punya liquidity untuk semua amount
   - Terutama untuk amount besar (>Rp 5 juta)
   - SOL/USDC pair di Jupiter mungkin low-liquidity di saat tertentu

3. **Insufficient Saldo**
   - Wallet perlu: SOL + USDC + gas fee
   - Minimum: 0.1 SOL + USDC untuk jumlah yang diinginkan

---

## ✅ **SOLUSI CEPAT (LANGSUNG BISA)**

### **Option 1: Gunakan DEVNET Untuk Test**

**Mainnet (real money, error):**
```
https://solqv2.vercel.app  ❌ Error
```

**Devnet (free SOL, untuk testing):**
```
https://solq-demo.vercel.app  ✅ Gunakan ini dulu!
```

**Step-by-step:**

1. **Buka devnet version:**
   ```
   https://solq-demo.vercel.app
   ```

2. **Set wallet ke Devnet:**
   - Buka Phantom
   - Klik avatar → Settings
   - Network: Change to **Devnet**

3. **Dapat SOL gratis:**
   ```
   https://faucet.solana.com
   ```
   - Paste wallet address
   - Klik "Airdrop" → dapat 2 SOL gratis di devnet

4. **Test SOLQ di devnet:**
   - Scan QRIS (pakai merchant asli atau test QRIS)
   - Bayar dengan free SOL (tidak ada risiko)
   - Check apakah transaksi berhasil

**Di devnet tidak ada risiko** karena tidak ada real money!

---

### **Option 2: Perbaikan Kode (Sudah Diimplementasi ✅)**

Kami sudah fix backend dengan **ExactIn fallback mode**:

#### **Apa yang berubah:**

**SEBELUM (hanya ExactOut):**
```typescript
swapMode: 'ExactOut'     // Harus EXACT output IDR
// Jika gagal → ERROR
```

**SESUDAH (ExactOut + ExactIn fallback):**
```typescript
// Step 1: Try ExactOut (strict mode)
swapMode: 'ExactOut'    ← Coba dulu

// Jika gagal...
// Step 2: Fallback to ExactIn (relaxed mode)  
swapMode: 'ExactIn'     ← Fallback option
platformFeeBps: '25'    ← Fee dikurangi 0.25% (dari 0.5%)
slippageBps: '200'      ← Slippage 2% (dari 1%)
```

#### **Benefit dari fix ini:**

✅ **ExactOut Success** → Exact amount IDR user dapat  
✅ **ExactOut Fail → ExactIn Fallback** → Transaksi tetap berhasil  
✅ **Better Error Messages** → User tahu harus apa  
✅ **Reduced Fees** → Fee temporary dikurangi saat fallback  

---

## 🚀 **DEPLOYMENT FIX**

Kode sudah diperbaiki di:

1. **Backend:** `backend/src/services/solanaService.ts`
   - Baris 108-150: ExactOut + ExactIn fallback logic
   - Better error messages dengan debugging tips

2. **Frontend:** 
   - `web-live/index.html` (mainnet app)
   - `public/index.html` (public build)
   - `public/app/index.html` (app build)
   - Error message baru menunjukkan: devnet link, debugging tips, solusi

---

## 📋 **CHECKLIST SEBELUM TRANSAKSI**

Di mainnet (`https://solqv2.vercel.app`), pastikan:

- ✅ **Wallet connected** → Phantom terhubung
- ✅ **Wallet set to mainnet** → Phantom network = Mainnet-Beta
- ✅ **Saldo cukup:**
  - SOL: minimum 0.1 SOL (untuk gas + swap input)
  - USDC: jika pakai USDC, harus cukup untuk amount
- ✅ **Amount reasonable:**
  - Coba amount kecil dulu (Rp 50,000)
  - Jika berhasil, naik ke amount lebih besar
- ✅ **Network stable:**
  - Check https://status.solana.com
  - Jika red flag, tunggu sebelum transaksi

---

## 🔍 **DEBUGGING TIPS**

Jika masih error:

1. **Refresh page**
   ```
   Ctrl+F5  (clear cache + reload)
   ```

2. **Restart wallet**
   - Close Phantom
   - Open kembali
   - Reconnect ke SOLQ

3. **Check wallet balance**
   ```
   Buka Phantom → check SOL + USDC balance
   ```

4. **Try smaller amount**
   ```
   Dari Rp 1 juta → coba Rp 100,000
   Ini untuk debug apakah liquidity issue
   ```

5. **Check network status**
   ```
   https://status.solana.com
   ```
   - Jika ada red flags, tunggu

6. **Use devnet for testing**
   ```
   https://solq-demo.vercel.app
   (Tanpa risiko, dapat SOL gratis)
   ```

---

## 📞 **ERROR MESSAGE BARU (UX IMPROVEMENT)**

User sekarang akan lihat detailed error message:

```
Transaksi Jupiter gagal dibangun. Kemungkinan penyebab:

1. ✅ GUNAKAN DEVNET DULU UNTUK TEST:
   → https://solq-demo.vercel.app
   → Dapat SOL gratis di https://faucet.solana.com
   
2. ⚠️  Saldo tidak cukup:
   - Perlu SOL + USDC untuk swap
   - Plus gas fee (~0.01 SOL)
   
3. 💡 Coba jumlah lebih kecil
   - ExactOut mode memerlukan liquidity cukup
   
4. 🔄 Jika masih error, coba:
   - Refresh page
   - Restart wallet
   - Buka devnet version dulu untuk debug

Konsultasi: support@solq.app
```

---

## 🛠️ **TECHNICAL DETAILS**

### **Jupiter Swap Modes:**

| Mode | Input | Output | Use Case | Benefit |
|------|-------|--------|----------|---------|
| **ExactOut** | Variable | Fixed | Primary (SOLQ) | Exact IDR amount |
| **ExactIn** | Fixed | Variable | Fallback | Less strict, higher success |

### **Fee Structure:**

| Mode | Fee | Slippage |
|------|-----|----------|
| ExactOut | 0.5% (50 bps) | 1% (100 bps) |
| ExactIn | 0.25% (25 bps) | 2% (200 bps) |

---

## 📊 **SOLUSI SUMMARY**

| Problem | Root Cause | Solusi |
|---------|-----------|--------|
| Transaction Build Failed | ExactOut no liquidity | ExactIn fallback |
| Mainnet error | Low liquidity path | Use devnet first |
| User confusion | Bad error message | Better UX messages |
| Strict mode fail | ExactOut too strict | Relaxed slippage |

---

## ✅ **STATUS DEPLOYMENT**

- ✅ Backend fix: DEPLOYED (ExactIn fallback)
- ✅ Frontend UX: UPDATED (3 frontends)
- ✅ Error messages: IMPROVED
- ✅ Devnet fallback: AVAILABLE
- ✅ Documentation: CREATED

**Status:** READY FOR PRODUCTION

---

**Last Updated:** May 12, 2026
**Version:** 2.0 (Fallback Logic)
**Tested:** ✅ Yes

