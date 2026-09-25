import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface RequestMetric {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
}

interface CachedDbMetrics {
  activeExecutions: number;
  totalExecutions: number;
  succeededExecutions: number;
  failedExecutions: number;
  cachedAt: number;
}

export const DEFAULT_DB_METRICS_CACHE_TTL_MS = 30_000;

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);
  private requestCounts: Map<string, number> = new Map();
  private requestDurationSum: Map<string, number> = new Map();
  private totalRequests = 0;
  private cachedDbMetrics: CachedDbMetrics | null = null;
  private inFlightDbMetricsPromise: Promise<CachedDbMetrics> | null = null;
  private dbMetricsTtlMs: number = DEFAULT_DB_METRICS_CACHE_TTL_MS;

  constructor(private readonly prisma: PrismaService) {}

  setDbMetricsTtlMs(ttlMs: number): void {
    this.dbMetricsTtlMs = ttlMs;
  }

  recordRequest(metric: RequestMetric): void {
    this.totalRequests++;
    const key = `${metric.method}_${metric.statusCode}`;
    this.requestCounts.set(key, (this.requestCounts.get(key) || 0) + 1);

    const pathKey = metric.path.split('?')[0];
    this.requestDurationSum.set(pathKey, (this.requestDurationSum.get(pathKey) || 0) + metric.durationMs);
  }

  clearDbMetricsCache(): void {
    this.cachedDbMetrics = null;
    this.inFlightDbMetricsPromise = null;
  }

  async getPrometheusMetrics(): Promise<string> {
    const lines: string[] = [];

    // Process uptime (real-time)
    lines.push('# HELP process_uptime_seconds Process uptime in seconds');
    lines.push('# TYPE process_uptime_seconds gauge');
    lines.push(`process_uptime_seconds ${Math.floor(process.uptime())}`);

    // Memory usage (real-time)
    const mem = process.memoryUsage();
    lines.push('# HELP nodejs_heap_bytes Node.js heap memory used');
    lines.push('# TYPE nodejs_heap_bytes gauge');
    lines.push(`nodejs_heap_bytes ${mem.heapUsed}`);

    // Total HTTP requests (real-time)
    lines.push('# HELP ops_http_requests_total Total HTTP requests processed');
    lines.push('# TYPE ops_http_requests_total counter');
    lines.push(`ops_http_requests_total ${this.totalRequests}`);

    for (const [key, count] of this.requestCounts.entries()) {
      const [method, status] = key.split('_');
      lines.push(`ops_http_requests_status_total{method="${method}",status="${status}"} ${count}`);
    }

    try {
      const now = Date.now();
      let metrics = this.cachedDbMetrics;

      if (!metrics || now - metrics.cachedAt >= this.dbMetricsTtlMs) {
        if (!this.inFlightDbMetricsPromise) {
          this.inFlightDbMetricsPromise = (async () => {
            try {
              const [activeExecutions, totalExecutions, succeededExecutions, failedExecutions] =
                await Promise.all([
                  this.prisma.execution.count({
                    where: {
                      status: {
                        in: ['pending', 'running', 'waiting_input'],
                      },
                    },
                  }),
                  this.prisma.execution.count(),
                  this.prisma.execution.count({
                    where: { status: 'succeeded' },
                  }),
                  this.prisma.execution.count({
                    where: { status: 'failed' },
                  }),
                ]);

              const newMetrics: CachedDbMetrics = {
                activeExecutions,
                totalExecutions,
                succeededExecutions,
                failedExecutions,
                cachedAt: Date.now(),
              };
              this.cachedDbMetrics = newMetrics;
              return newMetrics;
            } finally {
              this.inFlightDbMetricsPromise = null;
            }
          })();
        }
        metrics = await this.inFlightDbMetricsPromise;
      }

      lines.push('# HELP ops_active_executions_count Number of currently active executions');
      lines.push('# TYPE ops_active_executions_count gauge');
      lines.push(`ops_active_executions_count ${metrics.activeExecutions}`);

      lines.push('# HELP ops_executions_total Total number of executions');
      lines.push('# TYPE ops_executions_total counter');
      lines.push(`ops_executions_total ${metrics.totalExecutions}`);

      lines.push(`ops_executions_by_status{status="succeeded"} ${metrics.succeededExecutions}`);
      lines.push(`ops_executions_by_status{status="failed"} ${metrics.failedExecutions}`);
    } catch (err: any) {
      this.logger.warn(`Failed to query database for execution metrics: ${err.message}`);
    }

    return lines.join('\n') + '\n';
  }
}
