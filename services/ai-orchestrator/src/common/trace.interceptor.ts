import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { getOrCreateTraceId, TRACE_ID_HEADER } from './trace.util';

@Injectable()
export class TraceInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TraceInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request & { traceId?: string }>();
    const res = http.getResponse<{ setHeader: (key: string, value: string) => void }>();

    const incomingTraceId = (req.headers as unknown as Record<string, string | undefined>)?.[TRACE_ID_HEADER];
    const traceId = getOrCreateTraceId(incomingTraceId);
    req.traceId = traceId;
    res.setHeader(TRACE_ID_HEADER, traceId);

    const method = (req as unknown as { method?: string }).method || 'UNKNOWN';
    const url = (req as unknown as { url?: string }).url || '';
    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          this.logger.log(`[${traceId}] ${method} ${url} ${Date.now() - startedAt}ms`);
        },
        error: (error) => {
          const message = error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(`[${traceId}] ${method} ${url} failed: ${message}`);
        },
      }),
    );
  }
}
