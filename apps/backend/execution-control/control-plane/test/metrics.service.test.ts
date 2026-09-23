import { Test, TestingModule } from '@nestjs/testing';
import { MetricsService } from '../src/modules/metrics/metrics.service';
import { PrismaService } from '../src/modules/prisma/prisma.service';

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

  it('instantiates cleanly via NestJS TestingModule IoC container', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetricsService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    const resolved = module.get<MetricsService>(MetricsService);
    expect(resolved).toBeDefined();
    expect(resolved).toBeInstanceOf(MetricsService);
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

  it('should cache database aggregation metrics within TTL while keeping process metrics real-time', async () => {
    // 1st call queries DB
    await service.getPrometheusMetrics();
    expect(mockPrisma.execution.count).toHaveBeenCalledTimes(4);

    // 2nd call within TTL uses cached DB counts
    service.recordRequest({ method: 'GET', path: '/api/health', statusCode: 200, durationMs: 5 });
    const metrics2 = await service.getPrometheusMetrics();
    // DB count should NOT have been called again
    expect(mockPrisma.execution.count).toHaveBeenCalledTimes(4);
    // But request count should be real-time (updated from 0 to 1)
    expect(metrics2).toContain('ops_http_requests_total 1');

    // After clearing cache, DB should be re-queried
    service.clearDbMetricsCache();
    await service.getPrometheusMetrics();
    expect(mockPrisma.execution.count).toHaveBeenCalledTimes(8);
  });

  it('deduplicates concurrent in-flight database aggregation calls (single-flight)', async () => {
    service.clearDbMetricsCache();
    // Fire 5 concurrent requests simultaneously on empty cache
    const results = await Promise.all([
      service.getPrometheusMetrics(),
      service.getPrometheusMetrics(),
      service.getPrometheusMetrics(),
      service.getPrometheusMetrics(),
      service.getPrometheusMetrics(),
    ]);

    expect(results).toHaveLength(5);
    // Even with 5 concurrent calls, only 1 DB query batch (4 counts) was executed
    expect(mockPrisma.execution.count).toHaveBeenCalledTimes(4);
  });
});
