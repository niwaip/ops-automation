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
  });
});
