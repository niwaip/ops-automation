export interface OpsReportProjectionV1 {
  schemaVersion: 'ops-report-projection/v1';
  execution: {
    executionId: string;
    skillId: string;
    startedAt: string;
    endedAt: string;
    status: 'succeeded' | 'failed' | 'partial' | 'recovered';
  };
  target: { environment?: string; system?: string; entryUrl: string };
  summary: { totalSteps: number; succeededSteps: number; failedSteps: number; skippedSteps: number; loopIterations: number };
  checks: Array<{ name: string; status: 'pass' | 'fail' | 'unknown'; observed?: unknown; expected?: unknown; stepId?: string }>;
  incidents: Array<{ severity: 'info' | 'warning' | 'critical'; code: string; message: string; stepId?: string }>;
  evidence: Array<{ type: 'screenshot' | 'html' | 'snapshot' | 'content'; artifactId?: string; resultRefId?: string; pageId?: string }>;
  declaredOutputs: Record<string, unknown>;
}
