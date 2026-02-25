class ParsedQrisResult {
  final String merchantName;
  final String amount;
  final bool isValid;
  final String? errorReason;
  final bool isStatic;
  final String? merchantAccount;

  ParsedQrisResult({
    required this.merchantName,
    required this.amount,
    required this.isValid,
    required this.isStatic,
    this.errorReason,
    this.merchantAccount,
  });

  factory ParsedQrisResult.invalid(String reason) {
    return ParsedQrisResult(
      merchantName: "Unknown",
      amount: "0",
      isValid: false,
      isStatic: true,
      errorReason: reason,
      merchantAccount: null,
    );
  }
}

class QrisParser {
  static ParsedQrisResult parse(String payload) {
    if (payload.isEmpty) return ParsedQrisResult.invalid("Empty Payload");

    final Map<String, String> data = {};
    int index = 0;

    try {
      while (index < payload.length) {
        if (index + 4 > payload.length) break;
        String id = payload.substring(index, index + 2);
        index += 2;
        String lengthStr = payload.substring(index, index + 2);
        index += 2;
        int length = int.tryParse(lengthStr) ?? 0;
        if (index + length > payload.length) break;
        String value = payload.substring(index, index + length);
        data[id] = value;
        index += length;
      }
    } catch (e) {
      return ParsedQrisResult.invalid("Malformed TLV Structure");
    }

    // MANDATORY VALIDATION (EMVCo)
    if (!data.containsKey('00')) return ParsedQrisResult.invalid("Missing Payload Format Indicator (00)");
    
    // Currency Validation (IDR = 360)
    if (!data.containsKey('53')) return ParsedQrisResult.invalid("Missing Currency Code (53)");
    if (data['53'] != '360') return ParsedQrisResult.invalid("Invalid Currency: Must be IDR (360)");

    // Country Validation (ID)
    if (!data.containsKey('58')) return ParsedQrisResult.invalid("Missing Country Code (58)");
    if (data['58'] != 'ID') return ParsedQrisResult.invalid("Invalid Country: Must be ID");

    // Merchant Name
    if (!data.containsKey('59')) return ParsedQrisResult.invalid("Missing Merchant Name (59)");

    // CRC VALIDATION (Tag 63)
    if (!data.containsKey('63')) return ParsedQrisResult.invalid("Missing CRC Checksum (63)");
    
    final providedCrc = data['63']!;
    // EMVCo Rule: CRC is over all data including "6304" but excluding the 4-char CRC itself.
    final dataToValidate = payload.substring(0, payload.length - 4);
    final calculatedCrc = _calculateCrc16(dataToValidate);
    
    if (calculatedCrc.toUpperCase() != providedCrc.toUpperCase()) {
      return ParsedQrisResult.invalid("CRC ERROR: Expected $providedCrc, Got $calculatedCrc");
    }

    // Extract Data
    final merchant = data['59']!;
    final String? amountStr = data['54'];
    final bool isStatic = amountStr == null || amountStr == "0" || amountStr.isEmpty;

    // Robust Merchant Account Extraction (26-45)
    String? account;
    for (int i = 26; i <= 45; i++) {
      final tagData = data[i.toString()];
      if (tagData != null) {
        // QRIS Merchant Info is usually a nested TLV string
        // We look for sub-tag 01 (PAN) first, then 02/03 (External ID)
        final nested = _parseNested(tagData);
        account = nested['01'] ?? nested['02'] ?? nested['03'];
        if (account != null) break;
      }
    }

    return ParsedQrisResult(
      merchantName: merchant,
      amount: isStatic ? "0" : amountStr,
      isValid: true,
      isStatic: isStatic,
      merchantAccount: account,
    );
  }

  static Map<String, String> _parseNested(String nested) {
    final Map<String, String> result = {};
    int idx = 0;
    while (idx < nested.length - 4) {
      try {
        String idInfo = nested.substring(idx, idx + 2);
        int lInfo = int.parse(nested.substring(idx + 2, idx + 4));
        result[idInfo] = nested.substring(idx + 4, idx + 4 + lInfo);
        idx += 4 + lInfo;
      } catch (_) { break; }
    }
    return result;
  }

  // CRC-16/CCITT-FALSE (Polynomial 0x1021, Initial 0xFFFF)
  static String _calculateCrc16(String data) {
    int crc = 0xFFFF;
    final bytes = data.codeUnits;
    
    for (var byte in bytes) {
      crc ^= (byte << 8);
      for (int i = 0; i < 8; i++) {
        if ((crc & 0x8000) != 0) {
          crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
        } else {
          crc = (crc << 1) & 0xFFFF;
        }
      }
    }
    return crc.toRadixString(16).toUpperCase().padLeft(4, '0');
  }
}

