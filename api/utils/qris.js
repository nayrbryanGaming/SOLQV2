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

// QRIS acquirer/institution lookup tables (Bank Indonesia NMID prefix + globalId keywords)
// Covers 100+ Indonesian banks, e-wallets, and payment acquirers per BI QRIS spec.
const GLOBAL_ID_MAP = [
  // ── E-Wallets ──────────────────────────────────────────────────────────────
  ['GOPAY',       ['GOPAY','GO-PAY','GOJEK']],
  ['SHOPEEPAY',   ['SHOPEE','SHOPEEPAY','SEA MONEY','SEAMONEY','AIRPAY']],
  ['DANA',        ['DANA','EMTEK']],
  ['OVO',         ['OVO','VISIONET']],
  ['LINKAJA',     ['AIRCASH','LINKAJA','LINK AJA','TELKOMSEL','TCASH']],
  ['JENIUS',      ['JENIUS','BTPN JENIUS']],
  ['DOKU',        ['DOKU','NUSA SATU']],
  ['KREDIVO',     ['KREDIVO','FINACCEL']],
  ['AKULAKU',     ['AKULAKU']],
  ['INDODANA',    ['INDODANA']],
  ['JAGO',        ['JAGO','BANK JAGO','ARTHA GRAHA INTERNASIONAL']],
  ['SEABANK',     ['SEABANK','SEA BANK','PT BANK SEABANK']],
  ['BLU',         ['BLU','BCA DIGITAL']],
  ['NEOBANK',     ['NEOBANK','NEO COMMERCE','BANK NEO']],
  ['MOTION',      ['MOTION BANKING','MNC BANK','MEDIA NUSANTARA CITRA']],
  ['BYOND',       ['BYOND','BANK KB BUKOPIN']],
  ['SUPERBANK',   ['SUPERBANK','GRAB FINANCIAL']],
  ['LIVIN',       ['LIVIN','MANDIRI LIVIN']],
  ['BRIMO',       ['BRIMO','BRI MOBILE']],
  ['SAKUKU',      ['SAKUKU','BCA SAKUKU']],
  ['ISAKU',       ['ISAKU','INDOSAT']],
  ['PAYTREN',     ['PAYTREN']],
  ['FLIP',        ['FLIP','PT FLIPTECH']],
  ['ESPAY',       ['ESPAY','PT ESPAY']],
  ['FASPAY',      ['FASPAY','PT BIMASAKTI']],
  ['NICEPAY',     ['NICEPAY','INFONOX']],
  ['MIDTRANS',    ['MIDTRANS','GOJEK MIDTRANS']],
  ['XENDIT',      ['XENDIT']],
  // ── Government / BI ────────────────────────────────────────────────────────
  ['BI-FAST',     ['BIFAST','BI-FAST','BANK INDONESIA','SKNBI']],
  // ── State-Owned Banks (BUMN) ───────────────────────────────────────────────
  ['BRI',         ['BRI','BANK RAKYAT INDONESIA','BRILINK']],
  ['BNI',         ['BNI','BANK NEGARA INDONESIA']],
  ['MANDIRI',     ['MANDIRI','BANK MANDIRI']],
  ['BTN',         ['BTN','BANK TABUNGAN NEGARA']],
  ['BCA',         ['BCA','BANK CENTRAL ASIA']],
  ['BSI',         ['BSI','BANK SYARIAH INDONESIA','BRISYARIAH','BNIS','MANDIRISYARIAH']],
  // ── Regional Development Banks (BPD) ──────────────────────────────────────
  ['BANK_ACEH',       ['BANK ACEH','BPD ACEH']],
  ['BANK_SUMUT',      ['BANK SUMUT','BPD SUMATERA UTARA']],
  ['BANK_NAGARI',     ['BANK NAGARI','BPD SUMATERA BARAT']],
  ['BANK_RIAU',       ['BANK RIAU','BPD RIAU']],
  ['BANK_JAMBI',      ['BANK JAMBI','BPD JAMBI']],
  ['BANK_SUMSEL',     ['BANK SUMSEL','BANK SUMSELBABEL','BPD SUMSEL']],
  ['BANK_BENGKULU',   ['BANK BENGKULU','BPD BENGKULU']],
  ['BANK_LAMPUNG',    ['BANK LAMPUNG','BPD LAMPUNG']],
  ['BANK_DKI',        ['BANK DKI','BPD DKI JAKARTA']],
  ['BANK_BJB',        ['BJB','BANK JABAR','BANK BANTEN','BPD JABAR']],
  ['BANK_JATENG',     ['BANK JATENG','BPD JAWA TENGAH','BANK JAWA TENGAH']],
  ['BANK_BPD_DIY',    ['BPD DIY','BANK DIY','BANK DAERAH ISTIMEWA']],
  ['BANK_JATIM',      ['BANK JATIM','BPD JAWA TIMUR']],
  ['BANK_NTB',        ['BANK NTB','BPD NTB']],
  ['BANK_NTT',        ['BANK NTT','BPD NTT']],
  ['BANK_KALBAR',     ['BANK KALBAR','BPD KALIMANTAN BARAT']],
  ['BANK_KALSEL',     ['BANK KALSEL','BPD KALIMANTAN SELATAN']],
  ['BANK_KALTIM',     ['BANK KALTIM','BPD KALTIM KALTARA']],
  ['BANK_KALTENG',    ['BANK KALTENG','BPD KALIMANTAN TENGAH']],
  ['BANK_SULUT',      ['BANK SULUT','BANK SULUTGO','BPD SULUT']],
  ['BANK_SULTENG',    ['BANK SULTENG','BPD SULAWESI TENGAH']],
  ['BANK_SULSEL',     ['BANK SULSEL','BANK SULSELBAR','BPD SULSEL']],
  ['BANK_SULTRA',     ['BANK SULTRA','BPD SULAWESI TENGGARA']],
  ['BANK_MALUKU',     ['BANK MALUKU','BPD MALUKU']],
  ['BANK_PAPUA',      ['BANK PAPUA','BPD PAPUA']],
  ['BANK_BALI',       ['BANK BPD BALI','BPD BALI']],
  // ── Private National Banks ─────────────────────────────────────────────────
  ['CIMB',        ['CIMB','CIMB NIAGA','LIPPO BANK']],
  ['PERMATA',     ['PERMATA','PERMATABANK','STANDARD CHARTERED PERMATA']],
  ['PANIN',       ['PANIN','PAN INDONESIA']],
  ['DANAMON',     ['DANAMON','BANK DANAMON']],
  ['MAYBANK',     ['MAYBANK','BANK INTERNASIONAL INDONESIA','BII']],
  ['OCBC',        ['OCBC','OCBC NISP','BANK NISP']],
  ['HSBC',        ['HSBC','HONGKONG SHANGHAI']],
  ['CITIBANK',    ['CITI','CITIBANK']],
  ['MEGA',        ['MEGA','BANK MEGA']],
  ['SINARMAS',    ['SINARMAS','BANK SINARMAS']],
  ['BUANA',       ['BUANA','MAS BUANA']],
  ['BUKOPIN',     ['BUKOPIN','BANK BUKOPIN','KB BUKOPIN']],
  ['BTPN',        ['BTPN','BANK TABUNGAN PENSIUNAN']],
  ['MUAMALAT',    ['MUAMALAT','BANK MUAMALAT']],
  ['MAYAPADA',    ['MAYAPADA','BANK MAYAPADA']],
  ['UOB',         ['UOB','UNITED OVERSEAS']],
  ['COMMONWEALTH',['COMMONWEALTH','BANK COMMONWEALTH']],
  ['RESONA',      ['RESONA','BANK RESONA PERDANIA']],
  ['DBS',         ['DBS','BANK DBS INDONESIA']],
  ['ANZ',         ['ANZ','BANK ANZ']],
  ['DEUTSCHE',    ['DEUTSCHE','DEUTSCHE BANK']],
  ['WOORI',       ['WOORI','BANK WOORI']],
  ['SHINHAN',     ['SHINHAN','BANK SHINHAN']],
  ['IBK',         ['IBK','BANK IBK INDONESIA']],
  ['CHINA_CONST', ['CHINA CONSTRUCTION','CCB']],
  ['ICBC',        ['ICBC','INDUSTRIAL COMMERCIAL CHINA']],
  ['BOC',         ['BANK OF CHINA','BOC']],
  ['SUMITOMO',    ['SUMITOMO','MITSUI BANKING','SMBC']],
  ['MIZUHO',      ['MIZUHO','BANK OF TOKYO']],
  ['MUFG',        ['MUFG','MITSUBISHI UFJ']],
  ['NOBU',        ['NOBU','BANK NOBU','NATIONALNOBU']],
  ['ARTHA',       ['ARTHA GRAHA','BANK ARTHA']],
  ['BUMI_ARTHA',  ['BUMI ARTA','BANK BUMI ARTA']],
  ['VICTORIA',    ['VICTORIA','BANK VICTORIA']],
  ['FAMA',        ['FAMA','BANK FAMA']],
  ['JTRUST',      ['JTRUST','J-TRUST','BANK JTRUST']],
  ['INA',         ['BANK INA','MAYORA']],
  ['SAHABAT',     ['SAHABAT SAMPOERNA','BANK SAHABAT']],
  ['MULTIARTA',   ['MULTIARTA','BANK MULTIARTA']],
  ['MESTIKA',     ['MESTIKA','BANK MESTIKA']],
  ['QNB',         ['QNB','BANK QNB KESAWAN']],
  ['KROM',        ['KROM','BANK KROM']],
  ['ALLO',        ['ALLO BANK','ALLO']],
];

