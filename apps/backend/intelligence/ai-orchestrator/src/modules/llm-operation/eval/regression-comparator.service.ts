import { Injectable } from '@nestjs/common';
import type { EvalRunMetrics, EvalRegressionComparison } from './types';

const REGRESSION_THRESHOLDS = {
  schemaPassRateCritical: 0.95,
  taskSuccessRateRegression: 0.05,
  safetyRejectRateRegression: 0.05,
  latencyWarningRatio: 1.3,
  tokenWarningRatio: 1.3,
};

@Injectable()
export class RegressionComparatorService {
  public compare(baseline: EvalRunMetrics, candidate: EvalRunMetrics): EvalRegressionComparison {
    const regressions: EvalRegressionComparison['regressions'] = [];

    if (candidate.schemaPassRate < baseline.schemaPassRate) {
      const delta = baseline.schemaPassRate - candidate.schemaPassRate;
      regressions.push({
        metric: 'schemaPassRate',
        baseline: baseline.schemaPassRate,
        candidate: candidate.schemaPassRate,
        delta: -delta,
        severity: candidate.schemaPassRate < REGRESSION_THRESHOLDS.schemaPassRateCritical ? 'critical' : 'warning',
        description: `Schema pass rate dropped from ${(baseline.schemaPassRate * 100).toFixed(1)}% to ${(candidate.schemaPassRate * 100).toFixed(1)}%`,
      });
    }

    const taskSuccessDelta = baseline.taskSuccessRate - candidate.taskSuccessRate;
    if (taskSuccessDelta > REGRESSION_THRESHOLDS.taskSuccessRateRegression) {
      regressions.push({
        metric: 'taskSuccessRate',
        baseline: baseline.taskSuccessRate,
        candidate: candidate.taskSuccessRate,
        delta: -taskSuccessDelta,
        severity: 'critical',
        description: `Task success rate dropped by ${(taskSuccessDelta * 100).toFixed(1)}% (threshold: ${(REGRESSION_THRESHOLDS.taskSuccessRateRegression * 100).toFixed(1)}%)`,
      });
    }

    const safetyRejectDelta = candidate.safetyRejectRate - baseline.safetyRejectRate;
    if (safetyRejectDelta > REGRESSION_THRESHOLDS.safetyRejectRateRegression) {
      regressions.push({
        metric: 'safetyRejectRate',
        baseline: baseline.safetyRejectRate,
        candidate: candidate.safetyRejectRate,
        delta: safetyRejectDelta,
        severity: 'critical',
        description: `Safety reject rate increased by ${(safetyRejectDelta * 100).toFixed(1)}% (threshold: ${(REGRESSION_THRESHOLDS.safetyRejectRateRegression * 100).toFixed(1)}%)`,
      });
    }

    if (candidate.avgLatencyMs > baseline.avgLatencyMs * REGRESSION_THRESHOLDS.latencyWarningRatio) {
      const ratio = candidate.avgLatencyMs / baseline.avgLatencyMs;
      regressions.push({
        metric: 'avgLatencyMs',
        baseline: baseline.avgLatencyMs,
        candidate: candidate.avgLatencyMs,
        delta: candidate.avgLatencyMs - baseline.avgLatencyMs,
        severity: 'warning',
        description: `Average latency increased ${(ratio).toFixed(2)}x (threshold: ${REGRESSION_THRESHOLDS.latencyWarningRatio}x)`,
      });
    }

    const inputTokenRatio = baseline.avgInputTokens > 0 
      ? candidate.avgInputTokens / baseline.avgInputTokens 
      : 1;
    if (inputTokenRatio > REGRESSION_THRESHOLDS.tokenWarningRatio) {
      regressions.push({
        metric: 'avgInputTokens',
        baseline: baseline.avgInputTokens,
        candidate: candidate.avgInputTokens,
        delta: candidate.avgInputTokens - baseline.avgInputTokens,
        severity: 'warning',
        description: `Average input tokens increased ${inputTokenRatio.toFixed(2)}x (threshold: ${REGRESSION_THRESHOLDS.tokenWarningRatio}x)`,
      });
    }

    const outputTokenRatio = baseline.avgOutputTokens > 0 
      ? candidate.avgOutputTokens / baseline.avgOutputTokens 
      : 1;
    if (outputTokenRatio > REGRESSION_THRESHOLDS.tokenWarningRatio) {
      regressions.push({
        metric: 'avgOutputTokens',
        baseline: baseline.avgOutputTokens,
        candidate: candidate.avgOutputTokens,
        delta: candidate.avgOutputTokens - baseline.avgOutputTokens,
        severity: 'warning',
        description: `Average output tokens increased ${outputTokenRatio.toFixed(2)}x (threshold: ${REGRESSION_THRESHOLDS.tokenWarningRatio}x)`,
      });
    }

    const p95LatencyRatio = baseline.p95LatencyMs > 0 
      ? candidate.p95LatencyMs / baseline.p95LatencyMs 
      : 1;
    if (p95LatencyRatio > REGRESSION_THRESHOLDS.latencyWarningRatio) {
      regressions.push({
        metric: 'p95LatencyMs',
        baseline: baseline.p95LatencyMs,
        candidate: candidate.p95LatencyMs,
        delta: candidate.p95LatencyMs - baseline.p95LatencyMs,
        severity: 'warning',
        description: `P95 latency increased ${p95LatencyRatio.toFixed(2)}x (threshold: ${REGRESSION_THRESHOLDS.latencyWarningRatio}x)`,
      });
    }

    const costRatio = baseline.totalEstimatedCost > 0 
      ? candidate.totalEstimatedCost / baseline.totalEstimatedCost 
      : 1;
    if (costRatio > REGRESSION_THRESHOLDS.tokenWarningRatio) {
      regressions.push({
        metric: 'totalEstimatedCost',
        baseline: baseline.totalEstimatedCost,
        candidate: candidate.totalEstimatedCost,
        delta: candidate.totalEstimatedCost - baseline.totalEstimatedCost,
        severity: 'info',
        description: `Total estimated cost changed ${costRatio.toFixed(2)}x`,
      });
    }

    return {
      baselineMetrics: baseline,
      candidateMetrics: candidate,
      regressions,
    };
  }
}