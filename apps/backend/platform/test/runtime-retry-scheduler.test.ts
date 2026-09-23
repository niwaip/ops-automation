import { RuntimeRetryScheduler } from '@ops/im-gateway';

describe('RuntimeRetryScheduler', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('deduplicates pending reconnects and increases the delay after each failed run', async () => {
    const scheduler = new RuntimeRetryScheduler(100, 1_000);
    const reconnect = jest.fn();

    expect(scheduler.schedule('connection-1', reconnect)).toEqual({
      attempt: 1,
      delayMs: 100,
    });
    expect(scheduler.schedule('connection-1', reconnect)).toEqual(
      expect.objectContaining({ attempt: 1, delayMs: 100 })
    );

    await jest.advanceTimersByTimeAsync(100);
    expect(reconnect).toHaveBeenCalledTimes(1);

    expect(scheduler.schedule('connection-1', reconnect)).toEqual({
      attempt: 2,
      delayMs: 200,
    });
    await jest.advanceTimersByTimeAsync(200);
    expect(reconnect).toHaveBeenCalledTimes(2);

    scheduler.reset('connection-1');
    expect(scheduler.schedule('connection-1', reconnect)).toEqual({
      attempt: 1,
      delayMs: 100,
    });
    scheduler.resetAll();
    await jest.advanceTimersByTimeAsync(100);
    expect(reconnect).toHaveBeenCalledTimes(2);
  });
});
