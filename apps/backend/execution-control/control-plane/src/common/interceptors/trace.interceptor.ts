import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { randomUUID } from 'crypto';

export const TRACE_ID_HEADER = 'x-trace-id';
export const TRACEPARENT_HEADER = 'traceparent';

export function parseTraceparent(traceparent?: string): string | undefined {
  if (!traceparent) return undefined;
  const parts = traceparent.split('-');
  if (parts.length >= 4 && parts[1]) {
    return parts[1];
  }
  return undefined;
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

    const traceId = extractTraceId(req.headers || {});
    req.traceId = traceId;

    if (res?.setHeader) {
      res.setHeader(TRACE_ID_HEADER, traceId);
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
