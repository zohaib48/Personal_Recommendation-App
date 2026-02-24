const crypto = require('crypto');

const PREFIX = 'enc:v1';
const DEFAULT_FALLBACK_KEY = 'dev-only-token-encryption-fallback';

function getKey() {
    const source = process.env.TOKEN_ENCRYPTION_KEY || DEFAULT_FALLBACK_KEY;
    return crypto.createHash('sha256').update(String(source), 'utf8').digest();
}

function isEncryptedToken(value) {
    return typeof value === 'string' && value.startsWith(`${PREFIX}:`);
}

function encryptToken(value) {
    if (value === undefined || value === null) return value;
    const plain = String(value);
    if (!plain || isEncryptedToken(plain)) return plain;

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return [
        PREFIX,
        iv.toString('base64'),
        tag.toString('base64'),
        encrypted.toString('base64'),
    ].join(':');
}

function decryptToken(value) {
    if (value === undefined || value === null) return value;
    const input = String(value);
    if (!isEncryptedToken(input)) return input;

    const parts = input.split(':');
    if (parts.length !== 5) return input;

    try {
        const iv = Buffer.from(parts[2], 'base64');
        const tag = Buffer.from(parts[3], 'base64');
        const encrypted = Buffer.from(parts[4], 'base64');
        const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
        decipher.setAuthTag(tag);
        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
        return decrypted.toString('utf8');
    } catch (_error) {
        // Keep original value if decryption fails to avoid hard outages.
        return input;
    }
}

module.exports = {
    decryptToken,
    encryptToken,
    isEncryptedToken,
};
