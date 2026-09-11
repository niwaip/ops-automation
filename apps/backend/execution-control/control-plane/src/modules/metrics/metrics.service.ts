import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface RequestMetric {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
}

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);
  private requestCounts: Map<string, number> = new Map();
  private requestDurationSum: Map<string, number> = new Map();
  private totalRequests = 0;

  constructor(private readonly prisma: PrismaService) {}

  recordRequest(metric: RequestMetric): void {
    this.totalRequests++;
    const key = `${metric.method}_${metric.statusCode}`;
    this.requestCounts.set(key, (this.requestCounts.get(key) || 0) + 1);

    const pathKey = metric.path.split('?')[0];
    this.requestDurationSum.set(pathKey, (this.requestDurationSum.get(pathKey) || 0) + metric.durationMs);
  }

  async getPrometheusMetrics(): Promise<string> {
    const lines: string[] = [];

    // Process uptime
    lines.push('# HELP process_uptime_seconds Process uptime in seconds');
    lines.push('# TYPE process_uptime_seconds gauge');
    lines.push(`process_uptime_seconds ${Math.floor(process.uptime())}`);

    // Memory usage
    const mem = process.memoryUsage();
    lines.push('# HELP nodejs_heap_bytes Node.js heap memory used');
    lines.push('# TYPE nodejs_heap_bytes gauge');
    lines.push(`nodejs_heap_bytes ${mem.heapUsed}`);

    // Total HTTP requests
    lines.push('# HELP ops_http_requests_total Total HTTP requests processed');
    lines.push('# TYPE ops_http_requests_total counter');
    lines.push(`ops_http_requests_total ${this.totalRequests}`);

    for (const [key, count] of this.requestCounts.entries()) {
      const [method, status] = key.split('_');
      lines.push(`ops_http_requests_status_total{method="${method}",status="${status}"} ${count}`);
    }

    try {
      // Execution metrics from database
      const activeExecutions = await this.prisma.execution.count({
        where: {
          status: {
            in: ['pending', 'running', 'waiting_input'],
          },
        },
      });

      lines.push('# HELP ops_active_executions_count Number of currently active executions');
      lines.push('# TYPE ops_active_executions_count gauge');
      lines.push(`ops_active_executions_count ${activeExecutions}`);

      const totalExecutions = await this.prisma.execution.count();
      lines.push('# HELP ops_executions_total Total number of executions');
      lines.push('# TYPE ops_executions_total counter');
      lines.push(`ops_executions_total ${totalExecutions}`);

      const succeededExecutions = await this.prisma.execution.count({
        where: { status: 'succeeded' },
      });
      lines.push(`ops_executions_by_status{status="succeeded"} ${succeededExecutions}`);

      const failedExecutions = await this.prisma.execution.count({
        where: { status: 'failed' },
      });
      lines.push(`ops_executions_by_status{status="failed"} ${failedExecutions}`);
    } catch (err: any) {
      this.logger.warn(`Failed to query database for execution metrics: ${err.message}`);
    }

    return lines.join('\n') + '\n';
  }
}
