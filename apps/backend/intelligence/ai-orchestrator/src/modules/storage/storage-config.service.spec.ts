import * as fs from 'fs';
import * as path from 'path';
import { StorageConfigService } from './storage-config.service';
import { SecretCryptoUtil } from '../../common/crypto/secret-crypto.util';

describe('StorageConfigService', () => {
  const testDataDir = path.join(process.cwd(), '.tmp', 'test-storage-config');
  const testConfigFile = path.join(testDataDir, 'storage-config.json');

  beforeEach(() => {
    process.env.DATA_DIR = testDataDir;
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
    delete process.env.DATA_DIR;
    delete process.env.ALLOW_PRIVATE_STORAGE_ENDPOINT;
  });

  it('masks secretKey on getConfig() and persists encrypted secret on updateConfig()', async () => {
    const service = new StorageConfigService();
    service.onModuleInit();

    const rawSecret = 's3-super-secret-key-12345';
    await service.updateConfig({
      protocol: 's3',
      endpoint: 'https://s3.us-east-1.amazonaws.com',
      bucket: 'my-bucket',
      accessKey: 'AKIAIOSFODNN7EXAMPLE',
      secretKey: rawSecret,
    });

    const clientConfig = service.getConfig();
    expect(clientConfig.secretKey).toBe('******');
    expect(clientConfig.hasSecret).toBe(true);

    expect(fs.existsSync(testConfigFile)).toBe(true);
    const diskRaw = fs.readFileSync(testConfigFile, 'utf-8');
    const diskParsed = JSON.parse(diskRaw);

    expect(diskParsed.secretKey).not.toEqual(rawSecret);
    expect(SecretCryptoUtil.isEncrypted(diskParsed.secretKey)).toBe(true);
    expect(SecretCryptoUtil.decrypt(diskParsed.secretKey)).toEqual(rawSecret);

    const stats = fs.statSync(testConfigFile);
    expect(stats.mode & 0o777).toBe(0o600);
  });

  it('SSRF: blocks cloud metadata endpoint unconditionally', async () => {
    const service = new StorageConfigService();
    service.onModuleInit();

    const metadataEndpoints = [
      'http://169.254.169.254/latest/meta-data/',
      'http://metadata.google.internal/computeMetadata/v1/',
      'http://instance-data/latest/meta-data/',
    ];

    for (const endpoint of metadataEndpoints) {
      const res = await service.testConnection({
        protocol: 's3',
        endpoint,
        bucket: 'test-bucket',
        accessKey: 'key',
        secretKey: 'secret',
      });

      expect(res.success).toBe(false);
      expect(res.message).toContain('SSRF 拦截');
    }
  });

  it('SSRF: blocks internal private networks in production mode', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_PRIVATE_STORAGE_ENDPOINT;

    try {
      const service = new StorageConfigService();
      service.onModuleInit();

      const privateEndpoints = [
        'http://127.0.0.1:9000',
        'http://localhost:9000',
        'http://10.0.0.5:9000',
        'http://192.168.1.100:9000',
        'http://172.20.0.2:9000',
      ];

      for (const endpoint of privateEndpoints) {
        const res = await service.testConnection({
          protocol: 'minio',
          endpoint,
          bucket: 'test',
          accessKey: 'minioadmin',
          secretKey: 'minioadmin',
        });

        expect(res.success).toBe(false);
        expect(res.message).toContain('内部私有网络或回环地址');
      }
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('probes local storage directory correctly', async () => {
    const service = new StorageConfigService();
    service.onModuleInit();

    const localDir = path.join(testDataDir, 'local-storage-test');
    const res = await service.testConnection({
      protocol: 'local',
      localRoot: localDir,
    });

    expect(res.success).toBe(true);
    expect(res.protocol).toBe('local');
    expect(fs.existsSync(localDir)).toBe(true);
  });
});
