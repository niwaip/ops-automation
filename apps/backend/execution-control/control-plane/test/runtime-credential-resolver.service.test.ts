import { RuntimeCredentialResolverService } from '../src/modules/execution/credentials/runtime-credential-resolver.service';

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

    const result = await service.resolveInputForRuntime('user-1', 'skill-1', {
      title: '天气提醒',
      deviceKey: '••••••••',
    });

    expect(result).toEqual({
      title: '天气提醒',
      deviceKey: 'decrypted-device-key',
    });
    expect(prisma.userSkillCredentialBinding.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', skillId: 'skill-1' },
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

    const result = await service.resolveInputForRuntime('user-1', 'skill-1', {
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
      service.resolveInputForRuntime('user-1', 'skill-1', {
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
      service.resolveInputForRuntime('user-1', 'skill-1', { content: 'hello' })
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

    const result = await service.resolveInputForRuntime('user-1', 'skill-1', {
      username: 'admin',
      loginCredential: '••••••••',
    });

    expect(result).toEqual({
      username: 'admin',
      loginCredential: 'vault-password-456',
    });
  });
});

