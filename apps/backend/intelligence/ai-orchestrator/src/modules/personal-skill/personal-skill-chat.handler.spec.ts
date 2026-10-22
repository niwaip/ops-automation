import { handleSavePersonalSkillChat } from './personal-skill-chat.handler';
import { UserSandboxDispatcherService } from '../chat/user-sandbox-dispatcher.service';

describe('save skill chat lifecycle', () => {
  const ready = { captureId: 'cap', status: 'ready', skillId: 'skill', slug: 'summary', version: 1 };
  let capture: any;
  let conversation: any;
  let events: any[];
  const body: any = { message: '保存为 部门别有偿统计 的skill', sessionId: 'session', clientMessageId: 'request' };
  const run = (options: any = {}) => handleSavePersonalSkillChat({ body, userId: 'owner',
    capture, conversation, emit: (e) => events.push(e), waitMs: 0, ...options });

  beforeEach(() => {
    capture = { createCapture: jest.fn().mockResolvedValue({ captureId: 'cap' }),
      getCaptureStatus: jest.fn().mockReturnValue(ready) };
    conversation = { persistConversation: jest.fn().mockResolvedValue({}),
      buildSessionPatchEvent: jest.fn().mockReturnValue({ type: 'session_patch' }) };
    events = [];
  });

  it('saves the exact request with a stable retry key and only reports installed identity', async () => {
    expect(await run()).toBe(true);
    expect(capture.createCapture).toHaveBeenCalledWith('owner', expect.objectContaining({
      displayName: '部门别有偿统计', idempotencyKey: 'chat:session:request',
      sourceRef: { kind: 'sandbox_turn', sessionId: 'session' },
    }));
    expect(conversation.persistConversation).toHaveBeenCalledWith(expect.objectContaining({
      assistantContent: expect.stringContaining('已保存个人技能「部门别有偿统计」v1'), ownerUserId: 'owner',
    }));
  });

  it('returns and persists pending state without claiming success', async () => {
    capture.getCaptureStatus.mockReturnValue({ captureId: 'cap', status: 'generating' });
    expect(await run()).toBe(true);
    expect(conversation.persistConversation.mock.calls[0][0].assistantContent).toContain('尚未保存完成');
    expect(events.find((e) => e.data)?.data.statusUrl).toContain('/captures/cap');
  });

  it.each(['failed', 'exception', 'unavailable', 'incomplete_receipt', 'status_exception'])(
    'keeps %s inside the save flow', async (failure) => {
      if (failure === 'failed') capture.getCaptureStatus.mockReturnValue({ captureId: 'cap', status: 'failed', error: '安装失败' });
      if (failure === 'exception') capture.createCapture.mockRejectedValue(new Error('来源不可用'));
      if (failure === 'status_exception') capture.getCaptureStatus.mockImplementation(() => { throw new Error('状态不可用'); });
      if (failure === 'incomplete_receipt') capture.getCaptureStatus.mockReturnValue({ captureId: 'cap', status: 'ready' });
      expect(await run({ capture: failure === 'unavailable' ? undefined : capture })).toBe(true);
      expect(events.find((e) => e.type === 'error')?.content).toContain('失败');
      expect(conversation.persistConversation.mock.calls[0][0].assistantContent).not.toContain('已保存个人技能');
    });

  it('does not re-execute work when chat persistence fails after installing', async () => {
    conversation.persistConversation.mockRejectedValue(new Error('redis unavailable'));
    expect(await run()).toBe(true);
    expect(capture.createCapture).toHaveBeenCalledTimes(1);
    expect(events.some((e) => e.content?.includes('未能同步到聊天记录'))).toBe(true);
  });

  it('never calls the sandbox when the capture dependency is missing', async () => {
    const original = global.fetch;
    const fetchMock = jest.fn();
    global.fetch = fetchMock;
    try {
      const dispatcher = new UserSandboxDispatcherService(conversation, {} as any, {} as any);
      expect(await dispatcher.dispatchPersonalSandbox(body, (e) => events.push(e), 'owner')).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(events.some((e) => e.type === 'error')).toBe(true);
    } finally { global.fetch = original; }
  });

  it('leaves ordinary work to the sandbox', async () => {
    expect(await run({ body: { message: '统计金额' } })).toBe(false);
    expect(capture.createCapture).not.toHaveBeenCalled();
    expect(conversation.persistConversation).not.toHaveBeenCalled();
  });
});
