import { DingtalkChannelService, ImCredentialCipher } from '@ops/im-gateway';

describe('Dingtalk channel', () => {
  const previousKey = process.env.IM_CHANNEL_ENCRYPTION_KEY;
  beforeEach(() => {
    process.env.IM_CHANNEL_ENCRYPTION_KEY =
      '7fd6414a543574effddb645132638c2357ba2f12a57c09216bc45880f5271757';
  });
  afterEach(() => {
    if (previousKey === undefined) delete process.env.IM_CHANNEL_ENCRYPTION_KEY;
    else process.env.IM_CHANNEL_ENCRYPTION_KEY = previousKey;
    jest.restoreAllMocks();
  });

  it('validates webhook url, encrypts credentials, and returns masked webhook url', async () => {
    const cipher = new ImCredentialCipher();
    const prisma: any = {
      imChannelConnection: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null) // for fingerprint conflict check
          .mockResolvedValueOnce({
            encryptedCredential: cipher.encrypt(
              JSON.stringify({
                webhookUrl:
                  'https://oapi.dingtalk.com/robot/send?access_token=1234567890abcdef1234567890abcdef',
                secret: 'SEC123456789',
              })
            ),
            status: 'disabled',
            enabled: false,
            xiaozhiAlias: 'Dev Ops Bot',
          }),
        upsert: jest.fn(),
      },
    };

    const service = new DingtalkChannelService(prisma, cipher);
    const validUrl =
      'https://oapi.dingtalk.com/robot/send?access_token=1234567890abcdef1234567890abcdef';
    const result = await service.save('user-1', validUrl, 'SEC123456789', 'Dev Ops Bot');

    expect(prisma.imChannelConnection.upsert).toHaveBeenCalled();
    const createPayload = prisma.imChannelConnection.upsert.mock.calls[0][0].create;
    expect(createPayload.encryptedCredential).not.toContain('1234567890abcdef');
    expect(createPayload.encryptedCredential).not.toContain('SEC123456789');

    expect(result.configured).toBe(true);
    expect(result.hasSecret).toBe(true);
    expect(result.alias).toBe('Dev Ops Bot');
    expect(result.webhookUrl).toContain('1234****cdef');
    expect(result.webhookUrl).not.toContain('567890abcdef1234');
  });

  it('rejects invalid webhook urls', async () => {
    const cipher = new ImCredentialCipher();
    const prisma: any = { imChannelConnection: { findUnique: jest.fn() } };
    const service = new DingtalkChannelService(prisma, cipher);

    await expect(
      service.save('user-1', 'http://insecure.com/robot/send?access_token=abc')
    ).rejects.toThrow('https');

    await expect(
      service.save('user-1', 'https://other-domain.com/robot/send?access_token=abc')
    ).rejects.toThrow('请使用钉钉官方自定义机器人 Webhook 地址');

    await expect(
      service.save('user-1', 'https://oapi.dingtalk.com/robot/send')
    ).rejects.toThrow('access_token');
  });

  it('tests dingtalk connectivity and updates status when success', async () => {
    const cipher = new ImCredentialCipher();
    const webhookUrl =
      'https://oapi.dingtalk.com/robot/send?access_token=test_token_12345678';
    const secret = 'SEC999999999';
    const encrypted = cipher.encrypt(JSON.stringify({ webhookUrl, secret }));

    const prisma: any = {
      imChannelConnection: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'conn-1',
          userId: 'user-1',
          channel: 'dingtalk',
          enabled: true,
          status: 'online',
          encryptedCredential: encrypted,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    let requestedUrl = '';
    let requestedBody = '';
    jest.spyOn(global, 'fetch').mockImplementation(async (url: any, options: any) => {
      requestedUrl = String(url);
      requestedBody = String(options.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({ errcode: 0, errmsg: 'ok' }),
      } as any;
    });

    const service = new DingtalkChannelService(prisma, cipher);
    const testResult = await service.test('user-1');

    expect(testResult.success).toBe(true);
    expect(requestedUrl).toContain('timestamp=');
    expect(requestedUrl).toContain('sign=');
    expect(requestedBody).toContain('OpsPilot');
    expect(prisma.imChannelConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'conn-1' },
        data: expect.objectContaining({ status: 'online', lastError: null }),
      })
    );
  });

  it('handles dingtalk error response gracefully during test', async () => {
    const cipher = new ImCredentialCipher();
    const webhookUrl =
      'https://oapi.dingtalk.com/robot/send?access_token=test_invalid';
    const encrypted = cipher.encrypt(JSON.stringify({ webhookUrl }));

    const prisma: any = {
      imChannelConnection: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'conn-1',
          userId: 'user-1',
          channel: 'dingtalk',
          enabled: true,
          status: 'online',
          encryptedCredential: encrypted,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ errcode: 300001, errmsg: 'token is not exist' }),
    } as any);

    const service = new DingtalkChannelService(prisma, cipher);
    const testResult = await service.test('user-1');

    expect(testResult.success).toBe(false);
    expect(testResult.error).toContain('token is not exist');
    expect(prisma.imChannelConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastError: 'token is not exist' }),
      })
    );
  });

  it('toggles enabled status and handles removal', async () => {
    const cipher = new ImCredentialCipher();
    const encrypted = cipher.encrypt(
      JSON.stringify({
        webhookUrl: 'https://oapi.dingtalk.com/robot/send?access_token=abc12345678',
      })
    );

    const prisma: any = {
      imChannelConnection: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'conn-1',
            userId: 'user-1',
            encryptedCredential: encrypted,
            enabled: false,
          })
          .mockResolvedValueOnce({
            id: 'conn-1',
            userId: 'user-1',
            encryptedCredential: encrypted,
            enabled: true,
            status: 'online',
          })
          .mockResolvedValueOnce({
            id: 'conn-1',
            userId: 'user-1',
            encryptedCredential: encrypted,
          }),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    const service = new DingtalkChannelService(prisma, cipher);
    const enabledResult = await service.setEnabled('user-1', true);
    expect(enabledResult.enabled).toBe(true);

    const removeResult = await service.remove('user-1');
    expect(removeResult.success).toBe(true);
    expect(prisma.imChannelConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'conn-1' },
        data: expect.objectContaining({
          enabled: false,
          status: 'unconfigured',
          encryptedCredential: null,
        }),
      })
    );
  });
});
