import { ChannelTaskGatewayService, ImCredentialCipher, XiaozhiChannelService, XiaozhiTaskService } from '@ops/im-gateway';

describe('Xiaozhi channel', () => {
  const previousKey = process.env.IM_CHANNEL_ENCRYPTION_KEY;
  beforeEach(() => { process.env.IM_CHANNEL_ENCRYPTION_KEY = '7fd6414a543574effddb645132638c2357ba2f12a57c09216bc45880f5271757'; });
  afterEach(() => {
    if (previousKey === undefined) delete process.env.IM_CHANNEL_ENCRYPTION_KEY;
    else process.env.IM_CHANNEL_ENCRYPTION_KEY = previousKey;
    jest.restoreAllMocks();
  });

  it('encrypts the endpoint and never returns the token', async () => {
    const prisma: any = {
      imChannelConnection: {
        findUnique: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce({ encryptedCredential: 'encrypted', status: 'disabled', enabled: false, xiaozhiAlias: '测试' }),
        upsert: jest.fn(),
      },
    };
    const service = new XiaozhiChannelService(prisma, new ImCredentialCipher(), {} as any);
    const result = await service.save('user-1', 'wss://api.xiaozhi.me/mcp/?token=secret', '测试');
    const saved = prisma.imChannelConnection.upsert.mock.calls[0][0].create;
    expect(saved.encryptedCredential).not.toContain('secret');
    expect(result).not.toHaveProperty('endpoint');
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(saved.credentialFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('does not report success when an execution result is unconfirmed', async () => {
    const task = { id: 'task-1', channelConnectionId: 'connection-1', ownerUserId: 'user-1', instruction: '巡检' };
    const updates: any[] = [];
    const prisma: any = {
      voiceTaskRequest: { findUnique: jest.fn().mockResolvedValue(task), update: jest.fn((input) => { updates.push(input.data); return Promise.resolve(); }) },
      imChannelConnection: { findUnique: jest.fn().mockResolvedValue({ enabled: true }) },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-1', isActive: true, role: 'employee', activeOrgId: null }) },
    };
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ response: '完成', events: [{ type: 'result', content: '完成', data: {} }] }) } as any);
    const service = new XiaozhiTaskService(prisma, new ChannelTaskGatewayService(prisma));
    await (service as any).execute(task.id);
    expect(updates.at(-1).status).toBe('unknown');
    expect(updates.at(-1).executionId).toBeNull();
  });

  it('persists acceptance before the worker claims execution', async () => {
    const task = { id: 'task-1', channelConnectionId: 'connection-1', ownerUserId: 'user-1', instruction: '巡检', status: 'accepted', speechSummary: '任务已受理' };
    const prisma: any = {
      imChannelConnection: { findUnique: jest.fn().mockResolvedValue({ id: 'connection-1', channel: 'xiaozhi', enabled: true, encryptedCredential: 'cipher', userId: 'user-1' }) },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-1', isActive: true, role: 'employee', activeOrgId: null }) },
      voiceTaskRequest: {
        findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0), create: jest.fn().mockResolvedValue(task),
        findMany: jest.fn().mockResolvedValue([task]), updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new XiaozhiTaskService(prisma, new ChannelTaskGatewayService(prisma));
    const execute = jest.spyOn(service as any, 'execute').mockResolvedValue(undefined);
    const accepted = await service.submit('connection-1', '巡检', 'call-12345678');
    expect(accepted.status).toBe('accepted');
    expect(execute).not.toHaveBeenCalled();
    await service.drain(['connection-1']);
    expect(execute).toHaveBeenCalledWith('task-1');
  });

  it('maps an attested success event to a real execution link', async () => {
    const executionId = '123e4567-e89b-42d3-a456-426614174000';
    const task = { id: 'task-1', channelConnectionId: 'connection-1', ownerUserId: 'user-1', instruction: '巡检' };
    const updates: any[] = [];
    const prisma: any = {
      voiceTaskRequest: { findUnique: jest.fn().mockResolvedValue(task), update: jest.fn((input) => { updates.push(input.data); return Promise.resolve(); }) },
      imChannelConnection: { findUnique: jest.fn().mockResolvedValue({ enabled: true }) },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-1', isActive: true, role: 'employee', activeOrgId: null }) },
    };
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ events: [{ type: 'result', content: '巡检完成', data: { status: 'success', executionId } }] }) } as any);
    const service = new XiaozhiTaskService(prisma, new ChannelTaskGatewayService(prisma));
    await (service as any).execute(task.id);
    expect(updates.at(-1)).toMatchObject({ status: 'succeeded', executionId });
  });

  it('never treats a simulated report as a completed ops task', async () => {
    const task = { id: 'task-1', channelConnectionId: 'connection-1', ownerUserId: 'user-1', instruction: '巡检' };
    const updates: any[] = [];
    const prisma: any = {
      voiceTaskRequest: { findUnique: jest.fn().mockResolvedValue(task), update: jest.fn((input) => { updates.push(input.data); return Promise.resolve(); }) },
      imChannelConnection: { findUnique: jest.fn().mockResolvedValue({ enabled: true }) },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-1', isActive: true, role: 'employee', activeOrgId: null }) },
    };
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ response: '以下是模拟巡检结果', events: [{ type: 'result', content: '以下是模拟巡检结果', data: { status: 'success' } }] }) } as any);
    const service = new XiaozhiTaskService(prisma, new ChannelTaskGatewayService(prisma));
    await (service as any).execute(task.id);
    expect(updates.at(-1)).toMatchObject({ status: 'unknown', executionId: null, lastErrorCode: 'UNVERIFIED_MODEL_OUTPUT' });
    expect(updates.at(-1).speechSummary).toContain('没有真实执行记录');
  });
});
