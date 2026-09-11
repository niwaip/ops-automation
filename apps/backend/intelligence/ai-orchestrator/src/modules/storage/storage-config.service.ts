import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as dns from 'dns';
import axios from 'axios';
import { SecretCryptoUtil } from '../../common/crypto/secret-crypto.util';
import type {
  StorageConfigDTO,
  UpdateStorageConfigDTO,
  TestStorageConnectionDTO,
  StorageProtocol,
} from './storage.dto';

@Injectable()
export class StorageConfigService implements OnModuleInit {
  private readonly logger = new Logger(StorageConfigService.name);
  private currentConfig: StorageConfigDTO = {
    protocol: 'local',
    localRoot: path.join(process.cwd(), 'data/storage/uploads'),
    updatedAt: new Date().toISOString(),
  };

  private getDataDir(): string {
    return process.env.DATA_DIR || path.join(process.cwd(), 'data');
  }

  private getConfigFile(): string {
    return path.join(this.getDataDir(), 'storage-config.json');
  }

  onModuleInit(): void {
    this.loadConfig();
  }

  /**
   * Load storage configuration from disk if exists, otherwise initialize default.
   */
  loadConfig(): StorageConfigDTO {
    // 1. If explicitly configured via environment variables, prioritize for stateless / multi-replica deployments
    if (process.env.STORAGE_PROTOCOL) {
      this.currentConfig = {
        protocol: (process.env.STORAGE_PROTOCOL as StorageProtocol) || 'local',
        localRoot: process.env.STORAGE_LOCAL_ROOT || path.join(process.cwd(), 'data/storage/uploads'),
        endpoint: process.env.STORAGE_ENDPOINT,
        bucket: process.env.STORAGE_BUCKET,
        region: process.env.STORAGE_REGION || 'us-east-1',
        accessKey: process.env.STORAGE_ACCESS_KEY,
        secretKey: process.env.STORAGE_SECRET_KEY,
        useSSL: process.env.STORAGE_USE_SSL !== undefined ? process.env.STORAGE_USE_SSL !== 'false' : true,
        publicUrl: process.env.STORAGE_PUBLIC_URL,
        pathPrefix: process.env.STORAGE_PATH_PREFIX || 'uploads/',
        updatedAt: new Date().toISOString(),
      };
      this.logger.log(`Storage configuration initialized from environment (protocol: ${this.currentConfig.protocol})`);
      return this.getConfig();
    }

    const dataDir = this.getDataDir();
    const configFile = this.getConfigFile();
    try {
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      if (fs.existsSync(configFile)) {
        const raw = fs.readFileSync(configFile, 'utf-8');
        const parsed = JSON.parse(raw);
        this.currentConfig = {
          protocol: parsed.protocol || 'local',
          localRoot: parsed.localRoot || path.join(process.cwd(), 'data/storage/uploads'),
          endpoint: parsed.endpoint,
          bucket: parsed.bucket,
          region: parsed.region || 'us-east-1',
          accessKey: parsed.accessKey,
          secretKey: parsed.secretKey ? SecretCryptoUtil.decrypt(parsed.secretKey) : undefined,
          useSSL: parsed.useSSL !== undefined ? parsed.useSSL : true,
          publicUrl: parsed.publicUrl,
          pathPrefix: parsed.pathPrefix || 'uploads/',
          updatedAt: parsed.updatedAt || new Date().toISOString(),
        };
        this.logger.log(`Loaded storage configuration (protocol: ${this.currentConfig.protocol})`);
      } else {
        this.saveConfigInternal(this.currentConfig);
      }
    } catch (err: any) {
      this.logger.warn(`Failed to load storage config from ${configFile}: ${err.message}`);
    }

    return this.getConfig();
  }

  /**
   * Return client-safe configuration with secretKey masked.
   */
  getConfig(): StorageConfigDTO {
    return {
      ...this.currentConfig,
      secretKey: this.currentConfig.secretKey ? '******' : undefined,
      hasSecret: Boolean(this.currentConfig.secretKey),
    };
  }

