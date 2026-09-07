import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

@Injectable()
export class ImCredentialCipher {
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
      throw new Error('Invalid encrypted credential');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  private loadKey(): Buffer {
    const raw = process.env.IM_CHANNEL_ENCRYPTION_KEY?.trim();
    const key =
      raw && /^[0-9a-f]{64}$/i.test(raw)
        ? Buffer.from(raw, 'hex')
        : raw
          ? Buffer.from(raw, 'base64')
          : null;
    if (!key || key.length !== 32) {
      throw new InternalServerErrorException(
        'IM_CHANNEL_ENCRYPTION_KEY must be a 32-byte base64 or 64-character hex key'
      );
    }
    return key;
  }
}
