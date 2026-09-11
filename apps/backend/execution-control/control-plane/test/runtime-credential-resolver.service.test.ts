import { RuntimeCredentialResolverService } from '../src/modules/execution/credentials/runtime-credential-resolver.service';

const TEST_USER_ID = 'e7fce333-a8f4-4097-9a53-f0a4c729da46';
const TEST_SKILL_ID = 'b732f38d-69b5-4b19-b59f-d3b690fb0001';

describe('RuntimeCredentialResolverService', () => {
  it('replaces a persisted mask with the decrypted bound credential at runtime', async () => {
    const prisma = {
      userSkillCredentialBinding: {
        findMany: jest.fn().mockResolvedValue([
          {
            paramName: 'deviceKey',
            credential: {
              category: 'device_key',
              encryptedData: 'encrypted-device-key',
            },
          },
        ]),
      },
    };
    const service = new RuntimeCredentialResolverService(prisma as never);
    jest
      .spyOn(service as any, 'decryptPayload')
      .mockReturnValue({ deviceKey: 'decrypted-device-key' });

    const result = await service.resolveInputForRuntime(TEST_USER_ID, TEST_SKILL_ID, {
      title: '天气提醒',
      deviceKey: '••••••••',
    });

    expect(result).toEqual({
      title: '天气提醒',
      deviceKey: 'decrypted-device-key',
    });
    expect(prisma.userSkillCredentialBinding.findMany).toHaveBeenCalledWith({
      where: { userId: TEST_USER_ID, skillId: TEST_SKILL_ID },
      include: { credential: true },
    });
  });

  it('does not overwrite an explicitly supplied cleartext credential', async () => {
    const prisma = {
      userSkillCredentialBinding: {
        findMany: jest.fn().mockResolvedValue([
          {
            paramName: 'apiKey',
            credential: {
              category: 'api_key',
              encryptedData: 'encrypted-api-key',
            },
          },
        ]),
      },
    };
    const service = new RuntimeCredentialResolverService(prisma as never);
    const decryptSpy = jest.spyOn(service as any, 'decryptPayload');

    const result = await service.resolveInputForRuntime(TEST_USER_ID, TEST_SKILL_ID, {
      apiKey: 'explicit-runtime-key',
    });

    expect(result.apiKey).toBe('explicit-runtime-key');
    expect(decryptSpy).not.toHaveBeenCalled();
  });

  it('fails closed instead of sending a masked secret to a runtime', async () => {
    const prisma = {
      userSkillCredentialBinding: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new RuntimeCredentialResolverService(prisma as never);

    await expect(
      service.resolveInputForRuntime(TEST_USER_ID, TEST_SKILL_ID, {
        apiKey: '[redacted]',
      })
    ).rejects.toThrow('Runtime credential for parameter [apiKey] is still masked');
  });

  it('stops execution when a skill credential is not bound', async () => {
    const prisma = {
      userSkillCredentialBinding: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      skillConfig: {
        findFirst: jest.fn().mockResolvedValue({
          id: TEST_SKILL_ID,
          paramsSchema: {
            properties: {
              content: { type: 'string' },
              deviceKey: { type: 'string', description: 'Bark device key' },
            },
            required: ['content'],
          },
        }),
      },
    };
    const service = new RuntimeCredentialResolverService(prisma as never);

    await expect(
      service.resolveInputForRuntime(TEST_USER_ID, TEST_SKILL_ID, { content: 'hello' })
    ).rejects.toThrow('请先为当前 Skill 绑定用户凭证：deviceKey');
  });

  it('correctly identifies loginCredential as sensitive and auto-injects password from basic_auth', async () => {
    const prisma = {
      userSkillCredentialBinding: {
        findMany: jest.fn().mockResolvedValue([
          {
            paramName: 'loginCredential',
            credential: {
              category: 'basic_auth',
              encryptedData: 'encrypted-login-credential',
            },
          },
        ]),
      },
      skillConfig: {
        findFirst: jest.fn().mockResolvedValue({
          id: TEST_SKILL_ID,
          paramsSchema: {
            properties: {
              username: { type: 'string' },
              loginCredential: { type: 'string', description: '登录密码' },
            },
            required: ['username', 'loginCredential'],
          },
        }),
      },
    };
    const service = new RuntimeCredentialResolverService(prisma as never);
    jest.spyOn(service as any, 'decryptPayload').mockReturnValue({
      username: 'admin',
      password: 'vault-password-456',
    });

    const result = await service.resolveInputForRuntime(TEST_USER_ID, TEST_SKILL_ID, {
      username: 'admin',
      loginCredential: '••••••••',
    });

    expect(result).toEqual({
      username: 'admin',
      loginCredential: 'vault-password-456',
    });
  });

  it('does not throw UUID errors when skillId is a built-in capability name like platform.search.web', async () => {
    const prisma = {
      userSkillCredentialBinding: {
        findMany: jest.fn(),
      },
      skillConfig: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new RuntimeCredentialResolverService(prisma as never);

    const result = await service.resolveInputForRuntime(
      TEST_USER_ID,
      'platform.search.web',
      { query: '微博热点', maxResults: 5 }
    );

    expect(result).toEqual({ query: '微博热点', maxResults: 5 });
    expect(prisma.userSkillCredentialBinding.findMany).not.toHaveBeenCalled();
    expect(prisma.skillConfig.findFirst).toHaveBeenCalledWith({
      where: { name: 'platform.search.web' },
      select: { id: true, paramsSchema: true },
    });
  });

  it('resolves bindings by looking up skill UUID by name when skillId is a string name', async () => {
    const prisma = {
      userSkillCredentialBinding: {
        findMany: jest.fn().mockResolvedValue([
          {
            paramName: 'apiKey',
            credential: {
              category: 'api_key',
              encryptedData: 'encrypted-api-key',
            },
          },
        ]),
      },
      skillConfig: {
        findFirst: jest.fn().mockResolvedValue({
          id: TEST_SKILL_ID,
          paramsSchema: {
            properties: {
              apiKey: { type: 'string', isSecret: true },
            },
          },
        }),
      },
    };
    const service = new RuntimeCredentialResolverService(prisma as never);
    jest.spyOn(service as any, 'decryptPayload').mockReturnValue({ apiKey: 'my-injected-key' });

    const result = await service.resolveInputForRuntime(
      TEST_USER_ID,
      'custom-named-skill',
      { apiKey: '••••••••' }
    );

    expect(result.apiKey).toBe('my-injected-key');
    expect(prisma.skillConfig.findFirst).toHaveBeenCalledWith({
      where: { name: 'custom-named-skill' },
      select: { id: true, paramsSchema: true },
    });
    expect(prisma.userSkillCredentialBinding.findMany).toHaveBeenCalledWith({
      where: { userId: TEST_USER_ID, skillId: TEST_SKILL_ID },
      include: { credential: true },
    });
  });

  it('auto-injects username from basic_auth credential when username is placeholder ${username} or missing', async () => {
    const prisma = {
      userSkillCredentialBinding: {
        findMany: jest.fn().mockResolvedValue([
          {
            paramName: 'loginCredential',
            credential: {
              category: 'basic_auth',
              encryptedData: 'encrypted-data',
            },
          },
        ]),
      },
      skillConfig: {
        findFirst: jest.fn().mockResolvedValue({
          id: TEST_SKILL_ID,
          paramsSchema: {
            properties: {
              username: { type: 'string', description: '用户名' },
              loginCredential: { type: 'string', description: '密码' },
            },
            required: ['username', 'loginCredential'],
          },
        }),
      },
    };
    const service = new RuntimeCredentialResolverService(prisma as never);
    jest.spyOn(service as any, 'decryptPayload').mockReturnValue({
      username: 'ops_user',
      password: 'secret_password_789',
    });

    const result = await service.resolveInputForRuntime(TEST_USER_ID, TEST_SKILL_ID, {
      username: '${username}',
      loginCredential: '••••••••',
    });

    expect(result).toEqual({
      username: 'ops_user',
      loginCredential: 'secret_password_789',
    });
  });
});


