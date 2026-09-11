import { Injectable, Logger } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

export type CredentialPayload = Record<string, string | number | boolean | null | undefined>;

export interface MaskedPreview {
  summary: string;
  fields: Record<string, string>;
}

@Injectable()
export class UserCredentialCrypto {
  private readonly logger = new Logger(UserCredentialCrypto.name);
  private readonly key: Buffer;

  constructor() {
    this.key = this.loadKey();
  }

  encrypt(payload: CredentialPayload): string {
    const rawJson = JSON.stringify(payload);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(rawJson, 'utf8'), cipher.final()]);
    return [
      'v1',
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      ciphertext.toString('base64'),
    ].join('.');
  }

  decrypt(encryptedString: string): CredentialPayload {
    const [version, ivStr, tagStr, cipherStr] = encryptedString.split('.');
    if (version !== 'v1' || !ivStr || !tagStr || !cipherStr) {
      throw new Error('Invalid encrypted credential format');
    }

    const iv = Buffer.from(ivStr, 'base64');
    const tag = Buffer.from(tagStr, 'base64');
    const ciphertext = Buffer.from(cipherStr, 'base64');

    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    const decryptedJson = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');

    return JSON.parse(decryptedJson);
  }

  buildMaskedPreview(category: string, payload: CredentialPayload): MaskedPreview {
    const fields: Record<string, string> = {};

    switch (category) {
      case 'device_key': {
        const keyVal = String(payload.deviceKey || payload.key || payload.token || '');
        const masked = this.maskSecret(keyVal);
        fields.deviceKey = masked;
        return {
          summary: `设备Key: ${masked}`,
          fields,
        };
      }
      case 'basic_auth': {
        const username = String(payload.username || payload.user || payload.account || '未指定账号');
        fields.username = username;
        fields.password = '••••••••';
        return {
          summary: `账号: ${username} / 密码: ••••••••`,
          fields,
        };
      }
      case 'api_key':
      case 'bearer_token': {
        const token = String(payload.apiKey || payload.token || payload.key || '');
        const masked = this.maskSecret(token);
        fields.token = masked;
        return {
          summary: `凭证: ${masked}`,
          fields,
        };
      }
      default: {
        for (const [k, v] of Object.entries(payload)) {
          if (typeof v === 'string' && (k.toLowerCase().includes('pass') || k.toLowerCase().includes('secret') || k.toLowerCase().includes('key'))) {
            fields[k] = '••••••••';
          } else {
            fields[k] = String(v ?? '');
          }
        }
        return {
          summary: `配置项 (${Object.keys(fields).length}项)`,
          fields,
        };
      }
    }
  }

  private maskSecret(val: string): string {
    if (!val) return '••••';
    const trimmed = val.trim();
    if (trimmed.length <= 8) {
      return `${trimmed.slice(0, 2)}••••${trimmed.slice(-2)}`;
    }
    return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`;
  }

  private loadKey(): Buffer {
    const raw = (
      process.env.USER_CREDENTIAL_ENCRYPTION_KEY ||
      process.env.BUILTIN_SKILL_CONFIG_ENCRYPTION_KEY ||
      process.env.IM_CHANNEL_ENCRYPTION_KEY
    )?.trim();

    const isProduction = process.env.NODE_ENV === 'production';
    const insecureFallbackKeys = new Set([
      'ops_dev_credential_vault_secret_2026',
      'ops_local_dev_jwt_secret_2026_06_02_8f4a6c9d7b1e53aa',
      'ops-automation-jwt-secret-key-change-in-production',
      'jwt_secret_key_change_in_production',
    ]);

    if (raw) {
      if (isProduction && insecureFallbackKeys.has(raw)) {
        this.logger.error('CRITICAL: Insecure USER_CREDENTIAL_ENCRYPTION_KEY configured in production!');
        throw new Error('FATAL: USER_CREDENTIAL_ENCRYPTION_KEY must be a secure key in production');
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
    }

    if (isProduction) {
      this.logger.error('CRITICAL: USER_CREDENTIAL_ENCRYPTION_KEY is required in production environment!');
      throw new Error('FATAL: USER_CREDENTIAL_ENCRYPTION_KEY must be set in production environment');
    }

    // Default stable derived key for development/staging environments
    this.logger.warn('USER_CREDENTIAL_ENCRYPTION_KEY not explicitly set; using deterministic dev fallback key');
    return createHash('sha256').update(process.env.JWT_SECRET || 'ops_dev_credential_vault_secret_2026').digest();
  }
}
