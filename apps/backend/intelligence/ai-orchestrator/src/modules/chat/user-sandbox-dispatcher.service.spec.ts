import { Test, TestingModule } from '@nestjs/testing';
import * as fs from 'fs';

jest.mock('fs', () => ({
  __esModule: true,
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
  statSync: jest.fn(),
}));
import { UserSandboxDispatcherService } from './user-sandbox-dispatcher.service';
import { ChatConversationService } from './chat-conversation.service';
import { ChatMediaService } from './chat-media.service';
import { ModelService } from '../model/model.service';
import { StreamEventType } from '../react-engine/interfaces';
import { PersonalReminderBridgeService } from './personal-reminder-bridge.service';

describe('UserSandboxDispatcherService - SSE Error Handling & Model Display Name', () => {
  let service: UserSandboxDispatcherService;
  let mockConversationService: Partial<ChatConversationService>;
  let mockMediaService: Partial<ChatMediaService>;
  let mockModelService: Partial<ModelService>;
  let mockReminderBridge: Partial<PersonalReminderBridgeService>;
  let originalFetch: any;

  beforeAll(() => {
    originalFetch = global.fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  beforeEach(async () => {
    mockConversationService = {
      listMessages: jest.fn().mockResolvedValue([]),
      getChatHistory: jest.fn().mockResolvedValue([]),
      persistConversation: jest.fn().mockResolvedValue({ id: 'sess_1' }),
      buildSessionPatchEvent: jest.fn().mockReturnValue({ type: StreamEventType.SESSION_PATCH, data: {} } as any),
    } as any;
    mockMediaService = {};
    mockReminderBridge = {
      processSandboxReminders: jest.fn().mockResolvedValue({ created: [], requestedCount: 0, cleanOutput: '' }),
      listReminders: jest.fn().mockResolvedValue([]),
    };
    mockModelService = {
      getPreferredDefaultModel: jest.fn().mockReturnValue({ id: 'uuid-1234', name: 'qwen36-35b-a3b' }),
      getDefaultModel: jest.fn().mockReturnValue({ id: 'uuid-1234', name: 'qwen36-35b-a3b' }),
      getModel: jest.fn().mockImplementation((id: string) => {
        if (id === 'uuid-1234') {
          return { id: 'uuid-1234', name: 'qwen36-35b-a3b' };
        }
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserSandboxDispatcherService,
        { provide: ChatConversationService, useValue: mockConversationService },
        { provide: ChatMediaService, useValue: mockMediaService },
        { provide: ModelService, useValue: mockModelService },
        { provide: PersonalReminderBridgeService, useValue: mockReminderBridge },
      ],
    }).compile();

    service = module.get<UserSandboxDispatcherService>(UserSandboxDispatcherService);
  });

  const createMockSseResponse = (chunks: string[], status = 200) => {
    let index = 0;
    const stream = new ReadableStream({
      pull(controller) {
        if (index < chunks.length) {
          controller.enqueue(new TextEncoder().encode(chunks[index++]));
        } else {
          controller.close();
        }
      },
    });

    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      body: stream,
      text: async () => chunks.join(''),
    } as any;
  };

  it('should forward modelDisplayName and parse delta events in SSE stream', async () => {
    let capturedPayload: any = null;
    global.fetch = jest.fn().mockImplementation(async (url: string, opts: any) => {
      capturedPayload = JSON.parse(opts.body);
      return createMockSseResponse([
        'event: observation\ndata: {"content":"⚡ 正在检索..."}\n\n',
        'event: delta\ndata: {"content":"你好"}\n\n',
        'event: delta\ndata: {"content":"世界"}\n\n',
        'event: done\ndata: {"success":true,"output":"<<<DSH_FINAL_OUTPUT>>>你好世界","containerName":"ops-test","durationMs":50,"exitCode":0}\n\n',
      ]);
    });

    const emittedEvents: any[] = [];
    const success = await service.dispatchPersonalSandbox(
      { message: '你好', userId: 'test_user', modelId: 'uuid-1234' } as any,
      (evt) => emittedEvents.push(evt),
      'test_user'
    );

    expect(success).toBe(true);
    expect(capturedPayload.model).toBe('uuid-1234');
    expect(capturedPayload.modelDisplayName).toBe('qwen36-35b-a3b');

    // Verify deltas were streamed as observations
    const deltaEvents = emittedEvents.filter((e) => e.data?.isDelta);
    expect(deltaEvents.length).toBe(2);
    expect(deltaEvents[0].content).toBe('你好');
    expect(deltaEvents[1].content).toBe('你好世界');

    // Verify final result
    const resultEvent = emittedEvents.find((e) => e.type === StreamEventType.RESULT);
    expect(resultEvent).toBeDefined();
    expect(resultEvent.content).toBe('你好世界');
  });

  it('should stream thought events as StreamEventType.THOUGHT and keep delta and result clean without think tags', async () => {
    global.fetch = jest.fn().mockImplementation(async () => {
      return createMockSseResponse([
        'event: thought\ndata: {"content":"正在分析需求..."}\n\n',
        'event: thought\ndata: {"content":"决定创建index.html"}\n\n',
        'event: observation\ndata: {"content":"⏳ [Harness Agent] 正在根据执行结果汇总交付物 (第 2 轮)..."}\n\n',
        'event: delta\ndata: {"content":"已完成文件创建"}\n\n',
        'event: done\ndata: {"success":true,"output":"<<<DSH_FINAL_OUTPUT>>>已完成文件创建","containerName":"ops-test","durationMs":80,"exitCode":0}\n\n',
      ]);
    });

    const emittedEvents: any[] = [];
    const success = await service.dispatchPersonalSandbox(
      { message: '帮我写贪吃蛇', userId: 'test_user' } as any,
      (evt) => emittedEvents.push(evt),
      'test_user'
    );

    expect(success).toBe(true);

    // 1. Verify THOUGHT events were emitted
    const thoughtEvents = emittedEvents.filter((e) => e.type === StreamEventType.THOUGHT);
    expect(thoughtEvents.length).toBe(2);
    expect(thoughtEvents[0].content).toBe('正在分析需求...');
    expect(thoughtEvents[1].content).toBe('决定创建index.html');
    expect(thoughtEvents[1].data?.thought).toBe('正在分析需求...决定创建index.html');
    expect(thoughtEvents[1].data?.thoughtLogsSnapshot).toEqual(['正在分析需求...决定创建index.html']);
    // 思考事件绝不能带有 isDelta 标志，防止冲刷轮次摘要
    expect(thoughtEvents[0].data?.isDelta).toBeFalsy();
    expect(thoughtEvents[1].data?.isDelta).toBeFalsy();

    // 2. Verify observation preserved
    const roundSummary = emittedEvents.find((e) => e.content?.includes('第 2 轮'));
    expect(roundSummary).toBeDefined();

    // 3. Verify delta has NO <think> tags
    const deltaEvents = emittedEvents.filter((e) => e.data?.isDelta);
    expect(deltaEvents.length).toBe(1);
    expect(deltaEvents[0].content).toBe('已完成文件创建');
    expect(deltaEvents[0].content).not.toContain('<think>');

    // 4. Verify RESULT has clean answer and thoughtLogsSnapshot in data
    const resultEvent = emittedEvents.find((e) => e.type === StreamEventType.RESULT);
    expect(resultEvent).toBeDefined();
    expect(resultEvent.content).toBe('已完成文件创建');
    expect(resultEvent.content).not.toContain('<think>');
    expect(resultEvent.data?.thoughtLogsSnapshot).toEqual(['正在分析需求...决定创建index.html']);
  });

  it('should reset deltaAccumulator when receiving delta_reset event', async () => {
    global.fetch = jest.fn().mockImplementation(async () => {
      return createMockSseResponse([
        'event: delta\ndata: {"content":"旧的错误"}\n\n',
        'event: delta_reset\ndata: {}\n\n',
        'event: delta\ndata: {"content":"新的正确"}\n\n',
        'event: done\ndata: {"success":true,"output":"<<<DSH_FINAL_OUTPUT>>>新的正确","containerName":"ops-test","durationMs":50,"exitCode":0}\n\n',
      ]);
    });

    const emittedEvents: any[] = [];
    const success = await service.dispatchPersonalSandbox(
      { message: '你好', userId: 'test_user', modelId: 'uuid-1234' } as any,
      (evt) => emittedEvents.push(evt),
      'test_user'
    );

    expect(success).toBe(true);
    const deltaEvents = emittedEvents.filter((e) => e.data?.isDelta);
    expect(deltaEvents.length).toBe(2);
    expect(deltaEvents[0].content).toBe('旧的错误');
    expect(deltaEvents[1].content).toBe('新的正确');
  });

  it('should NOT swallow SSE error events or fabricate fake success', async () => {
    global.fetch = jest.fn().mockImplementation(async () => {
      return createMockSseResponse([
        'event: observation\ndata: {"content":"⚡ 正在启动..."}\n\n',
        'event: error\ndata: {"message":"Sandbox model execution error: aborted"}\n\n',
      ]);
    });

    const emittedEvents: any[] = [];
    const success = await service.dispatchPersonalSandbox(
      { message: '测试异常', userId: 'test_user' } as any,
      (evt) => emittedEvents.push(evt),
      'test_user'
    );

    // Must return false so caller can gracefully fallback to direct streamChat
    expect(success).toBe(false);

    // Must NOT emit fake success
    const resultEvent = emittedEvents.find((e) => e.type === StreamEventType.RESULT);
    expect(resultEvent).toBeUndefined();

    // Must emit observation with the actual error reason
    const fallbackObs = emittedEvents.find((e) => e.content?.includes('Sandbox model execution error: aborted'));
    expect(fallbackObs).toBeDefined();
  });

  it('returns a friendly retryable timeout for artifact generation instead of raw aborted', async () => {
    global.fetch = jest.fn().mockImplementation(async () => {
      return createMockSseResponse([
        'event: done\ndata: {"success":false,"output":"Sandbox model execution error: aborted","exitCode":1}\n\n',
      ]);
    });

    const emittedEvents: any[] = [];
    const handled = await service.dispatchPersonalSandbox(
      { message: '生成贪吃蛇的网页游戏', userId: 'test_user', modelId: 'uuid-1234' } as any,
      (evt) => emittedEvents.push(evt),
      'test_user'
    );

    expect(handled).toBe(true);
    const errorEvent = emittedEvents.find((e) => e.type === StreamEventType.ERROR);
    expect(errorEvent?.content).toContain('响应超时或连接中断');
    expect(errorEvent?.content).toContain('本次未生成可用文件');
    expect(errorEvent?.data).toEqual({
      code: 'SANDBOX_GENERATION_TIMEOUT',
      retryable: true,
      artifactCreated: false,
    });
    expect(errorEvent?.content).not.toContain('Sandbox model execution error: aborted');
  });

  it('returns a friendly retryable timeout for incremental modification (e.g. 追加音效和道具) instead of falling back to raw chat', async () => {
    global.fetch = jest.fn().mockImplementation(async () => {
      return createMockSseResponse([
        'event: observation\ndata: {"content":"⚡ [Harness Tool Call] 正在调用工具: read_file({\'file_path\': \'/workspace/index.html\'})..."}\n\n',
        'event: done\ndata: {"success":false,"output":"❌ [DeepSeek Harness 超时]: 模型响应超时或连接中断，本次任务未完成且未生成可用产物。请重试。","exitCode":1}\n\n',
      ]);
    });

    const emittedEvents: any[] = [];
    const handled = await service.dispatchPersonalSandbox(
      { message: '追加音效和道具', userId: 'test_user', modelId: 'uuid-1234', sessionId: 'session-snake' } as any,
      (evt) => emittedEvents.push(evt),
      'test_user'
    );

    expect(handled).toBe(true);
    const errorEvent = emittedEvents.find((e) => e.type === StreamEventType.ERROR);
    expect(errorEvent).toBeDefined();
    expect(errorEvent?.data?.code).toBe('SANDBOX_GENERATION_TIMEOUT');
    expect(errorEvent?.data?.retryable).toBe(true);
    expect(errorEvent?.content).toContain('响应超时');
    expect(errorEvent?.content).toContain('重试继续执行');
    expect(mockConversationService.persistConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-snake',
        userContent: '追加音效和道具',
      })
    );
  });

  it('inherits artifact execution mode for a regenerate follow-up and persists friendly failure', async () => {
    (mockConversationService.getChatHistory as jest.Mock).mockResolvedValue([
      { role: 'user', content: '生成一页的html报告' },
      { role: 'assistant', content: '上一次生成未完成' },
    ]);
    let capturedPayload: any;
    global.fetch = jest.fn().mockImplementation(async (_url: string, init: any) => {
      capturedPayload = JSON.parse(init.body);
      return createMockSseResponse([
        'event: done\ndata: {"success":false,"output":"Sandbox model execution error: aborted","exitCode":1}\n\n',
      ]);
    });

    const emittedEvents: any[] = [];
    const handled = await service.dispatchPersonalSandbox(
      {
        message: '重新生成',
        userId: 'test_user',
        modelId: 'uuid-1234',
        sessionId: 'session-html',
        config: { reasoningEffort: 'medium' },
      } as any,
      (evt) => emittedEvents.push(evt),
      'test_user'
    );

    expect(handled).toBe(true);
    expect(capturedPayload.thinking).toBe(false);
    expect(capturedPayload.reasoningEffort).toBeUndefined();
    expect(emittedEvents.find((e) => e.type === StreamEventType.ERROR)?.data?.code)
      .toBe('SANDBOX_GENERATION_TIMEOUT');
    expect(emittedEvents.find((e) => e.type === StreamEventType.ERROR)?.content)
      .toContain('深度思考已关闭');
    expect(mockConversationService.persistConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-html',
        userContent: '重新生成',
        assistantContent: expect.stringContaining('本次未生成可用文件'),
      })
    );
  });

  it('forwards thinking=true when explicitly requested by user on artifact generation', async () => {
    let capturedPayload: any;
    global.fetch = jest.fn().mockImplementation(async (_url: string, init: any) => {
      capturedPayload = JSON.parse(init.body);
      return createMockSseResponse([
        'event: delta\ndata: {"content":"ok"}\n\n',
        'event: done\ndata: {"success":true,"output":"ok","exitCode":0}\n\n',
      ]);
    });

    const emittedEvents: any[] = [];
    const handled = await service.dispatchPersonalSandbox(
      {
        message: '生成一页的html报告',
        userId: 'test_user',
        modelId: 'uuid-1234',
        config: { thinking: true, reasoningEffort: 'high' },
      } as any,
      (evt) => emittedEvents.push(evt),
      'test_user'
    );

    expect(handled).toBe(true);
    expect(capturedPayload.thinking).toBe(true);
    expect(capturedPayload.reasoningEffort).toBe('high');
  });

  it('does not discard retrieved evidence by falling back to ungrounded chat after search synthesis failure', async () => {
    global.fetch = jest.fn().mockImplementation(async () => {
      return createMockSseResponse([
        'event: observation\ndata: {"content":"✓ 实时数据检索成功，已注入分析上下文。"}\n\n',
        'event: done\ndata: {"success":false,"output":"Sandbox model execution error: timeout of 30000ms exceeded","exitCode":1}\n\n',
      ]);
    });

    const emittedEvents: any[] = [];
    const handled = await service.dispatchPersonalSandbox(
      { message: '查看 DeepSeek Harness 最新的插件', userId: 'test_user', modelId: 'uuid-1234' } as any,
      (evt) => emittedEvents.push(evt),
      'test_user'
    );

    expect(handled).toBe(true);
    const errorEvent = emittedEvents.find((e) => e.type === StreamEventType.ERROR);
    expect(errorEvent?.data).toEqual({
      code: 'SANDBOX_SEARCH_SYNTHESIS_TIMEOUT',
      retryable: true,
      searchCompleted: true,
    });
    expect(errorEvent?.content).toContain('停止无依据的普通聊天降级');
  });

  it('returns a friendly search-stage error for an installation guide lookup', async () => {
    global.fetch = jest.fn().mockImplementation(async () => {
      return createMockSseResponse([
        'event: observation\ndata: {"content":"✓ 实时数据检索成功，已注入分析上下文。"}\n\n',
        'event: done\ndata: {"success":false,"output":"Sandbox model execution error: aborted","exitCode":1}\n\n',
      ]);
    });

    const emittedEvents: any[] = [];
    const handled = await service.dispatchPersonalSandbox(
      { message: '查看 pi agent的安装方法', userId: 'test_user', modelId: 'uuid-1234' } as any,
      (evt) => emittedEvents.push(evt),
      'test_user'
    );

    expect(handled).toBe(true);
    const errorEvent = emittedEvents.find((e) => e.type === StreamEventType.ERROR);
    expect(errorEvent?.data?.code).toBe('SANDBOX_SEARCH_SYNTHESIS_TIMEOUT');
    expect(errorEvent?.content).toContain('联网检索已经完成');
  });

  it('should fail and fallback when SSE ends prematurely without done event', async () => {
    global.fetch = jest.fn().mockImplementation(async () => {
      return createMockSseResponse([
        'event: observation\ndata: {"content":"⚡ 正在启动..."}\n\n',
        // Stream closes without done event
      ]);
    });

    const emittedEvents: any[] = [];
    const success = await service.dispatchPersonalSandbox(
      { message: '测试断流', userId: 'test_user' } as any,
      (evt) => emittedEvents.push(evt),
      'test_user'
    );

    expect(success).toBe(false);
    const resultEvent = emittedEvents.find((e) => e.type === StreamEventType.RESULT);
    expect(resultEvent).toBeUndefined();
    const fallbackObs = emittedEvents.find((e) => e.content?.includes('ended unexpectedly without completion'));
    expect(fallbackObs).toBeDefined();
  });

  it('should fail and fallback when done event indicates exitCode != 0', async () => {
    global.fetch = jest.fn().mockImplementation(async () => {
      return createMockSseResponse([
        'event: done\ndata: {"success":false,"output":"Memory limit exceeded","containerName":"ops-test","durationMs":100,"exitCode":137}\n\n',
      ]);
    });

    const emittedEvents: any[] = [];
    const success = await service.dispatchPersonalSandbox(
      { message: '测试崩溃', userId: 'test_user' } as any,
      (evt) => emittedEvents.push(evt),
      'test_user'
    );

    expect(success).toBe(false);
    const resultEvent = emittedEvents.find((e) => e.type === StreamEventType.RESULT);
    expect(resultEvent).toBeUndefined();
  });

  it('should embed office document deliverables and download cards into result', async () => {
    jest.spyOn(service, 'getWorkspaceFilePath').mockImplementation((uid, fname) => {
      if (fname === '保密合同_审查意见书.docx') {
        return '/mock/path/保密合同_审查意见书.docx';
      }
      return null;
    });

    jest.spyOn(fs, 'existsSync').mockImplementation((p: any) => {
      return String(p).includes('保密合同_审查意见书.docx');
    });
    jest.spyOn(fs, 'statSync').mockReturnValue({ size: 38917 } as any);

    global.fetch = jest.fn().mockImplementation(async () => {
      return createMockSseResponse([
        'event: done\ndata: {"success":true,"output":"<<<DSH_OUTBOUND_FILE:{\\"filePath\\":\\"/workspace/保密合同_审查意见书.docx\\",\\"fileName\\":\\"保密合同_审查意见书.docx\\"}>>>\\n<<<DSH_FINAL_OUTPUT>>>我已将《保密合同_审查意见书.docx》发送至您的聊天界面，请查收。","containerName":"ops-test","durationMs":100,"exitCode":0}\n\n',
      ]);
    });

    const emittedEvents: any[] = [];
    const success = await service.dispatchPersonalSandbox(
      { message: '审查合同，并且给出批注', userId: 'test_user' } as any,
      (evt) => emittedEvents.push(evt),
      'test_user'
    );

    expect(success).toBe(true);
    const resultEvent = emittedEvents.find((e) => e.type === StreamEventType.RESULT);
    expect(resultEvent).toBeDefined();
    expect(resultEvent.content).toContain('生成产物已就绪');
    expect(resultEvent.content).toContain('[《保密合同_审查意见书.docx》](/api/ai/chat/workspace-files/test_user/%E4%BF%9D%E5%AF%86%E5%90%88%E5%90%8C_%E5%AE%A1%E6%9F%A5%E6%84%8F%E8%A7%81%E4%B9%A6.docx)');
    expect(resultEvent.content).toContain('点击直接下载 · 38.0 KB');
  });

  it('should embed generated Markdown deliverables as download cards', async () => {
    jest.spyOn(service, 'getWorkspaceFilePath').mockImplementation((uid, fname) => {
      return fname === 'ai-daily-news-20260926.md'
        ? '/mock/path/ai-daily-news-20260926.md'
        : null;
    });
    jest.spyOn(fs, 'existsSync').mockImplementation((p: any) => {
      return String(p).includes('ai-daily-news-20260926.md');
    });
    jest.spyOn(fs, 'statSync').mockReturnValue({ size: 2142 } as any);

    global.fetch = jest.fn().mockImplementation(async () => {
      return createMockSseResponse([
        'event: done\ndata: {"success":true,"output":"<<<DSH_OUTBOUND_FILE:{\\"filePath\\":\\"/workspace/ai-daily-news-20260926.md\\",\\"fileName\\":\\"ai-daily-news-20260926.md\\"}>>>\\n<<<DSH_FINAL_OUTPUT>>>已生成 **ai-daily-news-20260926.md**，请下载查看。","containerName":"ops-test","durationMs":100,"exitCode":0}\n\n',
      ]);
    });

    const emittedEvents: any[] = [];
    const success = await service.dispatchPersonalSandbox(
      { message: '获取最新 AI 新闻，总结，输出 md 文件', userId: 'test_user' } as any,
      (evt) => emittedEvents.push(evt),
      'test_user'
    );

    expect(success).toBe(true);
    const resultEvent = emittedEvents.find((e) => e.type === StreamEventType.RESULT);
    expect(resultEvent.content).toContain('生成产物已就绪');
    expect(resultEvent.content).toContain('ai-daily-news-20260926.md');
    expect(resultEvent.content).toContain('点击直接下载 · 2.1 KB');
    expect(resultEvent.content).toContain('/api/ai/chat/workspace-files/test_user/ai-daily-news-20260926.md');
  });

  it('should NEVER include uploaded session input files in deliverable download cards', async () => {
    jest.spyOn(service, 'getWorkspaceFilePath').mockImplementation((uid, fname) => {
      if (fname === '保密合同.docx') {
        return '/mock/path/保密合同.docx';
      }
      return null;
    });

    jest.spyOn(fs, 'existsSync').mockImplementation((p: any) => {
      return String(p).includes('保密合同.docx');
    });
    jest.spyOn(fs, 'statSync').mockReturnValue({ size: 23347 } as any);

    global.fetch = jest.fn().mockImplementation(async () => {
      return createMockSseResponse([
        'event: done\ndata: {"success":true,"output":"<<<DSH_FINAL_OUTPUT>>>我对《保密合同.docx》进行审查，提出了若干建议。","containerName":"ops-test","durationMs":100,"exitCode":0}\n\n',
      ]);
    });

    const emittedEvents: any[] = [];
    const success = await service.dispatchPersonalSandbox(
      { message: '审查这个合同', userId: 'test_user', files: ['/workspace/保密合同.docx'] } as any,
      (evt) => emittedEvents.push(evt),
      'test_user'
    );

    expect(success).toBe(true);
    const resultEvent = emittedEvents.find((e) => e.type === StreamEventType.RESULT);
    expect(resultEvent).toBeDefined();
    expect(resultEvent.content).not.toContain('生成产物已就绪');
    expect(resultEvent.content).not.toContain('点击直接下载');
  });

  it('should filter out unmentioned temporary test files (like test.pdf) from deliverable cards', async () => {
    jest.spyOn(service, 'getWorkspaceFilePath').mockImplementation((uid, fname) => {
      if (fname === 'test.pdf') return '/mock/path/test.pdf';
      if (fname === '东大方餐饮门店数字化服务巡检分析报告.pdf') {
        return '/mock/path/东大方餐饮门店数字化服务巡检分析报告.pdf';
      }
      return null;
    });

    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'statSync').mockReturnValue({ size: 92765 } as any);

    global.fetch = jest.fn().mockImplementation(async () => {
      return createMockSseResponse([
        'event: done\ndata: {"success":true,"output":"<<<DSH_OUTBOUND_FILE:{\\"filePath\\":\\"/workspace/test.pdf\\",\\"fileName\\":\\"test.pdf\\"}>>>\\n<<<DSH_OUTBOUND_FILE:{\\"filePath\\":\\"/workspace/东大方餐饮门店数字化服务巡检分析报告.pdf\\",\\"fileName\\":\\"东大方餐饮门店数字化服务巡检分析报告.pdf\\"}>>>\\n<<<DSH_FINAL_OUTPUT>>>已为您生成了专业规范的《东大方餐饮门店数字化服务巡检分析报告.pdf》，请查收。","containerName":"ops-test","durationMs":100,"exitCode":0}\n\n',
      ]);
    });

    const emittedEvents: any[] = [];
    const success = await service.dispatchPersonalSandbox(
      { message: '生成pdf报表', userId: 'test_user' } as any,
      (evt) => emittedEvents.push(evt),
      'test_user'
    );

    expect(success).toBe(true);
    const resultEvent = emittedEvents.find((e) => e.type === StreamEventType.RESULT);
    expect(resultEvent).toBeDefined();
    expect(resultEvent.content).toContain('生成产物已就绪');
    expect(resultEvent.content).toContain('东大方餐饮门店数字化服务巡检分析报告.pdf');
    // 关键断言：test.pdf 必须被过滤掉，不能出现在交付卡片中
    expect(resultEvent.content).not.toContain('test.pdf');
  });

  it('should NOT treat historical or example files mentioned in environment diagnostics as deliverables', async () => {
    jest.spyOn(service, 'getWorkspaceFilePath').mockImplementation((uid, fname) => {
      if (fname === '2026年度财务收支与现金流统计报表.xlsx') {
        return '/mock/path/2026年度财务收支与现金流统计报表.xlsx';
      }
      return null;
    });

    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    // 模拟文件是昨天修改的历史文件
    const yesterday = Date.now() - 24 * 3600 * 1000;
    jest.spyOn(fs, 'statSync').mockReturnValue({ size: 45678, mtimeMs: yesterday } as any);

    global.fetch = jest.fn().mockImplementation(async () => {
      return createMockSseResponse([
        'event: done\ndata: {"success":true,"output":"<<<DSH_FINAL_OUTPUT>>>【当前沙箱环境配置】\\n最后更新：2026-09-24 (如 2026年度财务收支与现金流统计报表.xlsx)","containerName":"ops-test","durationMs":100,"exitCode":0}\n\n',
      ]);
    });

    const emittedEvents: any[] = [];
    const success = await service.dispatchPersonalSandbox(
      { message: '查看沙箱环境信息', userId: 'test_user' } as any,
      (evt) => emittedEvents.push(evt),
      'test_user'
    );

    expect(success).toBe(true);
    const resultEvent = emittedEvents.find((e) => e.type === StreamEventType.RESULT);
    expect(resultEvent).toBeDefined();
    // 关键断言：绝对不能生成产物就绪卡片
    expect(resultEvent.content).not.toContain('生成产物已就绪');
    expect(resultEvent.content).not.toContain('点击直接下载');
    expect(resultEvent.content).toContain('2026年度财务收支与现金流统计报表.xlsx');
  });

  it('should treat freshly generated files with mtime >= turnStartTime as deliverables', async () => {
    jest.spyOn(service, 'getWorkspaceFilePath').mockImplementation((uid, fname) => {
      if (fname === '本轮新鲜生成的周报.xlsx') {
        return '/mock/path/本轮新鲜生成的周报.xlsx';
      }
      return null;
    });

    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    // 模拟文件是在本轮交互中新生成的（mtime 为当前时间）
    jest.spyOn(fs, 'statSync').mockReturnValue({ size: 54321, mtimeMs: Date.now() + 50 } as any);

    global.fetch = jest.fn().mockImplementation(async () => {
      return createMockSseResponse([
        'event: done\ndata: {"success":true,"output":"<<<DSH_FINAL_OUTPUT>>>我已经完成了数据处理，并生成了《本轮新鲜生成的周报.xlsx》，请查收。","containerName":"ops-test","durationMs":100,"exitCode":0}\n\n',
      ]);
    });

    const emittedEvents: any[] = [];
    const success = await service.dispatchPersonalSandbox(
      { message: '生成本周周报', userId: 'test_user' } as any,
      (evt) => emittedEvents.push(evt),
      'test_user'
    );

    expect(success).toBe(true);
    const resultEvent = emittedEvents.find((e) => e.type === StreamEventType.RESULT);
    expect(resultEvent).toBeDefined();
    expect(resultEvent.content).toContain('生成产物已就绪');
    expect(resultEvent.content).toContain('本轮新鲜生成的周报.xlsx');
    expect(resultEvent.content).toContain('点击直接下载');
  });

  it('[P1] should correct and replace false reminder success text when control plane rejects persistence', async () => {
    (mockReminderBridge.processSandboxReminders as jest.Mock).mockResolvedValue({
      created: [],
      error: '请选择未来的一次性提醒时间',
      requestedCount: 1,
      cleanOutput: '',
    });

    const fakeSandboxOutput =
      '<<<DSH_REMINDER_CREATE:[{"title": "开会"}]>>>\n✓ 已成功为您创建 1 条提醒日程：\n1. 【开会】时间: 指定时间 (提醒渠道: 站内)\n提醒已成功同步至后台调度系统，到达设定时间将自动为您推送。';

    global.fetch = jest.fn().mockImplementation(async () => {
      return createMockSseResponse([
        `event: done\ndata: {"success":true,"output":${JSON.stringify(fakeSandboxOutput)},"containerName":"ops-test","durationMs":100,"exitCode":0}\n\n`,
      ]);
    });

    const emittedEvents: any[] = [];
    const success = await service.dispatchPersonalSandbox(
      { message: '帮我定个提醒开会', userId: 'test_user' } as any,
      (evt) => emittedEvents.push(evt),
      'test_user'
    );

    expect(success).toBe(true);
    const resultEvent = emittedEvents.find((e) => e.type === StreamEventType.RESULT);
    expect(resultEvent).toBeDefined();
    // 关键断言：绝对不能向用户虚假宣告创建成功，必须修正为失败提示
    expect(resultEvent.content).toContain('【提醒创建失败】后台调度系统未确认落库');
    expect(resultEvent.content).toContain('请选择未来的一次性提醒时间');
    expect(resultEvent.content).not.toContain('✓ 已成功为您创建 1 条提醒日程');
    expect(resultEvent.content).not.toContain('提醒已成功同步至后台调度系统');
  });

  it('[P1] should confirm reminder schedule when control plane successfully creates reminders', async () => {
    (mockReminderBridge.processSandboxReminders as jest.Mock).mockResolvedValue({
      created: [
        {
          id: 'rem_1',
          title: '客户拜访',
          message: '拜访客户',
          nextRunAt: '2026-09-26T14:00:00.000Z',
          sendWechat: true,
        },
      ],
      requestedCount: 1,
      cleanOutput: '',
    });

    const fakeSandboxOutput =
      '<<<DSH_REMINDER_CREATE:[{"title": "客户拜访", "runAt": "2026-09-26T14:00:00+08:00"}]>>>\n已准备提交 1 条提醒日程至系统调度中心：\n1. 【客户拜访】时间: 2026-09-26T14:00:00+08:00 (提醒渠道: 微信+站内)';

    global.fetch = jest.fn().mockImplementation(async () => {
      return createMockSseResponse([
        `event: done\ndata: {"success":true,"output":${JSON.stringify(fakeSandboxOutput)},"containerName":"ops-test","durationMs":100,"exitCode":0}\n\n`,
      ]);
    });

    const emittedEvents: any[] = [];
    const success = await service.dispatchPersonalSandbox(
      { message: '明天下午两点拜访客户', userId: 'test_user' } as any,
      (evt) => emittedEvents.push(evt),
      'test_user'
    );

    expect(success).toBe(true);
    const resultEvent = emittedEvents.find((e) => e.type === StreamEventType.RESULT);
    expect(resultEvent).toBeDefined();
    expect(resultEvent.content).toContain('控制面已确认');
    expect(resultEvent.content).toContain('客户拜访');
    expect(resultEvent.content).toContain('2026-09-26T14:00:00.000Z');
  });

  it('[P2] should parse outbound file markers containing >>> in comments and embed them into deliverable cards', async () => {
    jest.spyOn(service, 'getWorkspaceFilePath').mockImplementation((uid, fname) => {
      if (fname === 'diag.png') {
        return '/mock/path/diag.png';
      }
      return null;
    });

    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'statSync').mockReturnValue({ size: 12345, mtimeMs: Date.now() + 50 } as any);

    const comment = '系统拓扑: 客户端 >>> 反向代理 >>> 微服务集群';
    const markerPayload = JSON.stringify({
      filePath: '/workspace/diag.png',
      fileName: 'diag.png',
      comment,
    });
    const fakeOutput = `<<<DSH_OUTBOUND_FILE:len=${markerPayload.length}:${markerPayload}>>>\n<<<DSH_FINAL_OUTPUT>>>拓扑分析已完成，请查看架构图。`;

    global.fetch = jest.fn().mockImplementation(async () => {
      return createMockSseResponse([
        `event: done\ndata: {"success":true,"output":${JSON.stringify(fakeOutput)},"containerName":"ops-test","durationMs":100,"exitCode":0}\n\n`,
      ]);
    });

    const emittedEvents: any[] = [];
    const success = await service.dispatchPersonalSandbox(
      { message: '分析拓扑架构', userId: 'test_user' } as any,
      (evt) => emittedEvents.push(evt),
      'test_user'
    );

    expect(success).toBe(true);
    const resultEvent = emittedEvents.find((e) => e.type === StreamEventType.RESULT);
    expect(resultEvent).toBeDefined();
    // 成功提取并注入为卡片，且没有被 >>> 截断
    expect(resultEvent.content).toContain('diag.png');
    expect(resultEvent.content).toContain(comment);
    expect(resultEvent.content).toContain('/api/ai/chat/workspace-files/test_user/diag.png');
  });

  it('should forward queuing observation event with isQueued data', async () => {
    global.fetch = jest.fn().mockImplementation(async () => {
      return createMockSseResponse([
        'event: observation\ndata: {"content":"⏳ 任务已排队，等待前序任务完成后自动开始...","data":{"isQueued":true,"waitedMs":500}}\n\n',
        'event: delta\ndata: {"content":"天气晴朗"}\n\n',
        'event: done\ndata: {"success":true,"output":"<<<DSH_FINAL_OUTPUT>>>上海今天天气晴朗","containerName":"ops-test","durationMs":600,"exitCode":0}\n\n',
      ]);
    });

    const emittedEvents: any[] = [];
    const success = await service.dispatchPersonalSandbox(
      { message: '上海的天气', userId: 'test_user' } as any,
      (evt) => emittedEvents.push(evt),
      'test_user'
    );

    expect(success).toBe(true);
    const queueObs = emittedEvents.find((e) => e.content?.includes('任务已排队'));
    expect(queueObs).toBeDefined();
    expect(queueObs.data?.isQueued).toBe(true);
  });

  it('should emit friendly message instead of raw failure on 409 queue timeout', async () => {
    global.fetch = jest.fn().mockImplementation(async () => {
      return {
        ok: false,
        status: 409,
        text: async () => 'Conflict: personal sandbox busy',
        headers: new Headers(),
      };
    });

    const emittedEvents: any[] = [];
    const handled = await service.dispatchPersonalSandbox(
      { message: '上海的天气', userId: 'test_user' } as any,
      (evt) => emittedEvents.push(evt),
      'test_user'
    );

    expect(handled).toBe(true);
    const errorEvt = emittedEvents.find((e) => e.type === StreamEventType.ERROR);
    expect(errorEvt).toBeDefined();
    expect(errorEvt.content).toContain('正在执行前序任务，排队等待超时');
  });

  it('should deliver clean rendered markdown without leaking len= or outer fences when model outputs markdown with emojis', async () => {
    const rawMarkdown = `\`\`\`markdown\n# 2026年9月最新AI行业重大新闻与趋势总结\n\n🚀 一、 阿里千问战略级升级\n\`\`\``;
    // Simulate output from runner: python code-point len
    const pythonLen = Array.from(rawMarkdown).length;
    const fakeHarnessOutput = `<<<DSH_FINAL_OUTPUT:len=${pythonLen}:${rawMarkdown}>>>\n<<<DSH_FINAL_OUTPUT>>>\n${rawMarkdown}`;

    global.fetch = jest.fn().mockImplementation(async () => {
      return createMockSseResponse([
        `event: done\ndata: ${JSON.stringify({
          success: true,
          output: fakeHarnessOutput,
          containerName: 'ops-test',
          durationMs: 800,
          exitCode: 0,
        })}\n\n`,
      ]);
    });

    const emittedEvents: any[] = [];
    const success = await service.dispatchPersonalSandbox(
      { message: '获取最新 AI 新闻，总结，输出 md 文件', userId: 'test_user' } as any,
      (evt) => emittedEvents.push(evt),
      'test_user'
    );

    expect(success).toBe(true);
    const resultEvt = emittedEvents.find((e) => e.type === StreamEventType.RESULT);
    expect(resultEvt).toBeDefined();
    expect(resultEvt.content).not.toContain('len=');
    expect(resultEvt.content).not.toMatch(/^```(?:markdown|md)/i);
    expect(resultEvt.content).toContain('# 2026年9月最新AI行业重大新闻与趋势总结');
    expect(resultEvt.content).toContain('🚀 一、 阿里千问战略级升级');
  });
});