  /**
   * Update storage configuration from admin console.
   */
  async updateConfig(dto: UpdateStorageConfigDTO): Promise<StorageConfigDTO> {
    const previousSecret = this.currentConfig.secretKey;
    const nextSecret =
      dto.secretKey && dto.secretKey !== '******' ? dto.secretKey : previousSecret;

    if (dto.endpoint && dto.endpoint.trim()) {
      let endpointUrl = dto.endpoint.trim();
      if (!endpointUrl.startsWith('http://') && !endpointUrl.startsWith('https://')) {
        endpointUrl = `${dto.useSSL !== false ? 'https://' : 'http://'}${endpointUrl}`;
      }
      await this.validateEndpointUrl(endpointUrl);
    }

    this.currentConfig = {
      protocol: dto.protocol || 'local',
      localRoot: dto.localRoot || path.join(process.cwd(), 'data/storage/uploads'),
      endpoint: dto.endpoint?.trim(),
      bucket: dto.bucket?.trim(),
      region: dto.region?.trim() || 'us-east-1',
      accessKey: dto.accessKey?.trim(),
      secretKey: nextSecret,
      useSSL: dto.useSSL !== undefined ? dto.useSSL : true,
      publicUrl: dto.publicUrl?.trim(),
      pathPrefix: dto.pathPrefix?.trim() || 'uploads/',
      updatedAt: new Date().toISOString(),
    };

    await this.saveConfigInternal(this.currentConfig);
    this.logger.log(`Storage configuration updated (protocol: ${this.currentConfig.protocol})`);

    return this.getConfig();
  }

  private async saveConfigInternal(config: StorageConfigDTO): Promise<void> {
    const configFile = this.getConfigFile();
    const persistedConfig = {
      ...config,
      secretKey: config.secretKey ? SecretCryptoUtil.encrypt(config.secretKey) : undefined,
    };
    SecretCryptoUtil.writeSecureJsonFile(configFile, persistedConfig);
  }

