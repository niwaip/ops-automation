export interface RuntimeRetrySchedule {
  attempt: number;
  delayMs: number;
}

type RetryState = RuntimeRetrySchedule & { timer?: NodeJS.Timeout };

/**
 * Deduplicates reconnect timers and keeps exponential backoff state per channel connection.
 */
export class RuntimeRetryScheduler {
  private readonly states = new Map<string, RetryState>();

  constructor(
    private readonly baseDelayMs = 2_000,
    private readonly maxDelayMs = 60_000
  ) {}

  schedule(connectionId: string, reconnect: () => Promise<void> | void): RuntimeRetrySchedule {
    const current = this.states.get(connectionId);
    if (current?.timer) return { attempt: current.attempt, delayMs: current.delayMs };

    const attempt = (current?.attempt ?? 0) + 1;
    const delayMs = Math.min(this.maxDelayMs, this.baseDelayMs * 2 ** (attempt - 1));
    const state: RetryState = { attempt, delayMs };
    const timer = setTimeout(() => {
      if (this.states.get(connectionId)?.timer === timer) state.timer = undefined;
      void Promise.resolve().then(reconnect).catch(() => undefined);
    }, delayMs);
    state.timer = timer;
    this.states.set(connectionId, state);
    return { attempt, delayMs };
  }

  reset(connectionId: string): void {
    const state = this.states.get(connectionId);
    if (state?.timer) clearTimeout(state.timer);
    this.states.delete(connectionId);
  }

  resetAll(): void {
    for (const connectionId of this.states.keys()) this.reset(connectionId);
  }
}
