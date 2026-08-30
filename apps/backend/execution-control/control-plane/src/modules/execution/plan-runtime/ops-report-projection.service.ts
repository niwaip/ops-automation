import { Injectable } from '@nestjs/common';
import { type BrowserRunOutputV2, type OpsReportProjectionV1, validateOpsReportProjectionV1 } from '@ops/backend-browser-execution-contract';

@Injectable()
export class OpsReportProjectionService {
  project(input: { browser: BrowserRunOutputV2; skillId: string; entryUrl: string; environment?: string; system?: string }): OpsReportProjectionV1 {
    const browser = input.browser;
    const status = browser.run.status === 'failed' ? 'failed' : browser.run.status === 'completed_with_warnings' || browser.summary.recoveredSteps > 0 ? 'recovered' : 'succeeded';
    const projection: OpsReportProjectionV1 = {
      schemaVersion: 'ops-report-projection/v1',
      execution: { executionId: browser.run.executionId, skillId: input.skillId, startedAt: browser.run.startedAt, endedAt: browser.run.endedAt, status },
      target: { entryUrl: input.entryUrl, ...(input.environment ? { environment: input.environment } : {}), ...(input.system ? { system: input.system } : {}) },
      summary: { totalSteps: browser.summary.totalSteps, succeededSteps: browser.summary.completedSteps + browser.summary.recoveredSteps, failedSteps: browser.summary.failedSteps, skippedSteps: browser.summary.skippedSteps, loopIterations: maxIteration(browser.steps) },
      checks: browser.steps.map((step) => ({ name: step.name || step.action, status: step.status === 'completed' || step.status === 'recovered' ? 'pass' : step.status === 'failed' ? 'fail' : 'unknown', stepId: step.stepId })),
      incidents: browser.warnings.map((warning) => ({ severity: warning.code.includes('FAILED') ? 'warning' : 'info', code: warning.code, message: warning.message, ...(warning.stepId ? { stepId: warning.stepId } : {}) })),
      evidence: browser.artifacts.map((artifact) => ({ type: artifact.type.includes('screenshot') ? 'screenshot' : artifact.type.includes('html') ? 'html' : artifact.type.includes('snapshot') ? 'snapshot' : 'content', artifactId: artifact.id, ...(typeof artifact.metadata?.pageId === 'string' ? { pageId: artifact.metadata.pageId } : {}) })),
      declaredOutputs: Object.fromEntries(Object.entries(browser.outputs).map(([name, output]) => [name, output.value])),
    };
    const validation = validateOpsReportProjectionV1(projection);
    if (!validation.valid) throw new Error(`OPS_REPORT_PROJECTION_INVALID: ${validation.errors.join('; ')}`);
    return projection;
  }
}

function maxIteration(steps: BrowserRunOutputV2['steps']): number {
  return steps.reduce((maximum, step) => typeof step.metadata?.iteration === 'number' ? Math.max(maximum, step.metadata.iteration) : maximum, 0);
}
