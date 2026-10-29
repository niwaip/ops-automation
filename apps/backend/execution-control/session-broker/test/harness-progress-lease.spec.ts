import { UserSandboxHarnessService } from '../src/modules/user-sandbox/user-sandbox-harness.service';

describe('long running harness lease', () => {
  it('renews ownership beyond 300 seconds and cleans up on completion', async () => {
    jest.useFakeTimers();
    const lock = { acquireSandboxLock: jest.fn().mockResolvedValue({success: true, token: 'owner'}),
      extendSandboxLock: jest.fn().mockResolvedValue(true), releaseSandboxLock: jest.fn().mockResolvedValue(true) };
    const service = new UserSandboxHarnessService({sanitizeUserId: (v: string) => v} as any, {recordActivity: jest.fn()} as any, lock as any);
    let finish: any;
    const executor = jest.fn<Promise<any>, any[]>(() => new Promise<any>(resolve => { finish = resolve; }));
    try {
      const pending = service.runHarness('user', 'complex task', {sessionId:'session'}, executor);
      await jest.advanceTimersByTimeAsync(660000);
      expect(lock.extendSandboxLock).toHaveBeenCalledWith('user', 'owner', 420);
      expect(lock.extendSandboxLock).toHaveBeenCalledTimes(11);
      expect(executor.mock.calls[0][1]).not.toContain('--timeout');
      expect(executor.mock.calls[0][2].timeoutMs).toBeUndefined();
      finish({exitCode:0, stdout:'done', durationMs:660000, containerName:'sandbox'});
      await pending;
      expect(lock.releaseSandboxLock).toHaveBeenCalledWith('user','owner');
      await jest.advanceTimersByTimeAsync(60000);
      expect(lock.extendSandboxLock).toHaveBeenCalledTimes(11);
    } finally { jest.useRealTimers(); }
  });
});
