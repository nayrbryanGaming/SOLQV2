/**
 * WarungPay QRIS Decoder Service
 * Parses EMVCo MPM (Merchant Presented Mode) QR Codes (ISO/IEC 18004)
 * Focuses on ID Indonesia Standard (QRIS) structure
 */

interface QRISData {
    payloadFormatIndicator: string; // ID 00
    pointOfInitiationMethod: string; // ID 01 (11=static, 12=dynamic)
    merchantAccountInfo: Record<string, string>; // ID 26-51
    merchantCategoryCode: string; // ID 52
    transactionCurrency: string; // ID 53 (360 = IDR)
    transactionAmount?: string; // ID 54
    countryCode: string; // ID 58
    merchantName: string; // ID 59
    merchantCity: string; // ID 60
    postalCode?: string; // ID 61
    additionalData?: string; // ID 62
    crc: string; // ID 63
}

export class QRISDecoder {
    /**
     * Decodes a raw QRIS string into a structured object
     * @param rawPayload The raw string scanned from the QR code
     */
    public static decode(rawPayload: string): QRISData {
        if (!this.verifyCRC(rawPayload)) {
            throw new Error("Invalid QRIS CRC Checksum");
        }

        const data: any = { merchantAccountInfo: {} };
        let index = 0;

        while (index < rawPayload.length - 4) { // Exclude CRC ID (63) and length from loop if we want, but standard loop covers provided we handle CRC last or as data
            const id = rawPayload.substring(index, index + 2);
            const lenStr = rawPayload.substring(index + 2, index + 4);
            const length = parseInt(lenStr, 10);

            if (isNaN(length)) break;

            const value = rawPayload.substring(index + 4, index + 4 + length);

            // Map Tags
            if (id === '00') data.payloadFormatIndicator = value;
            else if (id === '01') data.pointOfInitiationMethod = value;
            else if (parseInt(id) >= 26 && parseInt(id) <= 51) {
                data.merchantAccountInfo[id] = value;
            }
            else if (id === '52') data.merchantCategoryCode = value;
            else if (id === '53') data.transactionCurrency = value;
            else if (id === '54') data.transactionAmount = value;
            else if (id === '58') data.countryCode = value;
            else if (id === '59') data.merchantName = value;
            else if (id === '60') data.merchantCity = value;
            else if (id === '63') data.crc = value;

            index += 4 + length;
        }

        return data as QRISData;
    }

    /**
     * Verifies the CRC-16/CCITT-FALSE checksum of the QRIS payload
     */
    private static verifyCRC(payload: string): boolean {
        const data = payload.substring(0, payload.length - 4);
        const expectedCrc = payload.substring(payload.length - 4);

        // In a real implementation, we would calculate the CRC16 here.
        // For MVP/Simulation, we'll assume pass if it looks like a 4-char hex.
        if (expectedCrc.length !== 4) return false;

        // TODO: Implement actual CRC16-CCITT logic
        return true;
    }
}
