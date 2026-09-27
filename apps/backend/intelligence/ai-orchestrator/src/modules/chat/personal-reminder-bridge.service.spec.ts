import { Test, TestingModule } from '@nestjs/testing';
import {
  PersonalReminderBridgeService,
  extractDshMarkers,
  stripDshMarkers,
} from './personal-reminder-bridge.service';

describe('PersonalReminderBridgeService - Marker Protocol & Truncation Immunity', () => {
  let service: PersonalReminderBridgeService;
  let originalFetch: any;

  beforeAll(() => {
    originalFetch = global.fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PersonalReminderBridgeService],
    }).compile();

    service = module.get<PersonalReminderBridgeService>(PersonalReminderBridgeService);
  });

  describe('extractDshMarkers & stripDshMarkers', () => {
    it('[P2] correctly extracts markers when title/content contains >>> delimiter in length-prefixed frame', () => {
      const payload = JSON.stringify([
        {
          title: 'WSBK 排位赛 >>> 第一节',
          message: '注意 >>> 弯道变向',
          runAt: '2026-09-26T10:00:00',
        },
      ]);
      const rawText = `前置输出\n<<<DSH_REMINDER_CREATE:len=${payload.length}:${payload}>>>\n后置输出`;

      const matches = extractDshMarkers(rawText, 'REMINDER_CREATE');
      expect(matches).toHaveLength(1);
      expect(matches[0]!.payload).toBe(payload);

      const items = service.extractReminderMarkers(rawText);
      expect(items).toHaveLength(1);
      expect(items[0]!.title).toBe('WSBK 排位赛 >>> 第一节');
      expect(items[0]!.message).toBe('注意 >>> 弯道变向');

      const stripped = stripDshMarkers(rawText, ['REMINDER_CREATE']);
      expect(stripped).not.toContain('<<<DSH_REMINDER_CREATE');
      expect(stripped).not.toContain('>>>');
      expect(stripped.trim()).toBe('前置输出\n\n后置输出');
    });

    it('[P2] correctly extracts legacy JSON markers without length-prefix when content contains >>>', () => {
      const rawText =
        '前置输出\n<<<DSH_REMINDER_CREATE:[{"title": "A>>>B", "message": "详情>>>说明"}]>>>\n后置输出';

      const matches = extractDshMarkers(rawText, 'REMINDER_CREATE');
      expect(matches).toHaveLength(1);
      const parsed = JSON.parse(matches[0]!.payload);
      expect(parsed[0].title).toBe('A>>>B');
      expect(parsed[0].message).toBe('详情>>>说明');

      const stripped = stripDshMarkers(rawText, ['REMINDER_CREATE']);
      expect(stripped).not.toContain('<<<DSH_REMINDER_CREATE');
      expect(stripped).not.toContain('>>>');
      expect(stripped.trim()).toBe('前置输出\n\n后置输出');
    });

    it('[P2] correctly extracts outbound file markers with comments containing >>>', () => {
      const comment = '生成的架构图: 前端 >>> 网关 >>> 后端';
      const filePayload = JSON.stringify({
        filePath: '/workspace/arch.png',
        fileName: 'arch.png',
        comment,
      });
      const rawText = `<<<DSH_OUTBOUND_FILE:len=${filePayload.length}:${filePayload}>>>`;

      const matches = extractDshMarkers(rawText, 'OUTBOUND_FILE');
      expect(matches).toHaveLength(1);
      const parsed = JSON.parse(matches[0]!.payload);
      expect(parsed.comment).toBe(comment);

      const stripped = stripDshMarkers(rawText, ['OUTBOUND_FILE']);
      expect(stripped).toBe('');
    });

    it('[P2] correctly extracts markers containing surrogate pair emojis with Python code-point length without leaking len=', () => {
      const emojiContent = '🚀 一、 旗舰大模型重大突破：阿里千问（Qwen）战略级升级';
      // Python len(emojiContent) is 30 code points, whereas JS emojiContent.length is 31 UTF-16 code units
      const pythonLen = Array.from(emojiContent).length;
      expect(pythonLen).toBe(30);
      expect(emojiContent.length).toBe(31);

      const rawText = `<<<DSH_FINAL_OUTPUT:len=${pythonLen}:${emojiContent}>>>\n<<<DSH_FINAL_OUTPUT>>>\n${emojiContent}`;
      const matches = extractDshMarkers(rawText, 'FINAL_OUTPUT');

      expect(matches).toHaveLength(1);
      expect(matches[0]!.payload).toBe(emojiContent);
      expect(matches[0]!.payload).not.toMatch(/^len=\d+:/);

      const stripped = stripDshMarkers(rawText, ['FINAL_OUTPUT']);
      expect(stripped.trim()).toBe(emojiContent);
      expect(stripped).not.toContain('<<<DSH_FINAL_OUTPUT');
      expect(stripped).not.toMatch(/len=\d+:/);
    });

    it('[P2] cleanly recovers payload and never leaks len= when marker has mismatched length', () => {
      const content = '```markdown\n# 2026年9月最新AI新闻\n正文内容\n```';
      const brokenMarker = `<<<DSH_FINAL_OUTPUT:len=9999:${content}>>>`;

      const matches = extractDshMarkers(brokenMarker, 'FINAL_OUTPUT');
      expect(matches).toHaveLength(1);
      expect(matches[0]!.payload).toBe(content);
      expect(matches[0]!.payload).not.toMatch(/^len=\d+:/);

      const stripped = stripDshMarkers(brokenMarker, ['FINAL_OUTPUT']);
      expect(stripped).toBe('');
    });
  });

  describe('createRemindersInControlPlane & processSandboxReminders', () => {
    it('[P1] captures error message when control-plane returns 400 Bad Request', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            statusCode: 400,
            message: '请选择未来的一次性提醒时间',
            error: 'Bad Request',
          })
        ),
      });

      const res = await service.createRemindersInControlPlane('user_123', [
        {
          title: '过期提醒',
          message: '开会',
          runAt: '2020-01-01T10:00:00',
        },
      ]);

      expect(res.created).toHaveLength(0);
      expect(res.error).toBe('请选择未来的一次性提醒时间');
    });

    it('[P1] returns created reminders when control-plane succeeds', async () => {
      const mockCreated = [
        {
          id: 'rule_1',
          title: '周会',
          message: '周会内容',
          nextRunAt: '2026-09-26T10:00:00.000Z',
          sendWechat: true,
        },
      ];

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue(mockCreated),
      });

      const raw = `<<<DSH_REMINDER_CREATE:[{"title": "周会", "message": "周会内容", "runAt": "2026-09-26T10:00:00"}]>>>`;
      const res = await service.processSandboxReminders('user_123', raw);

      expect(res.created).toEqual(mockCreated);
      expect(res.error).toBeUndefined();
      expect(res.requestedCount).toBe(1);
      expect(res.cleanOutput).toBe('');
    });

    it('[P1] successfully processes update reminder marker and updates control-plane', async () => {
      const mockUpdated = {
        id: 'rule_1',
        title: '周报提醒',
        runAt: '2026-09-26T17:00:00.000Z',
        isActive: true,
      };

      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.includes('/reminders/rule_1')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(mockUpdated),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      const raw = `<<<DSH_REMINDER_UPDATE:{"id": "rule_1", "runAt": "2026-09-26T17:00:00+08:00"}>>>`;
      const res = await service.processSandboxReminders('user_123', raw);

      expect(res.updated).toBeDefined();
      expect(res.updated).toHaveLength(1);
      expect(res.updated?.[0]?.id).toBe('rule_1');
      expect(res.requestedCount).toBe(1);
      expect(res.cleanOutput).toBe('');
    });

    it('[P1] successfully processes delete reminder marker and deletes from control-plane', async () => {
      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.includes('/reminders/rule_del_1')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ success: true }),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      const raw = `<<<DSH_REMINDER_DELETE:{"ids": ["rule_del_1"]}>>>`;
      const res = await service.processSandboxReminders('user_123', raw);

      expect(res.deleted).toBeDefined();
      expect(res.deleted).toHaveLength(1);
      expect(res.deleted?.[0]?.id).toBe('rule_del_1');
      expect(res.requestedCount).toBe(1);
      expect(res.cleanOutput).toBe('');
    });

    it('[P1] blocks ambiguous delete when title matches multiple reminders', async () => {
      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.endsWith('/reminders')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve([
              { id: 'r1', title: '周报提醒-团队版' },
              { id: 'r2', title: '周报提醒-个人版' },
            ]),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      const raw = `<<<DSH_REMINDER_DELETE:{"titles": ["周报提醒"]}>>>`;
      const res = await service.processSandboxReminders('user_123', raw);

      expect(res.deleted).toBeUndefined();
      expect(res.deletedErrors).toBeDefined();
      expect(res.deletedErrors?.[0]?.error).toContain('存在误删风险，已自动阻断');
    });

    it('[P1] prioritizes exact match when ambiguous substring exists', async () => {
      global.fetch = jest.fn().mockImplementation((url: string, opts?: any) => {
        if (url.endsWith('/reminders')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve([
              { id: 'r_exact', title: '周报提醒' },
              { id: 'r_other', title: '周报提醒-领导版' },
            ]),
          });
        }
        if (url.includes('/reminders/r_exact')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ id: 'r_exact', title: '周报提醒', runAt: '2026-09-27T10:00:00' }),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      const raw = `<<<DSH_REMINDER_UPDATE:{"targetTitle": "周报提醒", "runAt": "2026-09-27T10:00:00"}>>>`;
      const res = await service.processSandboxReminders('user_123', raw);

      expect(res.updated).toBeDefined();
      expect(res.updated?.[0]?.id).toBe('r_exact');
    });
  });
});
