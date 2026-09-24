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

describe('UserSandboxDispatcherService - SSE Error Handling & Model Display Name', () => {
  let service: UserSandboxDispatcherService;
  let mockConversationService: Partial<ChatConversationService>;
  let mockMediaService: Partial<ChatMediaService>;
  let mockModelService: Partial<ModelService>;
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
      persistConversation: jest.fn().mockResolvedValue({ id: 'sess_1' }),
      buildSessionPatchEvent: jest.fn().mockReturnValue({ type: StreamEventType.SESSION_PATCH, data: {} } as any),
    } as any;
    mockMediaService = {};
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
});
