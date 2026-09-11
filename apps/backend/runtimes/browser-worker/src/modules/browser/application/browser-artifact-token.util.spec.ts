import { signArtifactToken, verifyArtifactToken } from './browser-artifact-token.util';

describe('BrowserArtifactTokenUtil', () => {
  it('should sign and verify valid token', () => {
    const filename = 'step-1-screenshot.png';
    const token = signArtifactToken(filename, 1);
    expect(token).toBeDefined();
    expect(verifyArtifactToken(filename, token)).toBe(true);
  });

  it('should reject token for different filename', () => {
    const token = signArtifactToken('file-a.png', 1);
    expect(verifyArtifactToken('file-b.png', token)).toBe(false);
  });

  it('should reject expired token', () => {
    const filename = 'file-a.png';
    const token = signArtifactToken(filename, -1); // expired 1 hour ago
    expect(verifyArtifactToken(filename, token)).toBe(false);
  });

  it('should reject malformed token', () => {
    expect(verifyArtifactToken('file.png', 'invalid')).toBe(false);
    expect(verifyArtifactToken('file.png', '')).toBe(false);
    expect(verifyArtifactToken('file.png', undefined)).toBe(false);
    expect(verifyArtifactToken('file.png', 'abcd.1234')).toBe(false);
  });
});