  /**
   * Test connection with candidate or current configuration.
   */
  async testConnection(candidate?: UpdateStorageConfigDTO): Promise<TestStorageConnectionDTO> {
    const configToTest = candidate
      ? {
          ...candidate,
          secretKey:
            candidate.secretKey && candidate.secretKey !== '******'
              ? candidate.secretKey
              : this.currentConfig.secretKey,
        }
      : this.currentConfig;

    const protocol = configToTest.protocol || 'local';
    const start = Date.now();

    if (protocol === 'local') {
      const localDir = configToTest.localRoot || path.join(process.cwd(), 'data/storage/uploads');
      try {
        if (!fs.existsSync(localDir)) {
          fs.mkdirSync(localDir, { recursive: true });
        }
        const probeFile = path.join(localDir, `.probe-${Date.now()}.tmp`);
        fs.writeFileSync(probeFile, 'ops-storage-probe');
        fs.unlinkSync(probeFile);

        return {
          success: true,
          protocol: 'local',
          message: `本地存储目录正常且具有读写权限 (${localDir})`,
          latencyMs: Date.now() - start,
          details: { path: localDir },
        };
      } catch (err: any) {
        return {
          success: false,
          protocol: 'local',
          message: `本地存储目录访问失败: ${err.message}`,
          latencyMs: Date.now() - start,
        };
      }
    }

    // MinIO / S3 / OSS connection probe
    if (!configToTest.endpoint) {
      return {
        success: false,
        protocol,
        message: '未配置对象存储服务端点 (Endpoint)',
        latencyMs: 0,
      };
    }

    if (!configToTest.bucket) {
      return {
        success: false,
        protocol,
        message: '未配置存储桶名称 (Bucket)',
        latencyMs: 0,
      };
    }

    try {
      let endpointUrl = configToTest.endpoint;
      if (!endpointUrl.startsWith('http://') && !endpointUrl.startsWith('https://')) {
        endpointUrl = `${configToTest.useSSL ? 'https://' : 'http://'}${endpointUrl}`;
      }

      await this.validateEndpointUrl(endpointUrl);

      const host = new URL(endpointUrl).host;
      const bucketUrl = `${endpointUrl}/${configToTest.bucket}`;

      // Perform a HEAD request to check bucket reachability
      const headers: Record<string, string> = { Host: host };

      if (configToTest.accessKey && configToTest.secretKey) {
        const sigHeaders = this.generateAwsV4Headers({
          method: 'HEAD',
          url: bucketUrl,
          region: configToTest.region || 'us-east-1',
          accessKey: configToTest.accessKey,
          secretKey: configToTest.secretKey,
          payloadHash: crypto.createHash('sha256').update('').digest('hex'),
        });
        Object.assign(headers, sigHeaders);
      }

      const res = await axios.head(bucketUrl, {
        headers,
        timeout: 5000,
        maxRedirects: 0,
        validateStatus: (status: number) => status < 500, // 200, 301, 403, 404 all indicate network reachability
      } as any);

      const latencyMs = Date.now() - start;
      if (res.status === 200) {
        return {
          success: true,
          protocol,
          message: `成功连接对象存储桶 [${configToTest.bucket}]，权限正常`,
          latencyMs,
          details: { status: res.status, endpoint: endpointUrl },
        };
      } else if (res.status === 403) {
        return {
          success: false,
          protocol,
          message: `已连通端点，但访问存储桶 [${configToTest.bucket}] 被拒绝 (403 Forbidden)，请检查 AccessKey / SecretKey 权限`,
          latencyMs,
        };
      } else if (res.status === 404) {
        return {
          success: false,
          protocol,
          message: `已连通端点，但存储桶 [${configToTest.bucket}] 不存在 (404 Not Found)，请先创建该 Bucket`,
          latencyMs,
        };
      }

      return {
        success: true,
        protocol,
        message: `端点可达 (HTTP ${res.status})`,
        latencyMs,
      };
    } catch (err: any) {
      return {
        success: false,
        protocol,
        message: `连接对象存储失败: ${err.message}`,
        latencyMs: Date.now() - start,
      };
    }
  }

  /**
   * Save uploaded file using active storage configuration.
   */
  async saveFile(
    fileId: string,
    fileName: string,
    buffer: Buffer,
    mimeType: string
  ): Promise<{ filePath?: string; url?: string; storageKey: string; protocol: StorageProtocol }> {
    const protocol = this.currentConfig.protocol || 'local';
    const sanitizedFileName = (fileName || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
    const storageKey = `${this.currentConfig.pathPrefix || 'uploads/'}${fileId}-${sanitizedFileName}`;

    if (protocol === 'local') {
      const localDir = this.currentConfig.localRoot || path.join(process.cwd(), 'data/storage/uploads');
      if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
      }
      const diskPath = path.join(localDir, `${fileId}-${sanitizedFileName}`);
      fs.writeFileSync(diskPath, buffer);
      return { filePath: diskPath, storageKey, protocol: 'local' };
    }

    // MinIO / S3 / OSS remote upload
    try {
      const remoteResult = await this.uploadToS3Compatible(storageKey, buffer, mimeType);
      return { ...remoteResult, storageKey, protocol };
    } catch (err: any) {
      const isProduction = process.env.NODE_ENV === 'production';
      const isFailClosed = isProduction || process.env.STORAGE_FAIL_CLOSED === 'true';

      if (isFailClosed) {
        this.logger.error(
          `Failed to upload to ${protocol} storage: ${err.message}. Fail-closed in effect (local disk fallback prohibited).`
        );
        throw new Error(
          `[Fail-Closed] Remote object storage upload failed (${protocol}): ${err.message}. Local disk fallback is prohibited in production.`
        );
      }

      this.logger.warn(
        `Failed to upload to ${protocol} storage: ${err.message}. Falling back to local disk (dev mode only).`
      );
      // Safe fallback to local disk for development only
      const localFallbackDir = path.join(process.cwd(), 'data/storage/uploads');
      if (!fs.existsSync(localFallbackDir)) {
        fs.mkdirSync(localFallbackDir, { recursive: true });
      }
      const diskPath = path.join(localFallbackDir, `${fileId}-${sanitizedFileName}`);
      fs.writeFileSync(diskPath, buffer);
      return { filePath: diskPath, storageKey, protocol: 'local' };
    }
  }

