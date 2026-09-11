import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { StorageConfigService } from '../src/modules/storage/storage-config.service';

describe('StorageConfigService', () => {
  let service: StorageConfigService;
  let tempDir: string;
  let originalDataDir: string | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'storage-test-'));
    originalDataDir = process.env.DATA_DIR;
    process.env.DATA_DIR = tempDir;

    service = new StorageConfigService();
    service.onModuleInit();
  });

  afterEach(() => {
    if (originalDataDir) {
      process.env.DATA_DIR = originalDataDir;
    } else {
      delete process.env.DATA_DIR;
    }
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should initialize with default local configuration', () => {
    const config = service.getConfig();
    expect(config.protocol).toBe('local');
    expect(config.localRoot).toBeDefined();
    expect(config.hasSecret).toBe(false);
  });

  it('should save and update configuration with masked secretKey', async () => {
    await service.updateConfig({
      protocol: 'minio',
      endpoint: 'http://127.0.0.1:9000',
      bucket: 'my-bucket',
      region: 'us-east-1',
      accessKey: 'minioadmin',
      secretKey: 'supersecretpassword',
      useSSL: false,
    });

    const clientConfig = service.getConfig();
    expect(clientConfig.protocol).toBe('minio');
    expect(clientConfig.endpoint).toBe('http://127.0.0.1:9000');
    expect(clientConfig.bucket).toBe('my-bucket');
    expect(clientConfig.secretKey).toBe('******');
    expect(clientConfig.hasSecret).toBe(true);

    // Update again without providing secret (keep existing secret)
    await service.updateConfig({
      protocol: 'minio',
      endpoint: 'http://127.0.0.1:9000',
      bucket: 'new-bucket',
      secretKey: '******',
    });

    const reloaded = new StorageConfigService();
    reloaded.onModuleInit();
    const configAfterRestart = reloaded.getConfig();
    expect(configAfterRestart.bucket).toBe('new-bucket');
    expect(configAfterRestart.hasSecret).toBe(true);
  });

  it('should test local storage connection successfully', async () => {
    const localDir = path.join(tempDir, 'local-storage');
    const result = await service.testConnection({
      protocol: 'local',
      localRoot: localDir,
    });

    expect(result.success).toBe(true);
    expect(result.protocol).toBe('local');
    expect(result.message).toContain('读写权限');
    expect(fs.existsSync(localDir)).toBe(true);
  });

  it('should fail testConnection for s3/minio if endpoint or bucket is missing', async () => {
    const missingEndpoint = await service.testConnection({
      protocol: 'minio',
      bucket: 'test-bucket',
    });
    expect(missingEndpoint.success).toBe(false);
    expect(missingEndpoint.message).toContain('Endpoint');

    const missingBucket = await service.testConnection({
      protocol: 's3',
      endpoint: 'http://localhost:9000',
    });
    expect(missingBucket.success).toBe(false);
    expect(missingBucket.message).toContain('Bucket');
  });

  it('should save file to local directory when protocol is local', async () => {
    const localDir = path.join(tempDir, 'uploads-folder');
    await service.updateConfig({
      protocol: 'local',
      localRoot: localDir,
    });

    const fileBuffer = Buffer.from('hello storage test');
    const result = await service.saveFile('file-123', 'document.txt', fileBuffer, 'text/plain');

    expect(result.protocol).toBe('local');
    expect(result.filePath).toBeDefined();
    expect(fs.existsSync(result.filePath!)).toBe(true);
    expect(fs.readFileSync(result.filePath!, 'utf-8')).toBe('hello storage test');
  });

  it('should fail closed when STORAGE_FAIL_CLOSED is true and remote object storage upload fails', async () => {
    const prevEnv = process.env.STORAGE_FAIL_CLOSED;
    process.env.STORAGE_FAIL_CLOSED = 'true';
    try {
      await service.updateConfig({
        protocol: 'minio',
        endpoint: 'http://127.0.0.1:59999',
        bucket: 'test-bucket',
        accessKey: 'key',
        secretKey: 'secret',
      });

      await expect(
        service.saveFile('file-fail', 'test.txt', Buffer.from('data'), 'text/plain')
      ).rejects.toThrow('[Fail-Closed]');
    } finally {
      process.env.STORAGE_FAIL_CLOSED = prevEnv;
    }
  });

  it('should fallback to local disk in dev mode when remote upload fails', async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      await service.updateConfig({
        protocol: 'minio',
        endpoint: 'http://127.0.0.1:59999',
        bucket: 'test-bucket',
        accessKey: 'key',
        secretKey: 'secret',
      });

      const result = await service.saveFile('file-dev-fallback', 'test.txt', Buffer.from('dev-fallback'), 'text/plain');
      expect(result.protocol).toBe('local');
      expect(result.filePath).toBeDefined();
      expect(fs.existsSync(result.filePath!)).toBe(true);
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });

  it('should initialize config from STORAGE_* environment variables for stateless deployments', () => {
    const prevProtocol = process.env.STORAGE_PROTOCOL;
    const prevBucket = process.env.STORAGE_BUCKET;
    const prevEndpoint = process.env.STORAGE_ENDPOINT;

    process.env.STORAGE_PROTOCOL = 's3';
    process.env.STORAGE_BUCKET = 'k8s-pod-bucket';
    process.env.STORAGE_ENDPOINT = 'https://s3.amazonaws.com';

    try {
      const freshService = new StorageConfigService();
      const config = freshService.loadConfig();
      expect(config.protocol).toBe('s3');
      expect(config.bucket).toBe('k8s-pod-bucket');
      expect(config.endpoint).toBe('https://s3.amazonaws.com');
    } finally {
      process.env.STORAGE_PROTOCOL = prevProtocol;
      process.env.STORAGE_BUCKET = prevBucket;
      process.env.STORAGE_ENDPOINT = prevEndpoint;
    }
  });
});
