import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '@nestjs/common';

const logger = {
  warn: (msg: string) => {
    try {
      if (typeof Logger === 'function') {
        new Logger('SecretCryptoUtil').warn(msg);
        return;
      }
    } catch {
      // ignore
    }
    console.warn(`[SecretCryptoUtil] ${msg}`);
  },
  error: (msg: string) => {
    try {
      if (typeof Logger === 'function') {
        new Logger('SecretCryptoUtil').error(msg);
        return;
      }
    } catch {
      // ignore
    }
    console.error(`[SecretCryptoUtil] ${msg}`);
  },
};

const INSECURE_FALLBACK_KEYS = new Set([
  '7fd6414a543574effddb645132638c2357ba2f12a57c09216bc45880f5271757',
  'ops_internal_shared_secret_change_me',
]);

export class SecretCryptoUtil {
  private static getKey(): Buffer {
    const raw =
      process.env.USER_CREDENTIAL_ENCRYPTION_KEY ||
      process.env.INTERNAL_API_SHARED_SECRET ||
      '7fd6414a543574effddb645132638c2357ba2f12a57c09216bc45880f5271757';

    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction && (!process.env.USER_CREDENTIAL_ENCRYPTION_KEY || INSECURE_FALLBACK_KEYS.has(raw))) {
      logger.error('CRITICAL: Using insecure or missing encryption key in production environment!');
      throw new Error(
        'FATAL: USER_CREDENTIAL_ENCRYPTION_KEY is missing or insecure in production environment'
      );
    }

    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
      return Buffer.from(raw, 'hex');
    }
    return createHash('sha256').update(raw).digest();
  }

  /**
   * Check whether a value is encrypted with v1 AES-256-GCM format.
   */
  static isEncrypted(val?: string): boolean {
    if (!val || typeof val !== 'string') return false;
    const [version, iv, tag, ciphertext] = val.split('.');
    return Boolean(
      version === 'v1' &&
      iv &&
      tag &&
      ciphertext &&
      iv.length > 0 &&
      tag.length > 0 &&
      ciphertext.length > 0
    );
  }

  /**
   * Encrypt a plaintext secret using AES-256-GCM.
   * Produces string format: v1.<iv>.<tag>.<ciphertext> (all base64)
   * FAILS CLOSED: Throws an Error if encryption fails instead of returning plaintext.
   */
  static encrypt(plaintext: string): string {
    if (!plaintext) return '';
    try {
      const key = this.getKey();
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      return [
        'v1',
        iv.toString('base64'),
        cipher.getAuthTag().toString('base64'),
        ciphertext.toString('base64'),
      ].join('.');
    } catch (err: any) {
      logger.error(`Failed to encrypt secret: ${err.message}`);
      throw new Error(`Failed to encrypt secret: ${err.message}`);
    }
  }

  /**
   * Decrypt a secret. If not starting with 'v1.', assumes legacy plaintext and returns as-is.
   */
  static decrypt(encryptedOrPlain: string): string {
    if (!encryptedOrPlain) return '';
    if (!encryptedOrPlain.startsWith('v1.')) {
      // Legacy plaintext: return as-is for backward compatibility
      return encryptedOrPlain;
    }

    const [version, ivStr, tagStr, cipherStr] = encryptedOrPlain.split('.');
    if (version !== 'v1' || !ivStr || !tagStr || !cipherStr) {
      return encryptedOrPlain;
    }

    try {
      const key = this.getKey();
      const iv = Buffer.from(ivStr, 'base64');
      const tag = Buffer.from(tagStr, 'base64');
      const ciphertext = Buffer.from(cipherStr, 'base64');
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    } catch (err: any) {
      logger.warn(`Decryption failed, treating as raw string: ${err.message}`);
      return encryptedOrPlain;
    }
  }

  /**
   * Atomically write a JSON file with strict 0o600 file permissions and 0o700 directory permissions.
   */
  static writeSecureJsonFile(filePath: string, data: any): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      try {
        fs.chmodSync(dir, 0o700);
      } catch {
        // ignore
      }
    }
    const tempFile = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
    const content = JSON.stringify(data, null, 2);
    fs.writeFileSync(tempFile, content, { mode: 0o600, encoding: 'utf-8' });
    try {
      fs.chmodSync(tempFile, 0o600);
    } catch {
      // ignore
    }
    fs.renameSync(tempFile, filePath);
    try {
      fs.chmodSync(filePath, 0o600);
    } catch {
      // ignore
    }
  }
}
