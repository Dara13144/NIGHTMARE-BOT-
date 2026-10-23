import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Standard for GCM
const AUTH_TAG_LENGTH = 16;

/**
 * Returns a 32-byte key buffer from input string/buffer or default environment variable
 */
function getKeyBuffer(keyHexOrString) {
  if (!keyHexOrString) {
    throw new Error('Encryption key must not be empty');
  }

  // If already 64 hex characters (32 bytes)
  if (/^[0-9a-fA-F]{64}$/.test(keyHexOrString)) {
    return Buffer.from(keyHexOrString, 'hex');
  }

  // Otherwise, create a SHA-256 digest of the key string to ensure 32 bytes
  return crypto.createHash('sha256').update(String(keyHexOrString)).digest();
}

/**
 * Encrypt a plain object or string using AES-256-GCM
 * @param {object|string} payload 
 * @param {string} [key] Optional encryption key
 * @returns {string} iv:authTag:ciphertext (hex encoded)
 */
export function encryptPayload(payload, key = process.env.ENCRYPTION_KEY || 'default_test_key_nightmare_store_32_bytes_len!') {
  const keyBuf = getKeyBuffer(key);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuf, iv, { authTagLength: AUTH_TAG_LENGTH });

  const textToEncrypt = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const encrypted = Buffer.concat([cipher.update(textToEncrypt, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt an AES-256-GCM encrypted payload
 * @param {string} cipherTextString 
 * @param {string} [key] Optional encryption key
 * @returns {object|string} parsed JSON or string
 */
export function decryptPayload(cipherTextString, key = process.env.ENCRYPTION_KEY || 'default_test_key_nightmare_store_32_bytes_len!') {
  if (!cipherTextString || typeof cipherTextString !== 'string') {
    throw new Error('Invalid cipherText format');
  }

  const parts = cipherTextString.split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed cipher text string, expected iv:tag:data');
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const keyBuf = getKeyBuffer(key);
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, keyBuf, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');

  try {
    return JSON.parse(decrypted);
  } catch {
    return decrypted;
  }
}

/**
 * Generate SHA-256 hash for codes to prevent duplicate inventory insertion
 * @param {string} secret 
 * @returns {string} 64 character hex string
 */
export function hashSecret(secret) {
  if (!secret) return '';
  return crypto.createHash('sha256').update(String(secret).trim().toUpperCase()).digest('hex');
}
