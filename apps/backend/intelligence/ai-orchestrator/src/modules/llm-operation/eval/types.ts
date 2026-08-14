export interface FixtureCase {
  name: string;
  input: Record<string, unknown>;
  expectedOutput?: Record<string, unknown>;
  isNegative: boolean;
  errorContains?: string;
}

export interface FixtureBundle {
  operationId: string;
  cases: FixtureCase[];
}

export interface FixtureRunResult {
  caseName: string;
  passed: boolean;
  actualOutput?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
  durationMs: number;
}

export interface FixtureRunSummary {
  totalCases: number;
  passed: number;
  failed: number;
  results: FixtureRunResult[];
}

export interface EvalRunConfig {
  operationKey: string;
  version: string;
  baselineVersion?: string;
  suiteId: string;
  actor: string;
}

export interface EvalRunMetrics {
  schemaPassRate: number;
  taskSuccessRate: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  totalEstimatedCost: number;
  safetyRejectRate: number;
}

export interface EvalRunResult {
  runId: string;
  config: EvalRunConfig;
  startedAt: Date;
  completedAt: Date | null;
  metrics: EvalRunMetrics;
  fixtureResults: FixtureRunResult[];
  baselineComparison?: EvalRegressionComparison;
  passed: boolean;
  gateViolations: string[];
}

export interface EvalRegressionComparison {
  baselineMetrics: EvalRunMetrics;
  candidateMetrics: EvalRunMetrics;
  regressions: Array<{
    metric: keyof EvalRunMetrics;
    baseline: number;
    candidate: number;
    delta: number;
    severity: 'critical' | 'warning' | 'info';
    description: string;
  }>;
}

export interface OperationAttestation {
  id: string;
  operationId: string;
  versionId: string;
  operationDigest: string;
  contractDigest: string;
  evalSuiteDigest: string;
  validatorVersion: string;
  gateResults: {
    schemaTests: 'passed' | 'failed' | 'skipped';
    offlineEvals: 'passed' | 'failed' | 'skipped';
    liveEvals: 'passed' | 'failed' | 'skipped';
    securityEvals: 'passed' | 'failed' | 'skipped';
  };
  createdAt: Date;
}