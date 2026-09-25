import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { randomBytes, randomUUID } from 'crypto';

export const TRACE_ID_HEADER = 'x-trace-id';
export const TRACEPARENT_HEADER = 'traceparent';
export const TRACESTATE_HEADER = 'tracestate';

const TRACEPARENT_REGEX = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i;

export function isValidTraceparent(header?: string): boolean {
  if (!header || typeof header !== 'string') return false;
  const match = header.trim().match(TRACEPARENT_REGEX);
  if (!match) return false;
  const [, version, traceId, parentId] = match;
  if (version === 'ff') return false;
  if (/^0+$/.test(traceId) || /^0+$/.test(parentId)) return false;
  return true;
}

export function createChildTraceparent(parentHeader: string): string {
  if (!isValidTraceparent(parentHeader)) return parentHeader;
  const match = parentHeader.trim().match(TRACEPARENT_REGEX)!;
  const [, version, traceId, , flags] = match;
  const newSpanId = randomBytes(8).toString('hex');
  return `${version.toLowerCase()}-${traceId.toLowerCase()}-${newSpanId}-${flags.toLowerCase()}`;
}

export function parseTraceparent(traceparent?: string): string | undefined {
  if (!traceparent) return undefined;
  if (!isValidTraceparent(traceparent)) return undefined;
  const parts = traceparent.trim().split('-');
  return parts[1];
}

export function generateW3cTraceparent(existingTraceId?: string): string {
  let traceIdHex: string;
  if (existingTraceId) {
    const cleaned = existingTraceId.replace(/-/g, '').toLowerCase();
    if (/^[0-9a-f]{32}$/.test(cleaned) && !/^0+$/.test(cleaned)) {
      traceIdHex = cleaned;
    } else {
      traceIdHex = randomBytes(16).toString('hex');
    }
  } else {
    traceIdHex = randomBytes(16).toString('hex');
  }
  const spanIdHex = randomBytes(8).toString('hex');
  return `00-${traceIdHex}-${spanIdHex}-01`;
}

export function extractTraceId(headers: Record<string, string | string[] | undefined>): string {
  const xTrace = headers[TRACE_ID_HEADER];
  if (typeof xTrace === 'string' && xTrace.trim()) {
    return xTrace.trim();
  }

  const traceparent = headers[TRACEPARENT_HEADER];
  if (typeof traceparent === 'string') {
    const parsed = parseTraceparent(traceparent);
    if (parsed) return parsed;
  }

  return randomUUID();
}

@Injectable()
export class TraceInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TraceInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<any>();
    const res = http.getResponse<any>();

    const headers = req.headers || {};
    const traceId = extractTraceId(headers);
    req.traceId = traceId;

    const incomingTraceparent = headers[TRACEPARENT_HEADER];
    const traceparent =
      typeof incomingTraceparent === 'string' && isValidTraceparent(incomingTraceparent)
        ? createChildTraceparent(incomingTraceparent)
        : generateW3cTraceparent(traceId);

    req.traceparent = traceparent;

    const tracestate =
      typeof headers[TRACESTATE_HEADER] === 'string'
        ? headers[TRACESTATE_HEADER]
        : undefined;

    req.traceContext = {
      traceId,
      traceparent,
      tracestate,
    };

    if (res?.setHeader) {
      res.setHeader(TRACE_ID_HEADER, traceId);
      res.setHeader(TRACEPARENT_HEADER, traceparent);
      if (tracestate) {
        res.setHeader(TRACESTATE_HEADER, tracestate);
      }
    }

    const method = req.method || 'UNKNOWN';
    const url = req.url || '';
    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startedAt;
          this.logger.log(`[${traceId}] ${method} ${url} ${duration}ms`);
        },
        error: (error) => {
          const duration = Date.now() - startedAt;
          const message = error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(`[${traceId}] ${method} ${url} failed after ${duration}ms: ${message}`);
        },
      })
    );
  }
}
