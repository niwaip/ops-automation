import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

export const CANONICAL_DEV_FALLBACK_KEY =
  '7fd6414a543574effddb645132638c2357ba2f12a57c09216bc45880f5271757';

const INSECURE_FALLBACK_KEYS = new Set([
  CANONICAL_DEV_FALLBACK_KEY,
  'ops_dev_credential_vault_secret_2026',
  'ops_local_dev_jwt_secret_2026_06_02_8f4a6c9d7b1e53aa',
  'jwt_secret_key_change_in_production',
]);

@Injectable()
export class ImCredentialCipher {
  private readonly logger = new Logger(ImCredentialCipher.name);
  private readonly key = this.loadKey();

  getFingerprintKey(): Buffer {
    return this.key;
  }

  encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return [
      'v1',
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      ciphertext.toString('base64'),
    ].join('.');
  }

  decrypt(value: string): string {
    const [version, iv, tag, ciphertext] = value.split('.');
    if (version !== 'v1' || !iv || !tag || !ciphertext)
      throw new Error('Invalid encrypted credential');

    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64'));
      decipher.setAuthTag(Buffer.from(tag, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertext, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch (primaryErr) {
      // Fallback: try fallback key if configured, or canonical dev key in non-production environments
      const isProduction = process.env.NODE_ENV === 'production';
      const fallbackRaw =
        process.env.IM_CHANNEL_FALLBACK_ENCRYPTION_KEY?.trim() ||
        (!isProduction ? CANONICAL_DEV_FALLBACK_KEY : null);

      if (fallbackRaw) {
        let fallbackKey: Buffer | null = null;
        if (/^[0-9a-f]{64}$/i.test(fallbackRaw)) {
          fallbackKey = Buffer.from(fallbackRaw, 'hex');
        } else if (fallbackRaw.length >= 32) {
          fallbackKey = createHash('sha256').update(fallbackRaw).digest();
        }
        if (fallbackKey && !this.key.equals(fallbackKey)) {
          try {
            const fallbackDecipher = createDecipheriv('aes-256-gcm', fallbackKey, Buffer.from(iv, 'base64'));
            fallbackDecipher.setAuthTag(Buffer.from(tag, 'base64'));
            return Buffer.concat([
              fallbackDecipher.update(Buffer.from(ciphertext, 'base64')),
              fallbackDecipher.final(),
            ]).toString('utf8');
          } catch {
            // ignore, rethrow primaryErr below
          }
        }
      }
      throw primaryErr;
    }
  }

  private loadKey(): Buffer {
    const raw = (
      process.env.IM_CHANNEL_ENCRYPTION_KEY ||
      process.env.BUILTIN_SKILL_CONFIG_ENCRYPTION_KEY ||
      process.env.USER_CREDENTIAL_ENCRYPTION_KEY
    )?.trim();

    const isProduction = process.env.NODE_ENV === 'production';

    if (raw) {
      if (isProduction && INSECURE_FALLBACK_KEYS.has(raw)) {
        this.logger.error('CRITICAL: Insecure IM_CHANNEL_ENCRYPTION_KEY configured in production!');
        throw new InternalServerErrorException(
          'FATAL: IM_CHANNEL_ENCRYPTION_KEY must be a secure key in production'
        );
      }
      if (/^[0-9a-f]{64}$/i.test(raw)) {
        return Buffer.from(raw, 'hex');
      }
      try {
        const buf = Buffer.from(raw, 'base64');
        if (buf.length === 32) return buf;
      } catch {
        // fallthrough
      }
      if (raw.length >= 32) {
        return createHash('sha256').update(raw).digest();
      }
      // Explicit invalid key provided: fail closed immediately
      throw new InternalServerErrorException(
        'IM_CHANNEL_ENCRYPTION_KEY must be a 32-byte base64 or 64-character hex key'
      );
    }

    if (isProduction) {
      this.logger.error('CRITICAL: IM_CHANNEL_ENCRYPTION_KEY is required in production environment!');
      throw new InternalServerErrorException(
        'IM_CHANNEL_ENCRYPTION_KEY must be a 32-byte base64 or 64-character hex key'
      );
    }

    this.logger.warn('IM_CHANNEL_ENCRYPTION_KEY not set; using canonical dev fallback key');
    return Buffer.from(CANONICAL_DEV_FALLBACK_KEY, 'hex');
  }
}

