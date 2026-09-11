import { Injectable } from '@nestjs/common';

@Injectable()
export class MetricsService {
  private totalInvocations = 0;
  private promptTokensEstimated = 0;

  recordInvocation(tokens: number = 0): void {
    this.totalInvocations++;
    this.promptTokensEstimated += tokens;
  }

  getPrometheusMetrics(): string {
    const lines: string[] = [];
    lines.push('# HELP process_uptime_seconds Process uptime in seconds');
    lines.push('# TYPE process_uptime_seconds gauge');
    lines.push(`process_uptime_seconds ${Math.floor(process.uptime())}`);

    const mem = process.memoryUsage();
    lines.push('# HELP nodejs_heap_bytes Node.js heap memory used');
    lines.push('# TYPE nodejs_heap_bytes gauge');
    lines.push(`nodejs_heap_bytes ${mem.heapUsed}`);

    lines.push('# HELP ops_ai_orchestrator_invocations_total Total AI orchestrator model invocations');
    lines.push('# TYPE ops_ai_orchestrator_invocations_total counter');
    lines.push(`ops_ai_orchestrator_invocations_total ${this.totalInvocations}`);

    lines.push('# HELP ops_ai_estimated_tokens_total Estimated tokens passed to LLM');
    lines.push('# TYPE ops_ai_estimated_tokens_total counter');
    lines.push(`ops_ai_estimated_tokens_total ${this.promptTokensEstimated}`);

    return lines.join('\n') + '\n';
  }
}
