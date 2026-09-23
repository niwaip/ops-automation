import { ProxyController } from '../src/modules/proxy/proxy.controller';
import { TRACE_ID_HEADER, TRACEPARENT_HEADER, TRACESTATE_HEADER } from '../src/common/interceptors/trace.interceptor';

describe('ProxyController Distributed Tracing', () => {
  let proxyServiceMock: any;
  let auditServiceMock: any;
  let controller: ProxyController;

  beforeEach(() => {
    proxyServiceMock = {
      proxyRequest: jest.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: { ok: true },
      }),
    };
    auditServiceMock = {
      logApiCall: jest.fn().mockResolvedValue(undefined),
    };
    controller = new ProxyController(proxyServiceMock, auditServiceMock);
  });

  it('forwards child traceparent derived from req.traceparent when no raw header exists', async () => {
    const parentSpan = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
    const req: any = {
      headers: {},
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      traceparent: parentSpan,
      traceContext: {
        traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
        traceparent: parentSpan,
        tracestate: 'rojo=1',
      },
      method: 'GET',
    };
    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      setHeader: jest.fn(),
    };

    await controller.proxyPlatform(req, res, 'health', {}, {});

    expect(proxyServiceMock.proxyRequest).toHaveBeenCalled();
    const passedHeaders = proxyServiceMock.proxyRequest.mock.calls[0][4];
    expect(passedHeaders[TRACE_ID_HEADER]).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(passedHeaders[TRACEPARENT_HEADER]).toBeDefined();
    expect(passedHeaders[TRACEPARENT_HEADER].startsWith('00-4bf92f3577b34da6a3ce929d0e0e4736-')).toBe(true);
    expect(passedHeaders[TRACEPARENT_HEADER]).not.toBe(parentSpan); // Must be a new child span!
    expect(passedHeaders[TRACESTATE_HEADER]).toBe('rojo=1');
  });
});
