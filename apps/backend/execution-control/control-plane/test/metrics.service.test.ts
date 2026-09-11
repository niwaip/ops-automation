import { MetricsService } from '../src/modules/metrics/metrics.service';

describe('MetricsService', () => {
  let service: MetricsService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      execution: {
        count: jest.fn().mockImplementation((args?: any) => {
          if (!args) return Promise.resolve(10);
          if (args.where?.status?.in) return Promise.resolve(2);
          if (args.where?.status === 'succeeded') return Promise.resolve(7);
          if (args.where?.status === 'failed') return Promise.resolve(1);
          return Promise.resolve(0);
        }),
      },
    };
    service = new MetricsService(mockPrisma);
  });

  it('should record requests and output prometheus format metrics', async () => {
    service.recordRequest({ method: 'GET', path: '/api/executions', statusCode: 200, durationMs: 15 });
    service.recordRequest({ method: 'POST', path: '/api/executions', statusCode: 201, durationMs: 45 });

    const metrics = await service.getPrometheusMetrics();
    expect(metrics).toContain('# HELP ops_http_requests_total');
    expect(metrics).toContain('ops_http_requests_total 2');
    expect(metrics).toContain('ops_http_requests_status_total{method="GET",status="200"} 1');
    expect(metrics).toContain('ops_http_requests_status_total{method="POST",status="201"} 1');
    expect(metrics).toContain('ops_active_executions_count 2');
    expect(metrics).toContain('ops_executions_total 10');
    expect(metrics).toContain('ops_executions_by_status{status="succeeded"} 7');
    expect(metrics).toContain('ops_executions_by_status{status="failed"} 1');
  });
});
