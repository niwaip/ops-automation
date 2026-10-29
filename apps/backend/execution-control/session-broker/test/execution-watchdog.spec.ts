import { ExecutionWatchdog } from '../src/modules/user-sandbox/execution-watchdog';

describe('execution watchdog', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  it('lets progressing work continue beyond 300 seconds', () => {
    const expired = jest.fn();
    const watch = new ExecutionWatchdog(expired);
    for (let i = 0; i < 10; i++) {
      jest.advanceTimersByTime(120000);
      watch.observe('<<<DSH_PRO'); watch.observe('GRESS>>>\n');
    }
    expect(expired).not.toHaveBeenCalled();
    watch.stop();
  });
  it('stops inactivity even when arbitrary logs keep arriving', () => {
    const expired = jest.fn();
    const watch = new ExecutionWatchdog(expired);
    for (let i = 0; i < 6; i++) { watch.observe('heartbeat\n'); jest.advanceTimersByTime(60000); }
    expect(expired).toHaveBeenCalledTimes(1);
    watch.stop();
  });
  it('honors explicit total limits despite progress', () => {
    const expired = jest.fn();
    const watch = new ExecutionWatchdog(expired, 300000);
    jest.advanceTimersByTime(250000);
    watch.observe('<<<DSH_PROGRESS>>>\n');
    jest.advanceTimersByTime(50000);
    expect(expired).toHaveBeenCalledTimes(1);
    watch.stop();
  });
  it('cleans up after completion or cancellation', () => {
    const expired = jest.fn();
    const watch = new ExecutionWatchdog(expired);
    watch.stop(); jest.advanceTimersByTime(1000000);
    expect(expired).not.toHaveBeenCalled();
  });
  it('reports inactivity separately from an explicit longer total limit', () => {
    const expired = jest.fn();
    const watch = new ExecutionWatchdog(expired, 900000);
    jest.advanceTimersByTime(360000);
    expect(expired).toHaveBeenCalledWith('idle');
    watch.observe('<<<DSH_PROGRESS>>>\n');
    jest.advanceTimersByTime(900000);
    expect(expired).toHaveBeenCalledTimes(1);
    watch.stop();
  });

  it('reports explicit total exhaustion and ignores progress after stop', () => {
    const expired = jest.fn();
    const watch = new ExecutionWatchdog(expired, 1000);
    jest.advanceTimersByTime(1000);
    expect(expired).toHaveBeenCalledWith('total');
    watch.observe('<<<DSH_PROGRESS>>>\n');
    jest.advanceTimersByTime(360000);
    expect(expired).toHaveBeenCalledTimes(1);
    watch.stop();
  });

});