  private async uploadToS3Compatible(
    key: string,
    buffer: Buffer,
    mimeType: string
  ): Promise<{ url?: string }> {
    let endpointUrl = this.currentConfig.endpoint!;
    if (!endpointUrl.startsWith('http://') && !endpointUrl.startsWith('https://')) {
      endpointUrl = `${this.currentConfig.useSSL ? 'https://' : 'http://'}${endpointUrl}`;
    }

    const cleanKey = key.startsWith('/') ? key.slice(1) : key;
    const objectUrl = `${endpointUrl}/${this.currentConfig.bucket}/${cleanKey}`;
    const host = new URL(objectUrl).host;
    const payloadHash = crypto.createHash('sha256').update(buffer).digest('hex');

    const headers: Record<string, string> = {
      Host: host,
      'Content-Type': mimeType || 'application/octet-stream',
      'Content-Length': String(buffer.length),
      'x-amz-content-sha256': payloadHash,
    };

    if (this.currentConfig.accessKey && this.currentConfig.secretKey) {
      const sigHeaders = this.generateAwsV4Headers({
        method: 'PUT',
        url: objectUrl,
        region: this.currentConfig.region || 'us-east-1',
        accessKey: this.currentConfig.accessKey,
        secretKey: this.currentConfig.secretKey,
        payloadHash,
        headersToSign: {
          'content-type': mimeType || 'application/octet-stream',
          'x-amz-content-sha256': payloadHash,
        },
      });
      Object.assign(headers, sigHeaders);
    }

    await axios.put(objectUrl, buffer, { headers, timeout: 15000, maxRedirects: 0 } as any);

    const publicUrl = this.currentConfig.publicUrl
      ? `${this.currentConfig.publicUrl.replace(/\/$/, '')}/${cleanKey}`
      : objectUrl;

    return { url: publicUrl };
  }

  /**
   * Helper to generate AWS SigV4 authorization headers.
   */
  private generateAwsV4Headers(params: {
    method: string;
    url: string;
    region: string;
    accessKey: string;
    secretKey: string;
    payloadHash: string;
    headersToSign?: Record<string, string>;
  }): Record<string, string> {
    const urlObj = new URL(params.url);
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);

    const canonicalHeadersMap: Record<string, string> = {
      host: urlObj.host,
      'x-amz-date': amzDate,
      ...(params.headersToSign || {}),
    };

    const sortedHeaderKeys = Object.keys(canonicalHeadersMap).sort();
    const canonicalHeaders = sortedHeaderKeys
      .map((k) => `${k.toLowerCase()}:${(canonicalHeadersMap[k] || '').trim()}\n`)
      .join('');
    const signedHeaders = sortedHeaderKeys.map((k) => k.toLowerCase()).join(';');

    const canonicalRequest = [
      params.method,
      urlObj.pathname,
      urlObj.search ? urlObj.search.slice(1) : '',
      canonicalHeaders,
      signedHeaders,
      params.payloadHash,
    ].join('\n');

    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/${params.region}/s3/aws4_request`;
    const stringToSign = [
      algorithm,
      amzDate,
      credentialScope,
      crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');

    const kDate = crypto.createHmac('sha256', `AWS4${params.secretKey}`).update(dateStamp).digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(params.region).digest();
    const kService = crypto.createHmac('sha256', kRegion).update('s3').digest();
    const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    const authorization = `${algorithm} Credential=${params.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return {
      'x-amz-date': amzDate,
      Authorization: authorization,
    };
  }

