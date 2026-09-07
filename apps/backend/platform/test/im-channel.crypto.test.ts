import { ImCredentialCipher } from '../src/modules/im-channel/im-channel.crypto';

describe('ImCredentialCipher', () => {
  const previousKey = process.env.IM_CHANNEL_ENCRYPTION_KEY;
  afterEach(() => {
    if (previousKey === undefined) delete process.env.IM_CHANNEL_ENCRYPTION_KEY;
    else process.env.IM_CHANNEL_ENCRYPTION_KEY = previousKey;
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
});
