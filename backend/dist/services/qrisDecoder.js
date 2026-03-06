"use strict";
/**
 * SOLQ QRIS Decoder Service
 * Parses EMVCo MPM (Merchant Presented Mode) QR Codes (ISO/IEC 18004)
 * Focuses on ID Indonesia Standard (QRIS) structure
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.QRISDecoder = void 0;
class QRISDecoder {
    /**
     * Decodes a raw QRIS string into a structured object
     * CRC is checked but non-fatal — real-world QR scans may have slight issues.
     */
    static decode(rawPayload) {
        const crcOk = this.verifyCRC(rawPayload);
        if (!crcOk) {
            console.warn("[QRIS] CRC mismatch — proceeding with parse (camera scan tolerance)");
        }
        const data = { merchantAccountInfo: {}, crc_valid: crcOk };
        let index = 0;
        while (index < rawPayload.length - 4) { // Exclude CRC ID (63) and length from loop if we want, but standard loop covers provided we handle CRC last or as data
            const id = rawPayload.substring(index, index + 2);
            const lenStr = rawPayload.substring(index + 2, index + 4);
            const length = parseInt(lenStr, 10);
            if (isNaN(length))
                break;
            const value = rawPayload.substring(index + 4, index + 4 + length);
            // Map Tags
            if (id === '00')
                data.payloadFormatIndicator = value;
            else if (id === '01')
                data.pointOfInitiationMethod = value;
            else if (parseInt(id) >= 26 && parseInt(id) <= 51) {
                data.merchantAccountInfo[id] = this.parseNestedTLV(value);
            }
            else if (id === '52')
                data.merchantCategoryCode = value;
            else if (id === '53')
                data.transactionCurrency = value;
            else if (id === '54')
                data.transactionAmount = value;
            else if (id === '58')
                data.countryCode = value;
            else if (id === '59')
                data.merchantName = value;
            else if (id === '60')
                data.merchantCity = value;
            else if (id === '63')
                data.crc = value;
            index += 4 + length;
        }
        return data;
    }
    static parseNestedTLV(payload) {
        const result = {};
        let index = 0;
        while (index < payload.length) {
            const id = payload.substring(index, index + 2);
            const lenStr = payload.substring(index + 2, index + 4);
            const length = parseInt(lenStr, 10);
            if (isNaN(length))
                break;
            const value = payload.substring(index + 4, index + 4 + length);
            result[id] = value;
            index += 4 + length;
        }
        return result;
    }
    /**
     * Verifies the CRC-16/CCITT-FALSE checksum of the QRIS payload
     * EMVCo Rule: CRC is over all data including "6304" but excluding the 4-char CRC itself.
     */
    static verifyCRC(payload) {
        if (payload.length < 4)
            return false;
        const data = payload.substring(0, payload.length - 4);
        const expectedCrc = payload.substring(payload.length - 4).toUpperCase();
        let crc = 0xFFFF;
        for (let i = 0; i < data.length; i++) {
            crc ^= (data.charCodeAt(i) << 8);
            for (let j = 0; j < 8; j++) {
                if ((crc & 0x8000) !== 0) {
                    crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
                }
                else {
                    crc = (crc << 1) & 0xFFFF;
                }
            }
        }
        const calculatedCrc = crc.toString(16).toUpperCase().padStart(4, '0');
        return calculatedCrc === expectedCrc;
    }
    /**
     * EXTRACT ACCOUNT NUMBER / PAN
     * Robustly searches all common QRIS slots for the merchant account.
     */
    static extractAccountNumber(data) {
        // Search Tags 26 to 51 (Merchant Account Information)
        for (let i = 26; i <= 51; i++) {
            const tag = i.toString();
            const info = data.merchantAccountInfo[tag];
            if (info) {
                // Priority: Sub-tag 01 (PAN) then 02/03 (Merchant ID)
                const account = info['01'] || info['02'] || info['03'];
                if (account && account !== '00')
                    return account;
            }
        }
        return null;
    }
    /**
     * DETECT BANK/ISSUER CODE
     * Maps Global ID or Merchant Account sub-tags to common Indonesian Banks
     */
    static detectBank(data) {
        const merchantInfo = data.merchantAccountInfo['26'] || data.merchantAccountInfo['27'] || {};
        const globalId = (merchantInfo['00'] || '').toUpperCase();
        if (globalId.includes('GOPAY'))
            return 'GOPAY';
        if (globalId.includes('SHOPEE'))
            return 'SHOPEE';
        if (globalId.includes('DANA'))
            return 'DANA';
        if (globalId.includes('OVO'))
            return 'OVO';
        if (globalId.includes('AIRCASH'))
            return 'LINKAJA'; // LinkAja often appears as Aircash
        if (globalId.includes('BCA'))
            return 'BCA';
        // NMID Prefix detection (Experimental)
        const nmid = this.extractAccountNumber(data);
        if (nmid) {
            if (nmid.startsWith('ID1025'))
                return 'GOPAY'; // Common GoPay NMID prefix
            if (nmid.startsWith('ID1011'))
                return 'BCA';
        }
        return 'UNKNOWN';
    }
}
exports.QRISDecoder = QRISDecoder;
