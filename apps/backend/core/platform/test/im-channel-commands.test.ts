import { ImChannelService } from '../src/modules/im-channel/im-channel.service';
import { WechatIlinkClient } from '../src/modules/im-channel/wechat-ilink.client';

describe('ImChannelService Commands & WeChat Typing', () => {
  let imChannelService: ImChannelService;
  let mockPrisma: any;
  let mockCipher: any;
  let mockWechat: any;

  beforeEach(() => {
    mockPrisma = {
      imChannelConnection: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ role: 'employee', activeOrgId: null }),
      },
    };
    mockCipher = {
      encrypt: jest.fn((val) => `enc_${val}`),
      decrypt: jest.fn((val) => val.replace(/^enc_/, '')),
    };
    mockWechat = {
      beginLogin: jest.fn(),
      pollLogin: jest.fn(),
      getUpdates: jest.fn(),
      notifyStart: jest.fn(),
      notifyStop: jest.fn(),
      sendText: jest.fn().mockResolvedValue(undefined),
      sendTyping: jest.fn().mockResolvedValue(undefined),
      getTypingTicket: jest.fn().mockResolvedValue('test_ticket_123'),
    };

    imChannelService = new ImChannelService(mockPrisma, mockCipher, mockWechat);
  });

  describe('resolveInteraction', () => {
    it('resolves /t short command to task mode with clean message', () => {
      const res = imChannelService.resolveInteraction('/t 拆分PDF文件', 'auto');
      expect(res.type).toBe('ai');
      expect(res.mode).toBe('task');
      expect(res.message).toBe('拆分PDF文件');
    });

    it('resolves /task and /任务 command aliases', () => {
      const r1 = imChannelService.resolveInteraction('/task 查询天气', 'auto');
      expect(r1.type).toBe('ai');
      expect(r1.mode).toBe('task');
      expect(r1.message).toBe('查询天气');

      const r2 = imChannelService.resolveInteraction('/任务 合并文档', 'chat');
      expect(r2.type).toBe('ai');
      expect(r2.mode).toBe('task');
      expect(r2.message).toBe('合并文档');
    });

    it('handles /t command only without message', () => {
      const res = imChannelService.resolveInteraction('/t', 'auto');
      expect(res.type).toBe('system_reply');
      expect(res.mode).toBe('task');
      expect(res.systemReplyText).toContain('任务执行模式');
    });

    it('resolves /c short command to chat mode with clean message', () => {
      const res = imChannelService.resolveInteraction('/c 请介绍一下你自己', 'task');
      expect(res.type).toBe('ai');
      expect(res.mode).toBe('chat');
      expect(res.message).toBe('请介绍一下你自己');
    });

    it('handles /c command only without message', () => {
      const res = imChannelService.resolveInteraction('/c', 'task');
      expect(res.type).toBe('system_reply');
      expect(res.mode).toBe('chat');
      expect(res.systemReplyText).toContain('日常聊天模式');
    });

    it('resolves /n new session command and flags isNewSession', () => {
      const res = imChannelService.resolveInteraction('/n', 'auto');
      expect(res.type).toBe('system_reply');
      expect(res.isNewSession).toBe(true);
      expect(res.systemReplyText).toContain('全新会话');
    });

    it('resolves /n followed by a command message', () => {
      const res = imChannelService.resolveInteraction('/n /t 总结当前文档', 'auto');
      expect(res.type).toBe('ai');
      expect(res.isNewSession).toBe(true);
      expect(res.mode).toBe('task');
      expect(res.message).toBe('总结当前文档');
    });

    it('resolves /help command with instructions', () => {
      const res = imChannelService.resolveInteraction('/help', 'auto');
      expect(res.type).toBe('system_reply');
      expect(res.systemReplyText).toContain('快捷指令帮助');
    });

    it('classifies auto intent when no prefix is given', () => {
      const taskRes = imChannelService.resolveInteraction('查询北京天气', 'auto');
      expect(taskRes.mode).toBe('task');

      const chatRes = imChannelService.resolveInteraction('今天过得怎么样', 'auto');
      expect(chatRes.mode).toBe('chat');
    });
  });

  describe('WechatIlinkClient typing status', () => {
    it('manages typing ticket caching and sendTyping request', async () => {
      const client = new WechatIlinkClient();
      const mockRequest = jest.spyOn(client as any, 'request').mockImplementation(async (_method, _url, endpoint) => {
        if (endpoint === 'ilink/bot/getconfig') {
          return { typing_ticket: 'mock_typing_ticket_xyz' };
        }
        if (endpoint === 'ilink/bot/sendtyping') {
          return { ret: 0 };
        }
        return {};
      });

      const ticket = await client.getTypingTicket('https://ilinkai.weixin.qq.com/', 'token123', 'user_abc');
      expect(ticket).toBe('mock_typing_ticket_xyz');

      // Second call should hit memory cache without extra network request
      const cachedTicket = await client.getTypingTicket('https://ilinkai.weixin.qq.com/', 'token123', 'user_abc');
      expect(cachedTicket).toBe('mock_typing_ticket_xyz');
      expect(mockRequest).toHaveBeenCalledTimes(1);

      // Send typing status
      await client.sendTyping('https://ilinkai.weixin.qq.com/', 'token123', 'user_abc', 1);
      expect(mockRequest).toHaveBeenCalledTimes(2);
      expect(mockRequest).toHaveBeenLastCalledWith(
        'POST',
        'https://ilinkai.weixin.qq.com/',
        'ilink/bot/sendtyping',
        expect.objectContaining({
          body: expect.objectContaining({
            ilink_user_id: 'user_abc',
            to_user_id: 'user_abc',
            typing_ticket: 'mock_typing_ticket_xyz',
            command: 1,
          }),
        })
      );
    });

    it('handles typing ticket or sendtyping network errors without throwing', async () => {
      const client = new WechatIlinkClient();
      jest.spyOn(client as any, 'request').mockRejectedValue(new Error('Network offline'));

      await expect(
        client.sendTyping('https://ilinkai.weixin.qq.com/', 'token123', 'user_abc', 1)
      ).resolves.toBeUndefined();
    });
  });
});
