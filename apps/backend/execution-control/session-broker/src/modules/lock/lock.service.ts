import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from './redis.service';
import { v4 as uuidv4 } from 'uuid';

// Lock TTL: 7200 seconds (2 hours)
const LOCK_TTL_SECONDS = 7200;

// Lua script for safe lock release
const SAFE_RELEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
else
    return 0
end
`;

// Lua script for safe lock extension
const SAFE_EXTEND_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('EXPIRE', KEYS[1], ARGV[2])
else
    return 0
end
`;

export interface LockAcquireResult {
  success: boolean;
  session_id: string;
  lock_key: string;
}

@Injectable()
export class LockService {
  private readonly logger = new Logger(LockService.name);

  constructor(private readonly redisService: RedisService) {}

  /**
   * Acquire profile write lock for a user
   * Key pattern: lock:profile:{user_id}
   * Returns 409 if lock already held by another session
   */
  async acquireProfileLock(userId: string, sessionId?: string): Promise<LockAcquireResult> {
    const lockKey = `lock:profile:${userId}`;
    const sid = sessionId || uuidv4();

    // SET with NX (only if not exists) and EX (expiration)
    const result = await this.redisService.set(lockKey, sid, LOCK_TTL_SECONDS);

    if (result === 'OK') {
      this.logger.log(`Lock acquired: user=${userId}, session=${sid}`);
      return {
        success: true,
        session_id: sid,
        lock_key: lockKey,
      };
    }

    // Lock already held - check who holds it
    const currentHolder = await this.redisService.get(lockKey);
    this.logger.warn(`Lock conflict: user=${userId}, held by session=${currentHolder}`);
    return {
      success: false,
      session_id: sid,
      lock_key: lockKey,
    };
  }

  /**
   * Release profile write lock (safe - only release if owned by this session)
   */
  async releaseProfileLock(userId: string, sessionId: string): Promise<boolean> {
    const lockKey = `lock:profile:${userId}`;

    // Use Lua script for safe release
    const result = await this.redisService.eval(SAFE_RELEASE_SCRIPT, [lockKey], [sessionId]);

    if (result === 1) {
      this.logger.log(`Lock released: user=${userId}, session=${sessionId}`);
      return true;
    }

    this.logger.warn(`Lock not released (not owned): user=${userId}, session=${sessionId}`);
    return false;
  }

  /**
   * Check if profile lock is held by a specific session
   */
  async checkProfileLock(userId: string, sessionId?: string): Promise<string | null> {
    const lockKey = `lock:profile:${userId}`;
    const holder = await this.redisService.get(lockKey);

    if (sessionId && holder === sessionId) {
      return sessionId;
    }

    return holder;
  }

  /**
   * Extend profile lock TTL (safe - only extend if owned by this session)
   */
  async extendProfileLock(userId: string, sessionId: string): Promise<boolean> {
    const lockKey = `lock:profile:${userId}`;

    const result = await this.redisService.eval(
      SAFE_EXTEND_SCRIPT,
      [lockKey],
      [sessionId, String(LOCK_TTL_SECONDS)]
    );

    if (result === 1) {
      this.logger.log(`Lock extended: user=${userId}, session=${sessionId}`);
      return true;
    }

    this.logger.warn(`Lock not extended (not owned): user=${userId}, session=${sessionId}`);
    return false;
  }

  /**
   * Get TTL remaining on a lock
   */
  async getLockTTL(userId: string): Promise<number> {
    const lockKey = `lock:profile:${userId}`;
    return this.redisService.ttl(lockKey);
  }

  /**
   * Acquire execution lock for user personal sandbox to prevent concurrent overlapping dsh executions.
   * Supports retry spinning with waitTimeoutSeconds and onWaiting callback.
   */
  async acquireSandboxLock(
    userId: string,
    ttlSeconds: number = 180,
    waitTimeoutSeconds: number = 35,
    onWaiting?: (waitedMs: number) => void
  ): Promise<{ success: boolean; token: string; waitedMs?: number }> {
    const canonicalUserId = (userId || '').trim().toLowerCase();
    const lockKey = `lock:sandbox:exec:${canonicalUserId}`;
    const token = uuidv4();
    const startTime = Date.now();
    const maxWaitMs = Math.max(0, waitTimeoutSeconds * 1000);
    const pollIntervalMs = 500;
    let hasNotifiedWaiting = false;

    for (;;) {
      const result = await this.redisService.set(lockKey, token, ttlSeconds);
      if (result === 'OK') {
        const waitedMs = Date.now() - startTime;
        this.logger.log(
          `Sandbox execution lock acquired for user [${canonicalUserId}], token=${token}, waitedMs=${waitedMs}`
        );
        return { success: true, token, waitedMs };
      }

      const elapsed = Date.now() - startTime;
      if (elapsed >= maxWaitMs) {
        this.logger.warn(
          `Sandbox execution lock conflict/timeout for user [${canonicalUserId}] after waiting ${elapsed}ms`
        );
        return { success: false, token: '', waitedMs: elapsed };
      }

      if (!hasNotifiedWaiting && onWaiting) {
        hasNotifiedWaiting = true;
        try {
          onWaiting(elapsed);
        } catch {
          // ignore callback error
        }
      }

      const sleepTime = Math.min(pollIntervalMs, maxWaitMs - elapsed);
      await new Promise((resolve) => setTimeout(resolve, sleepTime));
    }
  }

  /**
   * Release sandbox execution lock safely
   */
  async releaseSandboxLock(userId: string, token: string): Promise<boolean> {
    const canonicalUserId = (userId || '').trim().toLowerCase();
    const lockKey = `lock:sandbox:exec:${canonicalUserId}`;
    const result = await this.redisService.eval(SAFE_RELEASE_SCRIPT, [lockKey], [token]);
    const released = result === 1;
    if (released) {
      this.logger.log(`Sandbox execution lock released for user [${canonicalUserId}]`);
    }
    return released;
  }

  /**
   * Forcibly release sandbox execution lock regardless of token (e.g. on task cancellation, stop or timeout)
   */
  async forceReleaseSandboxLock(userId: string): Promise<boolean> {
    const canonicalUserId = (userId || '').trim().toLowerCase();
    const lockKey = `lock:sandbox:exec:${canonicalUserId}`;
    const result = await this.redisService.del(lockKey);
    const released = result > 0;
    if (released) {
      this.logger.log(`Sandbox execution lock forcibly released for user [${canonicalUserId}]`);
    }
    return released;
  }
}
