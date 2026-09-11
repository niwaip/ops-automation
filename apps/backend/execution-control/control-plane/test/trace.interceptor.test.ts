import { of } from 'rxjs';
import {
  TraceInterceptor,
  TRACE_ID_HEADER,
  TRACEPARENT_HEADER,
  extractTraceId,
  parseTraceparent,
} from '../src/common/interceptors/trace.interceptor';

describe('TraceInterceptor & TraceContext', () => {
  it('should parse W3C traceparent correctly', () => {
    const tp = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
    expect(parseTraceparent(tp)).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
  });

  it('should extract x-trace-id when provided', () => {
    const traceId = extractTraceId({ [TRACE_ID_HEADER]: 'custom-trace-123' });
    expect(traceId).toBe('custom-trace-123');
  });

  it('should extract traceparent when x-trace-id is missing', () => {
    const traceId = extractTraceId({
      [TRACEPARENT_HEADER]: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    });
    expect(traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
  });

  it('should generate a valid UUID when no trace headers exist', () => {
    const traceId = extractTraceId({});
    expect(traceId).toBeDefined();
    expect(traceId.length).toBeGreaterThan(10);
  });

  it('should intercept request, assign traceId to req, and set response header', (done) => {
    const interceptor = new TraceInterceptor();
    const req: any = { headers: { 'x-trace-id': 'req-trace-abc' }, method: 'GET', url: '/api/executions' };
    const res: any = {
      headers: {},
      setHeader(k: string, v: string) {
        this.headers[k] = v;
      },
    };
    const context: any = {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
      }),
    };
    const next: any = {
      handle: () => of({ success: true }),
    };

    interceptor.intercept(context, next).subscribe({
      next: (val) => {
        expect(req.traceId).toBe('req-trace-abc');
        expect(res.headers[TRACE_ID_HEADER]).toBe('req-trace-abc');
        expect(val).toEqual({ success: true });
        done();
      },
    });
  });
});
