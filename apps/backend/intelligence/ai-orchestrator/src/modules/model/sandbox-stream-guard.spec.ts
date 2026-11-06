import { SandboxStreamGuard, guardedSandboxStream } from './sandbox-stream-guard';
import { ModelProxyController } from './model-proxy.controller';

jest.mock('../../common/guards/ai-auth.guard', () => ({ parseAndVerifySandboxToken: () => 'test-user' }));
const sentence = '模型应该读取单个参数契约，再调用官方文档搜索工具获取Azure虚拟网络网关的设置方法。';

describe('upstream sandbox stream guard', () => {
  it('aborts a still-open generation before buffered replay, without throwing in callbacks', async () => {
    let cancelled = false;
    const emit = jest.fn();
    const client = { chatCompletionStream: jest.fn((request, callback) => new Promise<void>(resolve => {
      request.signal.addEventListener('abort', () => { cancelled = true; resolve(); });
      for (let i = 0; i < 10; i++) expect(() => callback(sentence)).not.toThrow();
    })) };
    await expect(guardedSandboxStream(client, {}, emit, {}, { buffered: true }))
      .rejects.toMatchObject({ code: 'MODEL_REPETITION', details: { target: 'content', repeatCount: 3 } });
    expect(cancelled).toBe(true);
    expect(emit).toHaveBeenCalledTimes(2);
    expect(client.chatCompletionStream).toHaveBeenCalledTimes(1);
  });

  it('handles thought repetition and ignores tool argument repetition', () => {
    const guard = new SandboxStreamGuard();
    for (let i = 0; i < 10; i++) guard.accept('', { delta: { tool_calls: [{ function: { arguments: sentence } }] } });
    expect(() => guard.accept('', { reasoning_content: sentence.repeat(3) }))
      .toThrow('MODEL_REPETITION');
  });

  it('bounds buffers by both byte size and number of frames', () => {
    expect(() => new SandboxStreamGuard(100).accept('x'.repeat(200))).toThrow('MODEL_STREAM_LIMIT');
    const guard = new SandboxStreamGuard(10000, 2);
    guard.accept(''); guard.accept('');
    expect(() => guard.accept('')).toThrow('MODEL_STREAM_LIMIT');
  });

  it('keeps ordinary lists, code, whitespace and distinct text valid', () => {
    const guard = new SandboxStreamGuard();
    for (const chunk of ['步骤一：创建虚拟网络。', '步骤二：创建网关子网。', '步骤三：创建网关。', '---\n'.repeat(30),
      'for i in range(10):\n    print(i)\n', '最终请检查相应产品、版本与配置。']) guard.accept(chunk);
  });

  it('enforces the MCP generation budget even if upstream never sends a delta', async () => {
    jest.useFakeTimers();
    try {
      let signal: AbortSignal;
      const client = { chatCompletionStream: jest.fn(request => { signal = request.signal; return new Promise(() => {}); }) };
      const promise = guardedSandboxStream(client, {}, jest.fn(), {}, { buffered: true, mcpSelection: true });
      const check = expect(promise).rejects.toMatchObject({ code: 'MODEL_GENERATION_BUDGET' });
      await jest.advanceTimersByTimeAsync(45_000);
      await check;
      expect(signal!.aborted).toBe(true);
    } finally { jest.useRealTimers(); }
  });

  it('sends typed errors through the actual controller without retry, fallback or draft leakage', async () => {
    let signal: AbortSignal;
    const client = { model: 'test-model', chatCompletionStream: jest.fn((request, callback) => {
      signal = request.signal;
      callback(sentence); callback(sentence); callback(sentence);
      return Promise.resolve();
    }) };
    const service: any = {
      getPreferredDefaultModel: () => ({ id: 'default' }), getDefaultModel: () => ({ id: 'default' }),
      getClient: () => client, listModels: () => [], listActiveModelsForRouting: jest.fn(() => []),
    };
    const controller = new ModelProxyController(service);
    (controller as any).resolveUpstreamCredentials = async () => ({});
    const frames: string[] = [];
    const response: any = { setHeader: jest.fn(), write: (s: string) => frames.push(s), end: jest.fn() };
    await controller.chatCompletions('Bearer dummy', {
      model: 'default', stream: true, stream_visibility: 'internal', request_context: 'mcp_tool_selection',
    }, {} as any, response);
    expect(client.chatCompletionStream).toHaveBeenCalledTimes(1);
    expect(signal!.aborted).toBe(true);
    const payload = JSON.parse(frames.find(f => f.startsWith('data: {'))!.slice(6));
    expect(payload.error.code).toBe('MODEL_REPETITION');
    expect(payload.error.details.patternSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(frames.join('')).not.toContain(sentence);
    expect(service.listActiveModelsForRouting).not.toHaveBeenCalled();
    expect(response.end).toHaveBeenCalled();
  });
});
