import { ImCredentialCipher } from '@ops/im-gateway';

describe('ImCredentialCipher', () => {
  const previousKey = process.env.IM_CHANNEL_ENCRYPTION_KEY;
  const previousEnv = process.env.NODE_ENV;
  const previousFallback = process.env.IM_CHANNEL_FALLBACK_ENCRYPTION_KEY;

  afterEach(() => {
    if (previousKey === undefined) delete process.env.IM_CHANNEL_ENCRYPTION_KEY;
    else process.env.IM_CHANNEL_ENCRYPTION_KEY = previousKey;

    if (previousEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnv;

    if (previousFallback === undefined) delete process.env.IM_CHANNEL_FALLBACK_ENCRYPTION_KEY;
    else process.env.IM_CHANNEL_FALLBACK_ENCRYPTION_KEY = previousFallback;
  });

  it('encrypts authenticated credentials without retaining plaintext', () => {
    process.env.IM_CHANNEL_ENCRYPTION_KEY = '7fd6414a543574effddb645132638c2357ba2f12a57c09216bc45880f5271757';
    const cipher = new ImCredentialCipher();
    const encrypted = cipher.encrypt('{"token":"secret"}');
    expect(encrypted).not.toContain('secret');
    expect(cipher.decrypt(encrypted)).toBe('{"token":"secret"}');
  });

  it('fails closed when no valid key is configured', () => {
    process.env.IM_CHANNEL_ENCRYPTION_KEY = 'not-a-key';
    expect(() => new ImCredentialCipher()).toThrow('IM_CHANNEL_ENCRYPTION_KEY');
  });

  it('rejects insecure dev fallback key in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.IM_CHANNEL_ENCRYPTION_KEY = '7fd6414a543574effddb645132638c2357ba2f12a57c09216bc45880f5271757';
    expect(() => new ImCredentialCipher()).toThrow('IM_CHANNEL_ENCRYPTION_KEY');
  });

  it('decrypts with fallback key when primary key changed', () => {
    process.env.IM_CHANNEL_ENCRYPTION_KEY = '1111111111111111111111111111111111111111111111111111111111111111';
    const oldCipher = new ImCredentialCipher();
    const encrypted = oldCipher.encrypt('my-secret-token');

    // New primary key, old key as fallback
    process.env.IM_CHANNEL_ENCRYPTION_KEY = '2222222222222222222222222222222222222222222222222222222222222222';
    process.env.IM_CHANNEL_FALLBACK_ENCRYPTION_KEY = '1111111111111111111111111111111111111111111111111111111111111111';
    const newCipher = new ImCredentialCipher();
    expect(newCipher.decrypt(encrypted)).toBe('my-secret-token');
  });
});

