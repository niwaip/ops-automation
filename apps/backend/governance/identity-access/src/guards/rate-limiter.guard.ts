import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  Optional,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const RATE_LIMIT_KEY = 'rate_limit_options';

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
  message?: string;
}

/**
 * Decorator to apply rate limiting to a controller method or class.
 * @param limit Max requests allowed within window
 * @param windowMs Time window in milliseconds (default: 60,000ms / 1 min)
 * @param message Custom message on 429
 */
export const RateLimit = (limit: number, windowMs: number = 60000, message?: string) =>
  SetMetadata(RATE_LIMIT_KEY, { limit, windowMs, message } as RateLimitOptions);

interface HitRecord {
  timestamps: number[];
}

@Injectable()
export class RateLimiterGuard implements CanActivate {
  private readonly logger = new Logger(RateLimiterGuard.name);
  private readonly hits = new Map<string, HitRecord>();
  private lastCleanup = Date.now();

  constructor(@Optional() private readonly reflector?: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const reflector = this.reflector ?? new Reflector();
    const options = reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!options) {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    const ip =
      req.headers['x-forwarded-for']?.toString().split(',')[0].trim() ||
      req.headers['x-real-ip']?.toString().trim() ||
      req.ip ||
      req.connection?.remoteAddress ||
      'unknown';
    const userId = req.user?.id || req.user?.userId;
    const clientKey = `${req.method}:${req.path}:${userId || ip}`;

    const now = Date.now();
    const windowStart = now - options.windowMs;

    // Prune stale records every minute
    if (now - this.lastCleanup > 60000) {
      this.lastCleanup = now;
      for (const [k, rec] of this.hits.entries()) {
        rec.timestamps = rec.timestamps.filter((t) => t > windowStart);
        if (rec.timestamps.length === 0) {
          this.hits.delete(k);
        }
      }
    }

    let record = this.hits.get(clientKey);
    if (!record) {
      record = { timestamps: [] };
      this.hits.set(clientKey, record);
    }

    record.timestamps = record.timestamps.filter((t) => t > windowStart);

    if (record.timestamps.length >= options.limit) {
      const oldestHit = record.timestamps[0];
      const resetInSeconds = Math.max(1, Math.ceil((oldestHit + options.windowMs - now) / 1000));
      if (res && typeof res.setHeader === 'function') {
        res.setHeader('Retry-After', resetInSeconds);
      }
      this.logger.warn(`Rate limit exceeded for client [${userId || ip}] on ${req.method} ${req.path}`);
      throw new HttpException(
        options.message || `Too many requests. Please try again in ${resetInSeconds} seconds.`,
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    record.timestamps.push(now);
    return true;
  }
}
