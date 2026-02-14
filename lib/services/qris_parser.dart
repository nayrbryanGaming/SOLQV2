class ParsedQrisResult {
  final String merchantName;
  final String amount;
  final String acquirer;
  final bool isValid;
  final String? errorReason;

  ParsedQrisResult({
    required this.merchantName,
    required this.amount,
    required this.acquirer,
    required this.isValid,
    this.errorReason,
  });

  factory ParsedQrisResult.invalid(String reason) {
    return ParsedQrisResult(
      merchantName: "Unknown",
      amount: "0",
      acquirer: "Unknown",
      isValid: false,
      errorReason: reason,
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
    if (data['00'] != '01') return ParsedQrisResult.invalid("Invalid Payload Version (00)");
    if (!data.containsKey('01')) return ParsedQrisResult.invalid("Missing Point of Initiation (01)");
    if (!data.containsKey('52')) return ParsedQrisResult.invalid("Missing MCC (52)");
    
    // Currency Validation (IDR = 360)
    if (!data.containsKey('53')) return ParsedQrisResult.invalid("Missing Currency Code (53)");
    if (data['53'] != '360') return ParsedQrisResult.invalid("Invalid Currency: Must be IDR (360)");

    // Country Validation (ID)
    if (!data.containsKey('58')) return ParsedQrisResult.invalid("Missing Country Code (58)");
    if (data['58'] != 'ID') return ParsedQrisResult.invalid("Invalid Country: Must be ID");

    // Merchant Name
    if (!data.containsKey('59')) return ParsedQrisResult.invalid("Missing Merchant Name (59)");

    // Extract Data
    final merchant = data['59']!;
    final amount = data.containsKey('54') ? data['54']! : "0"; // 54 is optional in static QR, but we usually need it.
    
    // Acquirer Logic (Simplified)
    String acquirer = "Standard QRIS";
    if (data.containsKey('26')) acquirer = "Merchant Account (26)";
    else if (data.containsKey('51')) acquirer = "Merchant Account (51)";

    // HARD PROOF #3: REAL QRIS CRC VALIDATION (Tag 63)
    if (!data.containsKey('63')) return ParsedQrisResult.invalid("Missing CRC Checksum (63)");
    
    final providedCrc = data['63']!;
    // EMVCo Rule: CRC is over all data UP TO Tag 63 Length.
    // The payload ends with "6304" then the 4-char CRC.
    // So we take the substring from 0 to length - 4.
    final dataToValidate = payload.substring(0, payload.length - 4);
    final calculatedCrc = _calculateCrc16(dataToValidate);
    
    if (calculatedCrc.toUpperCase() != providedCrc.toUpperCase()) {
      return ParsedQrisResult.invalid("Invalid CRC Checksum. Real: $calculatedCrc, Provided: $providedCrc");
    }

    return ParsedQrisResult(
      merchantName: merchant,
      amount: amount,
      acquirer: acquirer,
      isValid: true,
    );
  }

  // CRC-16/CCITT-FALSE (Polynomial 0x1021, Initial 0xFFFF)
  static String _calculateCrc16(String data) {
    int crc = 0xFFFF;
    final bytes = data.codeUnits;
    
    for (var byte in bytes) {
      crc ^= (byte << 8);
      for (int i = 0; i < 8; i++) {
        if ((crc & 0x8000) != 0) {
          crc = (crc << 1) ^ 0x1021;
        } else {
          crc <<= 1;
        }
      }
    }
    
    // Mask to 16-bit
    crc &= 0xFFFF;
    return crc.toRadixString(16).toUpperCase().padLeft(4, '0');
  }
}