  private async validateEndpointUrl(urlStr: string): Promise<void> {
    let parsed: URL;
    try {
      parsed = new URL(urlStr);
    } catch {
      throw new BadRequestException('端点 URL 格式无效');
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new BadRequestException('仅支持 HTTP/HTTPS 协议端点');
    }

    const rawHostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

    // Cloud metadata protection - unconditionally blocked in all environments
    if (
      rawHostname === '169.254.169.254' ||
      rawHostname.startsWith('169.254.') ||
      rawHostname === 'metadata.google.internal' ||
      rawHostname === 'instance-data'
    ) {
      throw new BadRequestException('禁止访问云元数据服务端点 (SSRF 拦截)');
    }

    const allowPrivate =
      process.env.ALLOW_PRIVATE_STORAGE_ENDPOINT === 'true' ||
      process.env.NODE_ENV === 'development' ||
      process.env.NODE_ENV === 'test';

    // 1. Literal host check
    if (!allowPrivate && this.isDisallowedIp(rawHostname)) {
      throw new BadRequestException(`生产环境下禁止探测内部私有网络或回环地址 (${rawHostname})`);
    }

    // 2. DNS resolution check (prevent DNS rebinding / domain mapping to internal IP)
    try {
      const addresses = await dns.promises.lookup(rawHostname, { all: true });
      for (const addr of addresses) {
        if (this.isCloudMetadataIp(addr.address)) {
          throw new BadRequestException(
            `端点解析到云元数据服务地址 (${addr.address})，已被系统阻断 (SSRF 拦截)`
          );
        }
        if (!allowPrivate && this.isDisallowedIp(addr.address)) {
          throw new BadRequestException(
            `生产环境下禁止探测内部私有网络或回环地址 (${addr.address})`
          );
        }
      }
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      if (!allowPrivate) {
        this.logger.warn(`DNS lookup failed for endpoint hostname ${rawHostname}: ${err.message}`);
        throw new BadRequestException(`端点域名解析失败 (${rawHostname}): ${err.message}`);
      }
    }
  }

  private isCloudMetadataIp(ip: string): boolean {
    const normalized = this.normalizeIp(ip);
    return normalized.startsWith('169.254.');
  }

  private normalizeIp(ip: string): string {
    const lower = ip.toLowerCase().replace(/^\[|\]$/g, '');
    if (lower.startsWith('::ffff:')) {
      const rest = lower.slice(7);
      if (rest.includes('.')) {
        return rest;
      }
    }
    return lower;
  }

  private isDisallowedIp(ipOrHost: string): boolean {
    const target = this.normalizeIp(ipOrHost);

    if (
      target === 'localhost' ||
      target === '127.0.0.1' ||
      target === '::1' ||
      target === '0.0.0.0'
    ) {
      return true;
    }

    // IPv6 checks
    if (target.includes(':')) {
      if (target === '::1' || /^0*(:0*)+:0*1$/.test(target)) return true;
      if (/^fe[89ab]/i.test(target)) return true; // Link-local fe80::/10
      if (/^f[cd]/i.test(target)) return true; // Unique local fc00::/7
      return false;
    }

    // IPv4 checks
    const ipv4Match = target.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4Match) {
      const [, s1, s2] = ipv4Match;
      const o1 = parseInt(s1 || '0', 10);
      const o2 = parseInt(s2 || '0', 10);
      if (o1 === 10) return true; // 10.0.0.0/8
      if (o1 === 172 && o2 >= 16 && o2 <= 31) return true; // 172.16.0.0/12
      if (o1 === 192 && o2 === 168) return true; // 192.168.0.0/16
      if (o1 === 127) return true; // 127.0.0.0/8
      if (o1 === 169 && o2 === 254) return true; // 169.254.0.0/16
      if (o1 === 0) return true; // 0.0.0.0/8
      if (o1 === 100 && o2 >= 64 && o2 <= 127) return true; // 100.64.0.0/10 Carrier-grade NAT
      if (o1 === 198 && (o2 === 18 || o2 === 19)) return true; // 198.18.0.0/15
      if (o1 >= 224) return true; // 224.0.0.0/4 multicast & 240.0.0.0/4 reserved
    }

    return false;
  }
}
