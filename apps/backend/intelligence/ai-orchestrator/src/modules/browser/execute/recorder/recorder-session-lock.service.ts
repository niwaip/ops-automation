import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class RecorderSessionLockService {
  private readonly logger = new Logger(RecorderSessionLockService.name);
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly defaultTimeoutMs = 60_000;

  async acquire<T>(
    key: string,
    action: () => Promise<T>,
    timeoutMs: number = this.defaultTimeoutMs
  ): Promise<T> {
    const prev = this.queues.get(key) || Promise.resolve();

    let release: () => void = () => {};
    const lockWait = new Promise<void>((resolve) => {
      release = resolve;
    });

    const currentTail = prev
      .catch(() => {})
      .then(() => lockWait);
    this.queues.set(key, currentTail);

    await prev.catch(() => {});

    let timer: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(
          new Error(
            `Session execution lock timed out after ${timeoutMs}ms for runtime session: ${key}`
          )
        );
      }, timeoutMs);
    });

    const actionPromise = (async () => {
      try {
        return await action();
      } finally {
        if (timer) {
          clearTimeout(timer);
        }
        release();
        if (this.queues.get(key) === currentTail) {
          this.queues.delete(key);
        }
      }
    })();

    actionPromise.catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Action for session lock ${key} finished in background: ${msg}`);
    });

    return await Promise.race([actionPromise, timeoutPromise]);
  }
}
