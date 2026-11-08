const crypto = require('crypto');

/**
 * AES-256-GCM for small secrets kept in the database. The key is the SHA-256
 * of the first configured value in `keyEnvNames`. Payloads are
 * `<iv hex>:<tag hex>:<ciphertext hex>`.
 */
function createSecretBox(keyEnvNames) {
    function key() {
        const base = keyEnvNames.map((name) => process.env[name]).find(Boolean) || '';
        return crypto.createHash('sha256').update(base).digest();
    }

    function encryptSecret(plainText) {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
        const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
        const tag = cipher.getAuthTag();
        return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
    }

    function decryptSecret(payload) {
        if (!payload) return null;
        const [ivHex, tagHex, encryptedHex] = String(payload).split(':');
        if (!ivHex || !tagHex || !encryptedHex) return null;
        const decipher = crypto.createDecipheriv(
            'aes-256-gcm',
            key(),
            Buffer.from(ivHex, 'hex'),
        );
        decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
        const decrypted = Buffer.concat([
            decipher.update(Buffer.from(encryptedHex, 'hex')),
            decipher.final(),
        ]);
        return decrypted.toString('utf8');
    }

    return { encryptSecret, decryptSecret };
}

module.exports = { createSecretBox };