// NMID prefix → institution (6-digit BI acquirer code)
const NMID_PREFIX_MAP = {
  'ID1002': 'BRI',     'ID1007': 'BTN',     'ID1008': 'MANDIRI',
  'ID1009': 'BNI',     'ID1011': 'BCA',     'ID1013': 'PERMATA',
  'ID1016': 'MAYBANK', 'ID1019': 'PANIN',   'ID1022': 'CIMB',
  'ID1023': 'OVO',     'ID1025': 'GOPAY',   'ID1028': 'DANAMON',
  'ID1049': 'DANA',    'ID1076': 'OCBC',    'ID1200': 'BSI',
  'ID7016': 'LINKAJA', 'ID9009': 'SHOPEEPAY','ID9010': 'JAGO',
  'ID9012': 'SEABANK', 'ID9013': 'NEOBANK', 'ID9015': 'ALLO',
  'ID9020': 'DOKU',    'ID9025': 'FLIP',    'ID9030': 'XENDIT',
};

function detectBank(decoded) {
  // 1. Scan globalId strings across all merchant account info tags
  const allGlobalIds = [];
  for (let tag = 26; tag <= 51; tag++) {
    const nested = decoded.merchantAccountInfo[String(tag)] || {};
    const gid = String(nested['00'] || '').toUpperCase();
    if (gid) allGlobalIds.push(gid);
  }
  const combinedGlobalId = allGlobalIds.join(' ');

  for (const [bank, keywords] of GLOBAL_ID_MAP) {
    for (const kw of keywords) {
      if (combinedGlobalId.includes(kw)) return bank;
    }
  }

  // 2. NMID prefix lookup
  const nmid = String(decoded.merchantId || '').toUpperCase();
  for (const [prefix, bank] of Object.entries(NMID_PREFIX_MAP)) {
    if (nmid.startsWith(prefix)) return bank;
  }

  // 3. Merchant account prefix fallback
  const account = String(decoded.merchantAccount || '').toUpperCase();
  for (const [prefix, bank] of Object.entries(NMID_PREFIX_MAP)) {
    if (account.startsWith(prefix)) return bank;
  }

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

// EMVCo QRIS standard caps payload at ~512 chars. Cap at 4096 to be safe
// (accommodates merchant-name encoding quirks and extra TLV fields), but
// reject obviously DoS-sized inputs that could OOM the nested-TLV parser.
const QRIS_MAX_LEN = 4096;

export function decodeQris(rawPayload) {
  const payload = String(rawPayload || '').trim();
  if (!payload) throw new Error('Empty QRIS payload');
  if (payload.length < 20) throw new Error('QRIS payload too short');
  if (payload.length > QRIS_MAX_LEN) throw new Error(`QRIS payload too long (${payload.length} > ${QRIS_MAX_LEN})`);

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
