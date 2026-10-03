import { RecorderSessionLockService } from './recorder-session-lock.service';

describe('RecorderSessionLockService', () => {
  let lockService: RecorderSessionLockService;

  beforeEach(() => {
    lockService = new RecorderSessionLockService();
  });

  it('executes actions serially for the same session key', async () => {
    const events: string[] = [];

    const task1 = lockService.acquire('session-1', async () => {
      events.push('task1-start');
      await new Promise((resolve) => setTimeout(resolve, 50));
      events.push('task1-end');
      return 'task1-result';
    });

    const task2 = lockService.acquire('session-1', async () => {
      events.push('task2-start');
      events.push('task2-end');
      return 'task2-result';
    });

    const [res1, res2] = await Promise.all([task1, task2]);

    expect(res1).toBe('task1-result');
    expect(res2).toBe('task2-result');
    expect(events).toEqual(['task1-start', 'task1-end', 'task2-start', 'task2-end']);
  });

  it('executes actions in parallel for different session keys', async () => {
    const events: string[] = [];

    const task1 = lockService.acquire('session-1', async () => {
      events.push('session1-start');
      await new Promise((resolve) => setTimeout(resolve, 50));
      events.push('session1-end');
      return 'res1';
    });

    const task2 = lockService.acquire('session-2', async () => {
      events.push('session2-start');
      events.push('session2-end');
      return 'res2';
    });

    const [res1, res2] = await Promise.all([task1, task2]);

    expect(res1).toBe('res1');
    expect(res2).toBe('res2');
    // session2 can start before session1 ends because keys differ
    expect(events.indexOf('session2-start')).toBeLessThan(events.indexOf('session1-end'));
  });

  it('unblocks subsequent actions even if previous action throws an error', async () => {
    const events: string[] = [];

    const task1 = lockService.acquire('session-err', async () => {
      events.push('task1-start');
      throw new Error('Task 1 failed');
    });

    const task2 = lockService.acquire('session-err', async () => {
      events.push('task2-start');
      return 'ok';
    });

    await expect(task1).rejects.toThrow('Task 1 failed');
    const res2 = await task2;
    expect(res2).toBe('ok');
    expect(events).toEqual(['task1-start', 'task2-start']);
  });

  it('times out when action exceeds timeoutMs', async () => {
    await expect(
      lockService.acquire(
        'session-timeout',
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 200));
          return 'done';
        },
        50
      )
    ).rejects.toThrow(/Session execution lock timed out after 50ms/);
  });

  it('keeps lock until slow action completes so next task does not overlap after timeout', async () => {
    const events: string[] = [];
    const slowTask = lockService.acquire(
      'session-overlap',
      async () => {
        events.push('slow-start');
        await new Promise((resolve) => setTimeout(resolve, 100));
        events.push('slow-end');
        return 'slow';
      },
      30
    );

    await expect(slowTask).rejects.toThrow(/Session execution lock timed out after 30ms/);

    const nextTask = lockService.acquire('session-overlap', async () => {
      events.push('next-start');
      return 'next';
    });

    const nextRes = await nextTask;
    expect(nextRes).toBe('next');
    // next-start MUST occur after slow-end!
    expect(events).toEqual(['slow-start', 'slow-end', 'next-start']);
  });
});
