import { SecretCryptoUtil } from './secret-crypto.util';

describe('SecretCryptoUtil', () => {
  const originalEnv = process.env.USER_CREDENTIAL_ENCRYPTION_KEY;

  afterEach(() => {
    if (originalEnv) {
      process.env.USER_CREDENTIAL_ENCRYPTION_KEY = originalEnv;
    } else {
      delete process.env.USER_CREDENTIAL_ENCRYPTION_KEY;
    }
  });

  it('encrypts and decrypts secret keys correctly', () => {
    const rawSecret = 'sk-ant-api-test-key-1234567890';
    const encrypted = SecretCryptoUtil.encrypt(rawSecret);

    expect(encrypted).toMatch(/^v1\.[a-zA-Z0-9+/=]+\.[a-zA-Z0-9+/=]+\.[a-zA-Z0-9+/=]+$/);
    expect(encrypted).not.toEqual(rawSecret);

    const decrypted = SecretCryptoUtil.decrypt(encrypted);
    expect(decrypted).toEqual(rawSecret);
  });

  it('provides backward compatibility by returning plaintext if not encrypted', () => {
    const legacyPlaintext = 'minioadmin-legacy-key';
    const decrypted = SecretCryptoUtil.decrypt(legacyPlaintext);
    expect(decrypted).toEqual(legacyPlaintext);
  });

  it('handles empty and undefined values safely', () => {
    expect(SecretCryptoUtil.encrypt('')).toEqual('');
    expect(SecretCryptoUtil.decrypt('')).toEqual('');
    expect(SecretCryptoUtil.isEncrypted('')).toBe(false);
    expect(SecretCryptoUtil.isEncrypted(undefined)).toBe(false);
  });

  it('detects encrypted format accurately', () => {
    const raw = 'my-secret-key';
    const encrypted = SecretCryptoUtil.encrypt(raw);

    expect(SecretCryptoUtil.isEncrypted(encrypted)).toBe(true);
    expect(SecretCryptoUtil.isEncrypted(raw)).toBe(false);
    expect(SecretCryptoUtil.isEncrypted('v1.invalid')).toBe(false);
  });

  it('uses USER_CREDENTIAL_ENCRYPTION_KEY from environment', () => {
    process.env.USER_CREDENTIAL_ENCRYPTION_KEY = 'custom-production-encryption-secret';
    const secret = 'super-secret-access-token';
    const encrypted = SecretCryptoUtil.encrypt(secret);
    const decrypted = SecretCryptoUtil.decrypt(encrypted);

    expect(decrypted).toEqual(secret);
  });
});
