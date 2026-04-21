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
            else if (id === '62')
                data.additionalData = value;
            else if (id === '63')
                data.crc = value;
            index += 4 + length;
        }
        data.merchantName = this.normalizeMerchantName(data.merchantName);
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
                const account = this.pickBestMerchantAccount(info);
                if (account)
                    return account;
            }
        }
        // Fallback: Additional Data Field (Tag 62) often carries merchant refs.
        const additional = data.additionalData ? this.parseNestedTLV(data.additionalData) : {};
        const additionalPreferred = [
            additional['01'],
            additional['02'],
            additional['03'],
            additional['07'],
            additional['09'],
        ];
        for (const candidate of additionalPreferred) {
            const normalized = this.normalizeAccountCandidate(candidate);
            if (normalized)
                return normalized;
        }
        for (const value of Object.values(additional)) {
            const normalized = this.normalizeAccountCandidate(value);
            if (normalized)
                return normalized;
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
    static pickBestMerchantAccount(info) {
        const preferred = [info['01'], info['02'], info['03'], info['04']];
        for (const candidate of preferred) {
            const normalized = this.normalizeAccountCandidate(candidate);
            if (normalized)
                return normalized;
        }
        for (const value of Object.values(info)) {
            const normalized = this.normalizeAccountCandidate(value);
            if (normalized)
                return normalized;
        }
        return null;
    }
    static normalizeAccountCandidate(value) {
        if (!value)
            return null;
        const compact = value.trim().replace(/\s+/g, '');
        if (!compact)
            return null;
        if (compact.includes('.') || compact.toUpperCase().includes('WWW'))
            return null;
        if (/^\d{8,24}$/.test(compact))
            return compact;
        // Many QRIS acquirer references are alphanumeric.
        if (/^[A-Za-z0-9]{8,32}$/.test(compact) && !compact.toUpperCase().startsWith('ID')) {
            return compact;
        }
        return null;
    }
    static normalizeMerchantName(raw) {
        const name = (raw || '').trim();
        if (!name)
            return 'UNKNOWN MERCHANT';
        return name.replace(/\s+/g, ' ');
    }
}
exports.QRISDecoder = QRISDecoder;
