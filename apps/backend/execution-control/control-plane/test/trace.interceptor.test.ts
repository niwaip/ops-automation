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

  it('should intercept request, assign traceId and traceparent to req, and set response headers', (done) => {
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
        expect(req.traceparent).toBeDefined();
        expect(req.traceparent.startsWith('00-')).toBe(true);
        expect(req.traceContext).toEqual(
          expect.objectContaining({
            traceId: 'req-trace-abc',
            traceparent: req.traceparent,
          })
        );
        expect(res.headers[TRACE_ID_HEADER]).toBe('req-trace-abc');
        expect(res.headers[TRACEPARENT_HEADER]).toBe(req.traceparent);
        expect(val).toEqual({ success: true });
        done();
      },
    });
  });

  describe('W3C Traceparent validation & child span generation', () => {
    it('validates correct W3C traceparent and rejects invalid formats', () => {
      const { isValidTraceparent } = require('../src/common/interceptors/trace.interceptor');
      expect(isValidTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01')).toBe(true);
      expect(isValidTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00')).toBe(true);
      // Version ff is forbidden
      expect(isValidTraceparent('ff-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01')).toBe(false);
      // All-zero trace-id is forbidden
      expect(isValidTraceparent('00-00000000000000000000000000000000-00f067aa0ba902b7-01')).toBe(false);
      // All-zero parent-id is forbidden
      expect(isValidTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01')).toBe(false);
      // Non-hex characters
      expect(isValidTraceparent('00-zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz-00f067aa0ba902b7-01')).toBe(false);
      // Random strings or empty
      expect(isValidTraceparent('arbitrary-uuid-string')).toBe(false);
      expect(isValidTraceparent(undefined)).toBe(false);
    });

    it('generates a new child span ID with identical traceId and version', () => {
      const { createChildTraceparent } = require('../src/common/interceptors/trace.interceptor');
      const parent = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
      const child = createChildTraceparent(parent);

      const parts = child.split('-');
      expect(parts.length).toBe(4);
      expect(parts[0]).toBe('00');
      expect(parts[1]).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
      expect(parts[2]).not.toBe('00f067aa0ba902b7'); // Child span has new ID
      expect(parts[2]).toMatch(/^[0-9a-f]{16}$/);
      expect(parts[3]).toBe('01');
    });
  });
});
