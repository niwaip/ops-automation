import {
  ImChannelService,
  WechatIlinkClient,
  WechatMediaAdapter,
  WechatOutboundQueueService,
  formatForWeChat,
  sanitizeWeChatText,
  splitTextPreservingLines,
} from '@ops/im-gateway';
import * as crypto from 'crypto';

describe('WeChat Media, Outbound Queue & Text Utilities', () => {
  describe('WechatMediaAdapter', () => {
    const adapter = new WechatMediaAdapter();
    const key = crypto.randomBytes(16);

    it('encrypts and decrypts buffer using AES-128-ECB correctly', () => {
      const plaintext = Buffer.from('Hello WeChat Media Streaming Content 1234567890!');
      const encrypted = adapter.encryptAesEcb(plaintext, key);
      expect(encrypted).not.toEqual(plaintext);
      expect(encrypted.length % 16).toBe(0);

      const decrypted = adapter.decryptAesEcb(encrypted, key);
      expect(decrypted.toString('utf-8')).toBe(plaintext.toString('utf-8'));
    });

    it('detects image extensions from magic bytes', () => {
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
      expect(adapter.detectImageExtension(pngBuffer)).toBe('png');

      const jpgBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(adapter.detectImageExtension(jpgBuffer)).toBe('jpg');

      const gifBuffer = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]);
      expect(adapter.detectImageExtension(gifBuffer)).toBe('gif');

      const webpBuffer = Buffer.from([
        0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
      ]);
      expect(adapter.detectImageExtension(webpBuffer)).toBe('webp');
    });

    it('parses AES keys from 16-byte base64, 32-hex string, and hex base64', () => {
      // 1. Raw 16-byte base64
      const raw16 = crypto.randomBytes(16);
      const b64 = raw16.toString('base64');
      expect(adapter.parseAesKey({ aes_key: b64 })).toEqual(raw16);

      // 2. 32-hex chars
      const hex32 = raw16.toString('hex');
      expect(adapter.parseAesKey(hex32)).toEqual(raw16);

      // 3. Base64 encoded 32-hex string (iLink typical format)
      const b64Hex = Buffer.from(hex32, 'ascii').toString('base64');
      expect(adapter.parseAesKey({ aes_key: b64Hex })).toEqual(raw16);
    });

    it('accurately identifies text files and MIME types', () => {
      expect(adapter.isTextFile('report.txt')).toBe(true);
      expect(adapter.isTextFile('script.py')).toBe(true);
      expect(adapter.isTextFile('data.json')).toBe(true);
      expect(adapter.isTextFile('document.pdf')).toBe(false);
      expect(adapter.isTextFile('archive.zip')).toBe(false);

      expect(adapter.detectMimeType('table.csv')).toBe('text/csv');
      expect(adapter.detectMimeType('manual.pdf')).toBe('application/pdf');
      expect(adapter.detectMimeType('photo.png')).toBe('image/png');
    });
  });

  describe('WechatOutboundQueueService', () => {
    let queueService: WechatOutboundQueueService;
    const connectionId = 'conn-test-123';

    beforeEach(() => {
      queueService = new WechatOutboundQueueService();
    });

    it('tracks budget up to 10 messages and enforces limit', () => {
      expect(queueService.getBudgetUsed(connectionId)).toBe(0);
      expect(queueService.isBudgetAvailable(connectionId)).toBe(true);

      for (let i = 0; i < 9; i++) {
        queueService.recordSent(connectionId);
        expect(queueService.isBudgetAvailable(connectionId)).toBe(true);
      }

      queueService.recordSent(connectionId); // 10th
      expect(queueService.getBudgetUsed(connectionId)).toBe(10);
      expect(queueService.isBudgetAvailable(connectionId)).toBe(false);

      queueService.resetBudget(connectionId);
      expect(queueService.getBudgetUsed(connectionId)).toBe(0);
      expect(queueService.isBudgetAvailable(connectionId)).toBe(true);
    });

    it('generates quota warning suffix at threshold 8', () => {
      expect(queueService.buildQuotaWarningSuffix(5)).toBe('');
      expect(queueService.buildQuotaWarningSuffix(7)).toBe('');
      expect(queueService.buildQuotaWarningSuffix(8)).toContain('微信限制连续发送');
      expect(queueService.buildQuotaWarningSuffix(10)).toContain('已发 10 条');
    });

    it('parks and drains messages correctly', () => {
      queueService.park(connectionId, { kind: 'text', text: 'msg 1' });
      queueService.park(connectionId, { kind: 'text', text: 'msg 2' });
      expect(queueService.getPendingCount(connectionId)).toBe(2);

      const drained = queueService.drainBatch(connectionId, 1);
      expect(drained.length).toBe(1);
      expect(drained[0]).toEqual({ kind: 'text', text: 'msg 1' });
      expect(queueService.getPendingCount(connectionId)).toBe(1);

      const rest = queueService.drainBatch(connectionId, 5);
      expect(rest.length).toBe(1);
      expect(queueService.getPendingCount(connectionId)).toBe(0);
    });
  });

  describe('wechat-formatter.util', () => {
    it('sanitizes unpaired UTF-16 surrogates without damaging valid emojis', () => {
      const validText = '你好，世界！🚀🎉✨ 测试消息';
      expect(sanitizeWeChatText(validText)).toBe(validText);

      // Half of a surrogate pair
      const brokenHighSurrogate = 'Test \uD83D broken';
      const fixed = sanitizeWeChatText(brokenHighSurrogate);
      expect(fixed).toBe('Test \uFFFD broken');

      const brokenLowSurrogate = 'Test \uDE00 broken';
      expect(sanitizeWeChatText(brokenLowSurrogate)).toBe('Test \uFFFD broken');
    });

    it('formats markdown for clean WeChat mobile display', () => {
      const markdown = `
### 任务执行报告
**执行状态**：成功
这是详情：请点击 [控制面板](https://ops.example.com/panel) 查看。
![架构图](https://ops.example.com/arch.png)

*重点说明*：已完成数据同步。
`;
      const formatted = formatForWeChat(markdown);
      expect(formatted).not.toContain('###');
      expect(formatted).not.toContain('**');
      expect(formatted).not.toContain('*重点');
      expect(formatted).toContain('控制面板 (https://ops.example.com/panel)');
      expect(formatted).toContain('[图片: 架构图]');
    });

    it('splits text preserving natural line boundaries', () => {
      const text = 'Line 1: first paragraph\nLine 2: second paragraph\nLine 3: third paragraph';
      const chunks = splitTextPreservingLines(text, 30);
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(30);
      }
      expect(chunks.join('\n')).toBe(text);
    });
  });

  describe('ImChannelService Media and Inbound Handling', () => {
    let imChannelService: ImChannelService;
    let mockPrisma: any;
    let mockCipher: any;
    let mockWechat: any;
    let mockMediaAdapter: any;

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
        notifyStart: jest.fn().mockResolvedValue(undefined),
        notifyStop: jest.fn(),
        sendText: jest.fn().mockResolvedValue(undefined),
        sendMediaMessage: jest.fn().mockResolvedValue('msg-id-123'),
        sendTyping: jest.fn().mockResolvedValue(undefined),
        getTypingTicket: jest.fn().mockResolvedValue('test_ticket_123'),
      };
      mockMediaAdapter = {
        parseAesKey: jest.fn().mockReturnValue(Buffer.alloc(16)),
        downloadAndDecrypt: jest.fn().mockResolvedValue(Buffer.from('mock file content')),
        detectImageExtension: jest.fn().mockReturnValue('png'),
        detectMimeType: jest.fn().mockReturnValue('text/plain'),
        isTextFile: jest.fn().mockReturnValue(true),
      };

      imChannelService = new ImChannelService(
        mockPrisma,
        mockCipher,
        mockWechat,
        mockMediaAdapter
      );
    });

    it('parses incoming quote reply and media, passing files to askAi', async () => {
      const askAiSpy = jest
        .spyOn(imChannelService as any, 'askAi')
        .mockResolvedValue('已收到文件并完成分析');

      const message = {
        from_user_id: 'user_wx_1',
        item_list: [
          {
            type: 1,
            text_item: { text: '请帮我分析' },
            ref_msg: {
              title: '上游通知',
              message_item: { text_item: { text: '系统告警' } },
            },
          },
          {
            type: 4,
            file_item: {
              file_name: 'log.txt',
              media: { encrypt_query_param: 'param123', aes_key: 'key123' },
            },
          },
        ],
      };

      const credential = {
        baseUrl: 'https://ilinkai.weixin.qq.com',
        token: 'mock-token',
        ownerUserId: 'user_wx_1',
      };

      await (imChannelService as any).handleInbound(
        'user-uuid',
        'conn-uuid',
        'chat',
        credential,
        message
      );

      expect(askAiSpy).toHaveBeenCalledTimes(1);
      const [, , prompt, , files] = askAiSpy.mock.calls[0] as any[];
      expect(prompt).toContain('[引用: 上游通知 | 系统告警]');
      expect(prompt).toContain('请帮我分析');
      expect(files).toBeDefined();
      expect(files.length).toBe(1);
      expect(files[0].fileName).toBe('log.txt');
      expect(files[0].extractedText).toBe('mock file content');
    });

    it('handles /next command and flushes queued items', async () => {
      const credential = {
        baseUrl: 'https://ilinkai.weixin.qq.com',
        token: 'mock-token',
        ownerUserId: 'user_wx_1',
      };

      // Park an item
      (imChannelService as any).outboundQueue.park('conn-uuid', {
        kind: 'text',
        text: '暂存的第一条消息',
      });

      const message = {
        from_user_id: 'user_wx_1',
        item_list: [{ type: 1, text_item: { text: '/next' } }],
      };

      await (imChannelService as any).handleInbound(
        'user-uuid',
        'conn-uuid',
        'chat',
        credential,
        message
      );

      // Should have sent the flushed message and the summary
      expect(mockWechat.sendText).toHaveBeenCalledTimes(2);
      expect(mockWechat.sendText.mock.calls[0][3]).toContain('暂存的第一条消息');
      expect(mockWechat.sendText.mock.calls[1][3]).toContain('已为你补发 1 条暂存消息');
    });

    it('attempts notifyStart self-recovery upon -14 session timeout', async () => {
      const credential = {
        baseUrl: 'https://ilinkai.weixin.qq.com',
        token: 'mock-token',
        ownerUserId: 'user_wx_1',
      };

      mockPrisma.imChannelConnection.findUnique.mockResolvedValue({
        id: 'conn-timeout',
        enabled: true,
        encryptedCredential: 'enc_{"token":"tok","baseUrl":"https://ilinkai.weixin.qq.com/","ownerUserId":"user_wx_1"}',
      });

      let callCount = 0;
      mockWechat.getUpdates.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return { ret: -14, errcode: -14, errmsg: 'session timeout' };
        }
        // Second call succeeds after notifyStart
        return { ret: 0, msgs: [], get_updates_buf: 'cursor_2' };
      });

      // Start runtime and let it run one loop, then abort
      const startPromise = (imChannelService as any).startRuntime('conn-timeout');

      // Wait 100ms then abort runtime controller
      await new Promise((resolve) => setTimeout(resolve, 100));
      (imChannelService as any).runtimes.get('conn-timeout')?.abort();
      await startPromise;

      expect(mockWechat.notifyStart).toHaveBeenCalledTimes(2); // 1 on initial start, 1 on -14 recovery
    });

    it('sends a test file to the WeChat recipient via sendTestFile', async () => {
      mockPrisma.imChannelConnection.findUnique.mockResolvedValue({
        id: 'conn-test-file',
        userId: 'user-uuid',
        enabled: true,
        encryptedCredential:
          'enc_{"token":"tok","baseUrl":"https://ilinkai.weixin.qq.com/","ownerUserId":"user_wx_1"}',
      });

      const res = await imChannelService.sendTestFile(
        'user-uuid',
        'custom-test.txt',
        '测试文件内容'
      );

      expect(res.success).toBe(true);
      expect(res.clientId).toBe('msg-id-123');
      expect(mockWechat.sendMediaMessage).toHaveBeenCalledWith(
        'https://ilinkai.weixin.qq.com/',
        'tok',
        'user_wx_1',
        3, // WechatUploadMediaType.FILE
        expect.any(Buffer),
        expect.objectContaining({ fileName: 'custom-test.txt' })
      );
    });

    it('stages incoming image without text and prompts user for instructions without calling askAi', async () => {
      const askAiSpy = jest.spyOn(imChannelService as any, 'askAi');
      askAiSpy.mockClear();
      mockWechat.sendText.mockClear();

      const imageMessage = {
        from_user_id: 'user_wx_1',
        item_list: [
          {
            type: 2,
            image_item: {
              media: { encrypt_query_param: 'img_param_123', aes_key: 'img_key_123' },
            },
          },
        ],
      };

      const credential = {
        baseUrl: 'https://ilinkai.weixin.qq.com',
        token: 'mock-token',
        ownerUserId: 'user_wx_1',
      };

      await (imChannelService as any).handleInbound(
        'user-uuid',
        'conn-staging-test',
        'chat',
        credential,
        imageMessage
      );

      // Verification: askAi is called for background session persistence, not for direct reply
      expect(askAiSpy).toHaveBeenCalledWith(
        'user-uuid',
        expect.any(String),
        expect.stringContaining('发送了图片'),
        'chat',
        expect.any(Array),
        expect.stringContaining('已收到图片，请发送你的处理指令')
      );

      // Must have replied with instruction prompt
      expect(mockWechat.sendText).toHaveBeenCalledTimes(1);
      expect(mockWechat.sendText.mock.calls[0][3]).toContain('已收到图片，请发送你的处理指令');

      // Staged media should contain the image
      const staged = (imChannelService as any).stagedMedia.get('conn-staging-test');
      expect(staged).toBeDefined();
      expect(staged.files.length).toBe(1);
      expect(staged.files[0].mimeType).toBe('image/png');
    });

    it('attaches staged media when user sends subsequent text instruction', async () => {
      const askAiSpy = jest
        .spyOn(imChannelService as any, 'askAi')
        .mockResolvedValue('已为你识别图片中的文字内容');
      askAiSpy.mockClear();
      mockWechat.sendText.mockClear();

      const credential = {
        baseUrl: 'https://ilinkai.weixin.qq.com',
        token: 'mock-token',
        ownerUserId: 'user_wx_1',
      };

      // 1. Send image first
      await (imChannelService as any).handleInbound(
        'user-uuid',
        'conn-staging-test',
        'chat',
        credential,
        {
          from_user_id: 'user_wx_1',
          item_list: [
            {
              type: 2,
              image_item: {
                media: { encrypt_query_param: 'img_param_123', aes_key: 'img_key_123' },
              },
            },
          ],
        }
      );

      // 1 call for session persistence
      expect(askAiSpy).toHaveBeenCalledTimes(1);

      // 2. User types instruction subsequently
      const textMessage = {
        from_user_id: 'user_wx_1',
        item_list: [
          {
            type: 1,
            text_item: { text: '请帮我提取图片里的报错信息' },
          },
        ],
      };

      await (imChannelService as any).handleInbound(
        'user-uuid',
        'conn-staging-test',
        'chat',
        credential,
        textMessage
      );

      // Now askAi SHOULD be called again with user's text AND the staged image
      expect(askAiSpy).toHaveBeenCalledTimes(2);
      const [, , prompt, , files] = askAiSpy.mock.calls[1] as any[];
      expect(prompt).toBe('请帮我提取图片里的报错信息');
      expect(files).toBeDefined();
      expect(files.length).toBe(1);
      expect(files[0].mimeType).toBe('image/png');

      // Staged media must be cleared after being consumed
      expect((imChannelService as any).stagedMedia.has('conn-staging-test')).toBe(false);
    });

    it('clears staged media when user sends /cancel', async () => {
      const credential = {
        baseUrl: 'https://ilinkai.weixin.qq.com',
        token: 'mock-token',
        ownerUserId: 'user_wx_1',
      };

      // 1. Send image first
      await (imChannelService as any).handleInbound(
        'user-uuid',
        'conn-staging-test',
        'chat',
        credential,
        {
          from_user_id: 'user_wx_1',
          item_list: [
            {
              type: 2,
              image_item: {
                media: { encrypt_query_param: 'img_param_123', aes_key: 'img_key_123' },
              },
            },
          ],
        }
      );

      expect((imChannelService as any).stagedMedia.has('conn-staging-test')).toBe(true);

      // 2. User sends /cancel
      mockWechat.sendText.mockClear();
      await (imChannelService as any).handleInbound(
        'user-uuid',
        'conn-staging-test',
        'chat',
        credential,
        {
          from_user_id: 'user_wx_1',
          item_list: [
            {
              type: 1,
              text_item: { text: '/cancel' },
            },
          ],
        }
      );

      expect((imChannelService as any).stagedMedia.has('conn-staging-test')).toBe(false);
      expect(mockWechat.sendText).toHaveBeenCalledTimes(1);
      expect(mockWechat.sendText.mock.calls[0][3]).toContain('已清空暂存的图片和文件');
    });

    it('delivers outbound files when askAi returns outboundFiles', async () => {
      const askAiSpy = jest.spyOn(imChannelService as any, 'askAi').mockResolvedValue({
        response: '这是为您准备的个人空间欢迎文档，请查收！',
        outboundFiles: [
          {
            filePath: '/knowledge/个人空间欢迎文档.md',
            fileName: '个人空间欢迎文档.md',
          },
        ],
      });
      const deliverFileSpy = jest
        .spyOn(imChannelService as any, 'deliverFile')
        .mockResolvedValue(undefined);

      const credential = {
        baseUrl: 'https://ilinkai.weixin.qq.com',
        token: 'mock-token',
        ownerUserId: 'user_wx_1',
      };

      await (imChannelService as any).handleInbound(
        'user-uuid',
        'conn-uuid',
        'chat',
        credential,
        {
          from_user_id: 'user_wx_1',
          item_list: [{ type: 1, text_item: { text: '通过微信发送 个人空间欢迎文档给我' } }],
        }
      );

      expect(mockWechat.sendText).toHaveBeenCalledWith(
        credential.baseUrl,
        credential.token,
        credential.ownerUserId,
        expect.stringContaining('这是为您准备的个人空间欢迎文档'),
        undefined
      );
      expect(deliverFileSpy).toHaveBeenCalledWith(
        'conn-uuid',
        credential,
        'user-uuid',
        expect.objectContaining({
          filePath: '/knowledge/个人空间欢迎文档.md',
          fileName: '个人空间欢迎文档.md',
        }),
        undefined
      );
    });
  });
});
