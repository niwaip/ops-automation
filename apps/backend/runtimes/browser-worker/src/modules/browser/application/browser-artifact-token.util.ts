import * as crypto from 'crypto';

const DEFAULT_TTL_HOURS = 48;

function getSigningKey(): string {
  return (
    process.env.INTERNAL_API_SHARED_SECRET ||
    process.env.JWT_SECRET ||
    'ops_browser_artifact_token_signing_secret_2026'
  );
}

/**
 * Generate a time-bound HMAC-SHA256 signed token for an artifact filename.
 * Token format: <expiresTimestampHex>.<hmacSignatureHex>
 */
export function signArtifactToken(filename: string, ttlHours: number = DEFAULT_TTL_HOURS): string {
  const normalizedFilename = filename.trim();
  const expiresAt = Math.floor(Date.now() / 1000) + ttlHours * 3600;
  const expiresHex = expiresAt.toString(16);

  const payload = `${expiresHex}:${normalizedFilename}`;
  const sig = crypto
    .createHmac('sha256', getSigningKey())
    .update(payload)
    .digest('hex');

  return `${expiresHex}.${sig}`;
}

/**
 * Verify a time-bound artifact token against the target filename.
 */
export function verifyArtifactToken(filename: string, token?: string): boolean {
  if (!token || typeof token !== 'string') {
    return false;
  }

  const parts = token.trim().split('.');
  if (parts.length !== 2) {
    return false;
  }

  const [expiresHex, provSig] = parts;
  if (!expiresHex || !provSig) {
    return false;
  }
  const expiresAt = parseInt(expiresHex, 16);
  if (isNaN(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) {
    return false; // Expired or malformed
  }

  const normalizedFilename = filename.trim();
  const payload = `${expiresHex}:${normalizedFilename}`;
  const expectedSig = crypto
    .createHmac('sha256', getSigningKey())
    .update(payload)
    .digest('hex');

  const provBuf = Buffer.from(provSig, 'hex');
  const expBuf = Buffer.from(expectedSig, 'hex');

  if (provBuf.length !== expBuf.length || provBuf.length === 0) {
    return false;
  }

  return crypto.timingSafeEqual(provBuf, expBuf);
}
