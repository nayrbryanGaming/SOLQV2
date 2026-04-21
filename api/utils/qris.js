const ACCOUNT_TAG_MIN = 26;
const ACCOUNT_TAG_MAX = 51;

function parseNestedTlv(payload) {
  const result = {};
  let index = 0;

  while (index + 4 <= payload.length) {
    const id = payload.substring(index, index + 2);
    const length = Number.parseInt(payload.substring(index + 2, index + 4), 10);
    if (Number.isNaN(length) || length < 0) break;

    const valueStart = index + 4;
    const valueEnd = valueStart + length;
    if (valueEnd > payload.length) break;

    result[id] = payload.substring(valueStart, valueEnd);
    index = valueEnd;
  }

  return result;
}

function calculateCrc16(data) {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i += 1) {
    crc ^= data.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function verifyCrc(payload) {
  if (!payload || payload.length < 8) return false;
  const declared = payload.slice(-4).toUpperCase();
  const body = payload.slice(0, -4);
  const computed = calculateCrc16(body);
  return declared === computed;
}

function ensureMandatoryQrisFields(data, payload) {
  const warnings = [];

  if (data.payloadFormatIndicator !== '01') {
    throw new Error('Invalid QRIS tag 00 (payload format indicator)');
  }

  if (data.transactionCurrency !== '360') {
    warnings.push('QRIS tag 53 is not 360/IDR');
  }

  if (data.countryCode !== 'ID') {
    warnings.push('QRIS tag 58 is not ID');
  }

  const merchant = String(data.merchantName || '').trim();
  if (!merchant) {
    throw new Error('Invalid QRIS tag 59 (merchant name missing)');
  }

  const crcTagPrefix = payload.slice(-8, -4);
  if (crcTagPrefix !== '6304') {
    warnings.push('QRIS CRC field placement is not canonical (tag 63)');
  }

  if (!data.crc_valid) {
    warnings.push('QRIS CRC checksum mismatch (tag 63)');
  }

  return warnings;
}

function normalizeMerchantName(rawName) {
  const value = String(rawName || '').trim().replace(/\s+/g, ' ');
  return value || 'UNKNOWN MERCHANT';
}

function toTitleCaseWords(input) {
  return String(input || '')
    .toLowerCase()
    .split(' ')
    .map((word) => {
      if (word.length <= 2 && /^[a-z]+$/.test(word)) {
        return word.toUpperCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ')
    .trim();
}

function buildMerchantNameDisplay(merchantName) {
  const normalized = normalizeMerchantName(merchantName);
  if (normalized === 'UNKNOWN MERCHANT') {
    return normalized;
  }

  const compact = normalized.replace(/\s+/g, '');
  const mostlyUppercase = compact.length > 0 && compact === compact.toUpperCase();
  return mostlyUppercase ? toTitleCaseWords(normalized) : normalized;
}

function normalizeTextCandidate(value) {
  if (typeof value !== 'string') return null;
  const normalized = value
    .replace(/[^\x20-\x7E]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
  return normalized.length > 0 ? normalized : null;
}

function extractLooseTagValue(payload, tag) {
  if (!payload || typeof payload !== 'string') return null;
  if (!/^\d{2}$/.test(tag)) return null;

  const pattern = new RegExp(`${tag}(\\d{2})`, 'g');
  while (true) {
    const match = pattern.exec(payload);
    if (!match) break;

    const length = Number.parseInt(match[1], 10);
    if (!Number.isFinite(length) || length <= 0) continue;

    const valueStart = match.index + 4;
    const valueEnd = valueStart + length;
    if (valueEnd > payload.length) continue;

    const candidate = payload.substring(valueStart, valueEnd);
    if (candidate.trim().length > 0) {
      return candidate;
    }
  }

  return null;
}

function normalizeAccountCandidate(candidate) {
  if (candidate === undefined || candidate === null) return null;
  const compact = String(candidate).trim().replace(/\s+/g, '');
  if (!compact) return null;

  const upper = compact.toUpperCase();
  if (upper.includes('WWW') || compact.includes('.')) return null;

  if (/^\d{8,24}$/.test(compact)) return compact;
  if (/^[A-Za-z0-9]{8,32}$/.test(compact) && !upper.startsWith('ID')) return compact;
  return null;
}

function normalizeMerchantIdCandidate(candidate) {
  if (candidate === undefined || candidate === null) return null;
  const compact = String(candidate).trim().replace(/\s+/g, '');
  if (!compact) return null;

  const upper = compact.toUpperCase();
  if (upper.includes('WWW') || compact.includes('.')) return null;

  if (/^ID\d{8,24}$/i.test(compact)) return upper;
  if (/^\d{12,24}$/.test(compact)) return compact;

  return null;
}

function pickBestMerchantAccount(nestedTlv) {
  const preferred = [nestedTlv['01'], nestedTlv['02'], nestedTlv['03'], nestedTlv['04']];
  for (const value of preferred) {
    const normalized = normalizeAccountCandidate(value);
    if (normalized) return normalized;
  }

  for (const value of Object.values(nestedTlv)) {
    const normalized = normalizeAccountCandidate(value);
    if (normalized) return normalized;
  }

  return null;
}

function detectBank(decoded) {
  const account26 = decoded.merchantAccountInfo['26'] || {};
  const account27 = decoded.merchantAccountInfo['27'] || {};
  const globalId = String(account26['00'] || account27['00'] || '').toUpperCase();

  if (globalId.includes('GOPAY')) return 'GOPAY';
  if (globalId.includes('SHOPEE')) return 'SHOPEE';
  if (globalId.includes('DANA')) return 'DANA';
  if (globalId.includes('OVO')) return 'OVO';
  if (globalId.includes('AIRCASH')) return 'LINKAJA';
  if (globalId.includes('BCA')) return 'BCA';

  const account = decoded.merchantAccount;
  if (typeof account === 'string' && account.startsWith('ID1011')) return 'BCA';
  if (typeof account === 'string' && account.startsWith('ID1025')) return 'GOPAY';

  return 'UNKNOWN';
}

function extractMerchantAccount(decoded) {
  for (let tag = ACCOUNT_TAG_MIN; tag <= ACCOUNT_TAG_MAX; tag += 1) {
    const nested = decoded.merchantAccountInfo[String(tag)];
    if (!nested) continue;
    const account = pickBestMerchantAccount(nested);
    if (account) return account;
  }

  const additional = decoded.additionalData || {};
  const preferred = [additional['01'], additional['02'], additional['03'], additional['07'], additional['09']];
  for (const value of preferred) {
    const normalized = normalizeAccountCandidate(value);
    if (normalized) return normalized;
  }

  for (const value of Object.values(additional)) {
    const normalized = normalizeAccountCandidate(value);
    if (normalized) return normalized;
  }

  return null;
}

function extractMerchantId(decoded, rawPayload = '') {
  const additional = decoded.additionalData || {};

  const preferredAdditionalTags = ['03', '07', '09', '01', '02', '05'];
  for (const tag of preferredAdditionalTags) {
    const normalized = normalizeMerchantIdCandidate(additional[tag]);
    if (normalized) return normalized;
  }

  for (let tag = ACCOUNT_TAG_MIN; tag <= ACCOUNT_TAG_MAX; tag += 1) {
    const nested = decoded.merchantAccountInfo[String(tag)];
    if (!nested) continue;

    const preferredNestedTags = [
      '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15',
      '01', '02',
    ];

    for (const nestedTag of preferredNestedTags) {
      const normalized = normalizeMerchantIdCandidate(nested[nestedTag]);
      if (normalized) return normalized;
    }

    for (const value of Object.values(nested)) {
      const normalized = normalizeMerchantIdCandidate(value);
      if (normalized) return normalized;
    }
  }

  if (typeof rawPayload === 'string' && rawPayload.trim().length > 0) {
    const looseAdditional = extractLooseTagValue(rawPayload, '62');
    if (looseAdditional) {
      const nestedLoose = parseNestedTlv(looseAdditional);
      for (const looseTag of preferredAdditionalTags) {
        const normalized = normalizeMerchantIdCandidate(nestedLoose[looseTag]);
        if (normalized) return normalized;
      }

      for (const value of Object.values(nestedLoose)) {
        const normalized = normalizeMerchantIdCandidate(value);
        if (normalized) return normalized;
      }
    }

    for (let tag = ACCOUNT_TAG_MIN; tag <= ACCOUNT_TAG_MAX; tag += 1) {
      const looseValue = extractLooseTagValue(rawPayload, String(tag));
      if (!looseValue) continue;
      const nestedLoose = parseNestedTlv(looseValue);

      const preferredNestedTags = [
        '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15',
        '01', '02',
      ];

      for (const nestedTag of preferredNestedTags) {
        const normalized = normalizeMerchantIdCandidate(nestedLoose[nestedTag]);
        if (normalized) return normalized;
      }

      for (const value of Object.values(nestedLoose)) {
        const normalized = normalizeMerchantIdCandidate(value);
        if (normalized) return normalized;
      }
    }
  }

  return null;
}

export function decodeQris(rawPayload) {
  const payload = String(rawPayload || '').trim();
  if (!payload) throw new Error('Empty QRIS payload');
  if (payload.length < 20) throw new Error('QRIS payload too short');

  const data = {
    merchantAccountInfo: {},
    additionalData: {},
    crc_valid: verifyCrc(payload),
  };

  let index = 0;
  while (index + 4 <= payload.length) {
    const tag = payload.substring(index, index + 2);
    const length = Number.parseInt(payload.substring(index + 2, index + 4), 10);
    if (Number.isNaN(length) || length < 0) break;

    const valueStart = index + 4;
    const valueEnd = valueStart + length;
    if (valueEnd > payload.length) break;

    const value = payload.substring(valueStart, valueEnd);

    if (tag === '00') data.payloadFormatIndicator = value;
    else if (tag === '01') data.pointOfInitiationMethod = value;
    else if (Number.parseInt(tag, 10) >= ACCOUNT_TAG_MIN && Number.parseInt(tag, 10) <= ACCOUNT_TAG_MAX) {
      data.merchantAccountInfo[tag] = parseNestedTlv(value);
    } else if (tag === '52') data.merchantCategoryCode = value;
    else if (tag === '53') data.transactionCurrency = value;
    else if (tag === '54') data.transactionAmount = value;
    else if (tag === '58') data.countryCode = value;
    else if (tag === '59') data.merchantName = value;
    else if (tag === '60') data.merchantCity = value;
    else if (tag === '61') data.postalCode = value;
    else if (tag === '62') data.additionalData = parseNestedTlv(value);
    else if (tag === '63') data.crc = value;

    index = valueEnd;
  }

  // Some QRIS strings from camera OCR can have malformed sections but still
  // carry readable merchant tags. Recover critical user-facing fields safely.
  const looseMerchantName = normalizeTextCandidate(
    extractLooseTagValue(payload, '59'),
  );
  const looseAmount = extractLooseTagValue(payload, '54');
  const looseCurrency = extractLooseTagValue(payload, '53');
  const looseCountry = normalizeTextCandidate(extractLooseTagValue(payload, '58'));

  const normalizedMerchant = normalizeMerchantName(data.merchantName);
  const merchantNameSource =
    normalizedMerchant === 'UNKNOWN MERCHANT' && looseMerchantName
      ? 'tag59_loose_recovery'
      : 'tag59';
  data.merchantName =
    normalizedMerchant === 'UNKNOWN MERCHANT' && looseMerchantName
      ? looseMerchantName
      : normalizedMerchant;
  data.merchantNameDisplay = buildMerchantNameDisplay(data.merchantName);

  if (!data.transactionAmount && typeof looseAmount === 'string') {
    const compactAmount = looseAmount.trim();
    if (/^\d+(\.\d{1,2})?$/.test(compactAmount)) {
      data.transactionAmount = compactAmount;
    }
  }

  if (data.transactionCurrency !== '360' && looseCurrency === '360') {
    data.transactionCurrency = '360';
  }

  if (data.countryCode !== 'ID' && looseCountry === 'ID') {
    data.countryCode = 'ID';
  }

  data.validationWarnings = ensureMandatoryQrisFields(data, payload);

  data.merchantAccount = extractMerchantAccount(data);
  data.merchantId = extractMerchantId(data, payload) || null;
  data.bankCode = detectBank(data);
  data.qrisType = data.pointOfInitiationMethod === '12' ? 'DYNAMIC' : 'STATIC';
  data.amountMode = data.transactionAmount ? 'LOCKED_FROM_QR' : 'INPUT_REQUIRED';
  data.translation = {
    merchant_name: data.merchantNameDisplay || data.merchantName,
    merchant_name_source: merchantNameSource,
    merchant_id: data.merchantId,
    merchant_id_source: data.merchantId ? 'qris_extracted' : null,
    merchant_account: data.merchantAccount,
    bank_code: data.bankCode,
    qris_type: data.qrisType,
    amount_mode: data.amountMode,
    amount_from_qr: data.transactionAmount || null,
    currency: data.transactionCurrency === '360' ? 'IDR' : data.transactionCurrency,
    validation_warnings: data.validationWarnings || [],
  };

  return data;
}
