import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export interface CDNMedia {
  encrypt_query_param?: string;
  aes_key?: string;
  encrypt_type?: number;
}

export const DEFAULT_WECHAT_CDN_BASE_URL =
  process.env.WECHAT_CDN_BASE_URL || 'https://novac2c.cdn.weixin.qq.com/c2c';

const TEXT_FILE_EXTENSIONS = new Set([
  'txt', 'md', 'json', 'js', 'ts', 'py', 'java', 'c', 'cpp', 'h',
  'css', 'html', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'sh',
  'bash', 'rs', 'go', 'rb', 'php', 'sql', 'csv', 'log', 'env',
]);

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  mp4: 'video/mp4',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  zip: 'application/zip',
  tar: 'application/x-tar',
  gz: 'application/gzip',
  json: 'application/json',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
};

@Injectable()
export class WechatMediaAdapter {
  private readonly logger = new Logger(WechatMediaAdapter.name);

  /**
   * AES-128-ECB encryption for WeChat CDN media.
   */
  encryptAesEcb(plaintext: Buffer, key: Buffer): Buffer {
    const cipher = crypto.createCipheriv('aes-128-ecb', key, null);
    return Buffer.concat([cipher.update(plaintext), cipher.final()]);
  }

  /**
   * AES-128-ECB decryption for WeChat CDN media.
   */
  decryptAesEcb(ciphertext: Buffer, key: Buffer): Buffer {
    const decipher = crypto.createDecipheriv('aes-128-ecb', key, null);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  /**
   * Parse the AES key from CDN media reference.
   * Can be:
   *   - 16-byte base64 -> raw 16 bytes
   *   - 32-char hex string encoded as base64 -> hex decoded to 16 bytes
   *   - raw 32-char hex string -> hex decoded to 16 bytes
   */
  parseAesKey(mediaOrKey: CDNMedia | string | undefined): Buffer | null {
    if (!mediaOrKey) return null;
    const raw = typeof mediaOrKey === 'string' ? mediaOrKey : mediaOrKey.aes_key;
    if (!raw) return null;

    try {
      const decoded = Buffer.from(raw, 'base64');
      if (decoded.length === 16) return decoded;
      if (decoded.length === 32) {
        const hexStr = decoded.toString('ascii');
        if (/^[0-9a-fA-F]{32}$/.test(hexStr)) {
          return Buffer.from(hexStr, 'hex');
        }
      }
      if (/^[0-9a-fA-F]{32}$/.test(raw)) {
        return Buffer.from(raw, 'hex');
      }
      return decoded.subarray(0, 16);
    } catch {
      return null;
    }
  }

  /**
   * Detect real image format from magic bytes.
   * WeChat media protocol does not supply extension for images.
   */
  detectImageExtension(buffer: Buffer): 'png' | 'jpg' | 'gif' | 'webp' {
    if (!buffer || buffer.length < 12) return 'jpg';
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      return 'png';
    }
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return 'jpg';
    }
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
      return 'gif';
    }
    if (
      buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
    ) {
      return 'webp';
    }
    return 'jpg';
  }

  /**
   * Check whether a file is a readable text format.
   */
  isTextFile(fileName: string): boolean {
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    return TEXT_FILE_EXTENSIONS.has(ext);
  }

  /**
   * Infer MIME type from file extension or content.
   */
  detectMimeType(fileName: string, buffer?: Buffer): string {
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    if (ext && MIME_BY_EXT[ext]) return MIME_BY_EXT[ext];
    if (buffer) {
      const imgExt = this.detectImageExtension(buffer);
      if (imgExt) return `image/${imgExt === 'jpg' ? 'jpeg' : imgExt}`;
    }
    return 'application/octet-stream';
  }

  /**
   * Download encrypted ciphertext from WeChat CDN and decrypt it with the given AES key.
   */
  async downloadAndDecrypt(
    encryptQueryParam: string,
    aesKey: Buffer,
    cdnBaseUrl = DEFAULT_WECHAT_CDN_BASE_URL,
    filekey?: string
  ): Promise<Buffer> {
    const base = cdnBaseUrl.replace(/\/+$/, '');
    let url = `${base}/download?encrypted_query_param=${encodeURIComponent(encryptQueryParam)}`;
    if (filekey) {
      url += `&filekey=${encodeURIComponent(filekey)}`;
    }

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`WeChat CDN download failed (HTTP ${res.status}): ${await res.text()}`);
    }

    const ciphertext = Buffer.from(await res.arrayBuffer());
    return this.decryptAesEcb(ciphertext, aesKey);
  }

  /**
   * Encrypt file buffer with AES-128-ECB and upload to WeChat CDN.
   * Returns the x-encrypted-param header used by recipients to download.
   */
  async uploadToCdn(params: {
    buffer: Buffer;
    uploadParam: string;
    aesKey: Buffer;
    filekey: string;
    cdnBaseUrl?: string;
    uploadUrl?: string;
    maxRetries?: number;
  }): Promise<string> {
    const maxRetries = params.maxRetries ?? 3;
    const cdnBase = (params.cdnBaseUrl || DEFAULT_WECHAT_CDN_BASE_URL).replace(/\/+$/, '');
    const encrypted = this.encryptAesEcb(params.buffer, params.aesKey);
    const url =
      params.uploadUrl ??
      `${cdnBase}/upload?encrypted_query_param=${encodeURIComponent(params.uploadParam)}&filekey=${encodeURIComponent(params.filekey)}`;

    let downloadParam: string | undefined;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: new Uint8Array(encrypted),
        });

        if (res.status >= 400 && res.status < 500) {
          const errMsg = res.headers.get('x-error-message') ?? (await res.text());
          throw new Error(`WeChat CDN upload client error ${res.status}: ${errMsg}`);
        }
        if (!res.ok) {
          const errMsg = res.headers.get('x-error-message') ?? `status ${res.status}`;
          throw new Error(`WeChat CDN upload server error: ${errMsg}`);
        }

        downloadParam = res.headers.get('x-encrypted-param') ?? undefined;
        if (!downloadParam) {
          const body = await res.text();
          throw new Error(`WeChat CDN upload missing x-encrypted-param header. Body: ${body}`);
        }
        break;
      } catch (err) {
        lastError = err;
        if (err instanceof Error && err.message.includes('client error')) throw err;
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
        }
      }
    }

    if (!downloadParam) {
      throw lastError instanceof Error
        ? lastError
        : new Error(`WeChat CDN upload failed after ${maxRetries} attempts`);
    }

    return downloadParam;
  }
}
