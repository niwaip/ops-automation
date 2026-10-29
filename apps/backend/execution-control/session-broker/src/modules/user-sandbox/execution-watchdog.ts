/** Total deadlines are opt-in; runtime checkpoints renew the inactivity budget. */
export class ExecutionWatchdog {
  private timer: ReturnType<typeof setTimeout>;
  private buffer = '';
  private stopped = false;
  private readonly startedAt = Date.now();

  constructor(private readonly onTimeout: (reason: 'idle' | 'total') => void,
    private readonly totalMs?: number, private readonly idleMs = 360000) {
    this.timer = this.arm();
  }

  private arm() {
    const remaining = this.totalMs ? this.totalMs - (Date.now() - this.startedAt) : Infinity;
    return setTimeout(() => { this.stopped = true; this.onTimeout(remaining <= this.idleMs ? 'total' : 'idle'); }, Math.max(0, Math.min(this.idleMs, remaining)));
  }

  observe(chunk: string) {
    if (this.stopped) return;
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = (lines.pop() || '').slice(-128);
    if (lines.some(line => line.trim() === '<<<DSH_PROGRESS>>>')) {
      clearTimeout(this.timer);
      this.timer = this.arm();
    }
  }

  stop() { this.stopped = true; clearTimeout(this.timer); }
}
