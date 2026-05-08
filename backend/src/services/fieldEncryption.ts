import crypto from 'crypto';

// BUG-061 FIX: AES-256-GCM field-level encryption for sensitive PII stored in DB.
// Set DATABASE_ENCRYPTION_KEY to a 64-char hex string (32 bytes) in production.
// Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

const ALGO = 'aes-256-gcm';
const KEY_HEX = process.env.DATABASE_ENCRYPTION_KEY || '';

function getKey(): Buffer | null {
    if (!KEY_HEX || KEY_HEX.length !== 64) return null;
    try { return Buffer.from(KEY_HEX, 'hex'); } catch { return null; }
}

// Returns "enc:<iv_hex>:<tag_hex>:<ciphertext_hex>" or the plaintext unchanged if key is missing.
export function encryptField(plaintext: string): string {
    const key = getKey();
    if (!key) return plaintext; // graceful degradation — log warning on startup

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGO, key, iv) as crypto.CipherGCM;
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `enc:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

// Decrypts "enc:<iv>:<tag>:<cipher>" or returns value unchanged (plaintext pass-through).
export function decryptField(value: string): string {
    if (!value.startsWith('enc:')) return value;
    const key = getKey();
    if (!key) return value;

    const parts = value.split(':');
    if (parts.length !== 4) return value;
    try {
        const iv   = Buffer.from(parts[1], 'hex');
        const tag  = Buffer.from(parts[2], 'hex');
        const data = Buffer.from(parts[3], 'hex');
        const decipher = crypto.createDecipheriv(ALGO, key, iv) as crypto.DecipherGCM;
        decipher.setAuthTag(tag);
        return decipher.update(data).toString('utf8') + decipher.final('utf8');
    } catch {
        return value; // tampered or wrong key — return as-is, caller handles
    }
}

// Warn on startup if encryption key is missing (production risk)
if (!KEY_HEX) {
    console.warn('[SECURITY] DATABASE_ENCRYPTION_KEY not set — sensitive fields stored in plaintext. Set this in production.');
}
