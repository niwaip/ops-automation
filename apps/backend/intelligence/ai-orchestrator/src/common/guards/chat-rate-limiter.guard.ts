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

export const CHAT_RATE_LIMIT_KEY = 'chat_rate_limit_options';

export interface ChatRateLimitOptions {
  limit: number;
  windowMs: number;
  message?: string;
}

export const ChatRateLimit = (limit: number, windowMs: number = 60000, message?: string) =>
  SetMetadata(CHAT_RATE_LIMIT_KEY, { limit, windowMs, message } as ChatRateLimitOptions);

interface HitRecord {
  timestamps: number[];
}

@Injectable()
export class ChatRateLimiterGuard implements CanActivate {
  private readonly logger = new Logger(ChatRateLimiterGuard.name);
  private readonly hits = new Map<string, HitRecord>();
  private lastCleanup = Date.now();

  constructor(@Optional() private readonly reflector?: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const reflector = this.reflector ?? new Reflector();
    const options = reflector.getAllAndOverride<ChatRateLimitOptions>(CHAT_RATE_LIMIT_KEY, [
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
      this.logger.warn(`Chat rate limit exceeded for [${userId || ip}] on ${req.method} ${req.path}`);
      throw new HttpException(
        options.message || `Rate limit exceeded. Please retry in ${resetInSeconds} seconds.`,
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    record.timestamps.push(now);
    return true;
  }
}
