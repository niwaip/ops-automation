import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

@Injectable()
export class BuiltinSkillRuntimeConfigCipher {
  private readonly logger = new Logger(BuiltinSkillRuntimeConfigCipher.name);
  private readonly key = this.loadKey();

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
      throw new Error('Invalid encrypted runtime config');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  private loadKey(): Buffer {
    const raw = (
      process.env.BUILTIN_SKILL_CONFIG_ENCRYPTION_KEY ||
      process.env.IM_CHANNEL_ENCRYPTION_KEY ||
      process.env.USER_CREDENTIAL_ENCRYPTION_KEY
    )?.trim();
    if (raw) {
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
    }
    if (process.env.NODE_ENV === 'production') {
      throw new InternalServerErrorException(
        'BUILTIN_SKILL_CONFIG_ENCRYPTION_KEY must be a 32-byte base64 or 64-character hex key'
      );
    }
    this.logger.warn('BUILTIN_SKILL_CONFIG_ENCRYPTION_KEY not set; using deterministic dev fallback key');
    return createHash('sha256').update(process.env.JWT_SECRET || 'ops_dev_builtin_skill_enc_key_2026').digest();
  }
}
