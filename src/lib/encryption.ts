import crypto from 'crypto';

// Get encryption key from environment (fallback to AUTH_SECRET if ENCRYPTION_KEY not set)
const getEncryptionKey = (): string => {
  const key = process.env.ENCRYPTION_KEY || process.env.AUTH_SECRET;
  if (!key) {
    throw new Error('ENCRYPTION_KEY or AUTH_SECRET must be set for credential encryption');
  }
  // Ensure key is 32 bytes for AES-256
  return crypto.createHash('sha256').update(key).digest('base64').slice(0, 32);
};

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

/**
 * Encrypt a string value
 */
export function encrypt(text: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(key), iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // Return IV + encrypted data (both in hex)
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt an encrypted string
 */
export function decrypt(encryptedText: string): string {
  const key = getEncryptionKey();
  const parts = encryptedText.split(':');

  if (parts.length !== 2) {
    throw new Error('Invalid encrypted data format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];

  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(key), iv);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
