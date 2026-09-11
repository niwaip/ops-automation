import { UserCredentialCrypto } from './user-credential.crypto';
import { UserCredentialVaultService } from './user-credential-vault.service';
import { UserSkillCredentialBindingService } from './user-skill-credential-binding.service';

describe('User Credential Vault & Digital Employee Binding', () => {
  let crypto: UserCredentialCrypto;

  beforeEach(() => {
    crypto = new UserCredentialCrypto();
  });

  describe('UserCredentialCrypto', () => {
    it('should securely encrypt and decrypt Bark deviceKey without exposing cleartext', () => {
      const cleartextKey = 'aB3cDeFgH1234567890';
      const payload = { deviceKey: cleartextKey };

      const encrypted = crypto.encrypt(payload);
      expect(encrypted).toMatch(/^v1\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/);
      expect(encrypted).not.toContain(cleartextKey);

      const decrypted = crypto.decrypt(encrypted);
      expect(decrypted).toEqual(payload);
      expect(decrypted.deviceKey).toBe(cleartextKey);
    });

    it('should generate safe masked previews for various credential categories', () => {
      // 1. Device Key
      const devicePreview = crypto.buildMaskedPreview('device_key', { deviceKey: 'test-device-key-9999' });
      expect(devicePreview.summary).toContain('••••');
      expect(devicePreview.fields.deviceKey).toBe('test••••9999');

      // 2. Basic Auth
      const basicPreview = crypto.buildMaskedPreview('basic_auth', {
        username: 'admin@company.com',
        password: 'SuperSecretPassword123',
      });
      expect(basicPreview.summary).toContain('admin@company.com');
      expect(basicPreview.summary).toContain('••••••••');
      expect(basicPreview.summary).not.toContain('SuperSecretPassword123');
      expect(basicPreview.fields.password).toBe('••••••••');
    });
  });

  describe('UserSkillCredentialBindingService.resolveRuntimeInput', () => {
    let mockPrisma: any;
    let vaultService: UserCredentialVaultService;
    let bindingService: UserSkillCredentialBindingService;

    const testUserId = 'user-uuid-1';
    const testCredId = 'cred-uuid-bark';
    const rawDeviceKey = 'bark-device-key-real-xyz';

    beforeEach(() => {
      const encryptedData = crypto.encrypt({ deviceKey: rawDeviceKey });
      mockPrisma = {
        userCredential: {
          findFirst: jest.fn().mockImplementation(({ where }) => {
            if (where.id === testCredId && where.userId === testUserId) {
              return Promise.resolve({
                id: testCredId,
                userId: testUserId,
                category: 'device_key',
                encryptedData,
                status: 'active',
              });
            }
            return Promise.resolve(null);
          }),
        },
        userSkillCredentialBinding: {
          findMany: jest.fn().mockImplementation(({ where }) => {
            if (where.userId === testUserId && where.skillId === 'bark-push') {
              return Promise.resolve([
                {
                  userId: testUserId,
                  skillId: 'bark-push',
                  paramName: 'deviceKey',
                  credentialId: testCredId,
                  credential: {
                    id: testCredId,
                    category: 'device_key',
                    encryptedData,
                  },
                },
              ]);
            }
            return Promise.resolve([]);
          }),
        },
      };

      vaultService = new UserCredentialVaultService(mockPrisma, crypto);
      bindingService = new UserSkillCredentialBindingService(mockPrisma, vaultService);
    });

    it('should resolve explicit credential_ref placeholder and inject decrypted secret', async () => {
      const inputWithRef = {
        title: '天气提醒',
        content: '今日多云 25°C',
        deviceKey: {
          source: 'credential_ref',
          credentialId: testCredId,
        },
      };

      const result = await bindingService.resolveRuntimeInput(testUserId, undefined, inputWithRef);
      expect(result.resolvedInputJson.deviceKey).toBe(rawDeviceKey);
      expect(result.injectedParamNames).toContain('deviceKey');
    });

    it('should auto-inject bound digital employee credential when deviceKey is omitted by user', async () => {
      const inputWithoutKey = {
        title: '每日早报',
        content: '热点新闻总结如下...',
        // deviceKey is omitted!
      };

      const result = await bindingService.resolveRuntimeInput(testUserId, 'bark-push', inputWithoutKey);
      expect(result.resolvedInputJson.deviceKey).toBe(rawDeviceKey);
      expect(result.injectedParamNames).toContain('deviceKey');
      expect(result.resolvedInputJson.content).toBe('热点新闻总结如下...');
    });

    it('should replace a persisted masked placeholder with the bound credential', async () => {
      const result = await bindingService.resolveRuntimeInput(testUserId, 'bark-push', {
        content: '热点新闻总结如下...',
        deviceKey: '••••••••',
      });

      expect(result.resolvedInputJson.deviceKey).toBe(rawDeviceKey);
      expect(result.injectedParamNames).toContain('deviceKey');
    });
  });

  describe('UserSkillCredentialBindingService.getSkillCredentialStatus', () => {
    it('should identify loginCredential as a basic_auth credential requirement', async () => {
      const mockPrisma: any = {
        skillConfig: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'skill-login-ai',
            name: '登录并且调用ai',
            paramsSchema: {
              type: 'object',
              properties: {
                startUrl: { type: 'string', description: '起始页面地址' },
                username: { type: 'string', description: '登录用户名' },
                loginCredential: { type: 'string', description: '登录密码' },
                input6TextboxName: { type: 'string', description: '输入值' },
              },
              required: ['username', 'loginCredential'],
            },
          }),
        },
        userSkillCredentialBinding: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      };

      const vaultService = new UserCredentialVaultService(mockPrisma, crypto);
      const bindingService = new UserSkillCredentialBindingService(mockPrisma, vaultService);

      const status = await bindingService.getSkillCredentialStatus('user-1', 'skill-login-ai');

      expect(status.hasCredentialRequirements).toBe(true);
      expect(status.isFullyConfigured).toBe(false);
      expect(status.fields).toHaveLength(1);
      expect(status.fields[0]).toMatchObject({
        paramName: 'loginCredential',
        title: 'loginCredential',
        description: '登录密码',
        credentialCategory: 'basic_auth',
        required: true,
        boundCredential: null,
      });
    });
  });
});
