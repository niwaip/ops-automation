import { EventEmitter } from 'node:events';
import { bindProxyCancellation } from './model-proxy-cancellation';
import { ModelProxyController } from './model-proxy.controller';

jest.mock('../../common/guards/ai-auth.guard', () => ({
  parseAndVerifySandboxToken: jest.fn().mockReturnValue('test-user'),
}));

describe('Sandbox model cancellation', () => {
  it('does not confuse completed input or completed output with client cancellation', () => {
    const req = new EventEmitter();
    const res = Object.assign(new EventEmitter(), { writableEnded: false });
    const bound = bindProxyCancellation(req as any, res as any);
    req.emit('close');
    expect(bound.signal.aborted).toBe(false);
    res.writableEnded = true;
    res.emit('close');
    expect(bound.signal.aborted).toBe(false);
    bound.dispose();
    expect(req.listenerCount('aborted')).toBe(0);
    expect(res.listenerCount('close')).toBe(0);
  });

  it.each([true, false])('cancels managed upstream work without retry/fallback (stream=%s)', async stream => {
    const req = new EventEmitter();
    const res = Object.assign(new EventEmitter(), {
      writableEnded: false, setHeader: jest.fn(), write: jest.fn(), end: jest.fn(),
      status: jest.fn().mockReturnThis(), json: jest.fn(),
    });
    let requestStarted!: () => void;
    const started = new Promise<void>(resolve => { requestStarted = resolve; });
    const execute = jest.fn((opts: any) => new Promise((_resolve, reject) => {
      opts.signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
      requestStarted();
    }));
    const client = { chatCompletion: execute, chatCompletionStream: execute };
    const service: any = {
      getClient: jest.fn().mockReturnValue(client), getPreferredDefaultModel: jest.fn(),
      getDefaultModel: jest.fn(), listActiveModelsForRouting: jest.fn().mockReturnValue([]),
    };
    const controller = new ModelProxyController(service);
    jest.spyOn(controller as any, 'resolveUpstreamCredentials').mockResolvedValue({ apiKey: '', baseUrl: '' });
    const fallback = jest.spyOn(controller as any, 'getResilientFallbackClients');
    const pending = controller.chatCompletions('Bearer test', { model: 'default', stream }, req as any, res as any);
    await started;
    res.emit('close');
    await pending;
    expect(execute).toHaveBeenCalledTimes(1);
    expect(fallback).not.toHaveBeenCalled();
    expect(res.write).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
    expect(res.listenerCount('close')).toBe(0);
  });
});
