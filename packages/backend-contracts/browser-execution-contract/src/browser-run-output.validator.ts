import { createHash } from 'crypto';
import { BROWSER_RUN_OUTPUT_V2_SCHEMA } from './browser-run-output.schema';
import type { BrowserRunOutputV2 } from './browser-run-output.types';

export interface BrowserRunOutputValidationResult {
  valid: boolean;
  errors: string[];
}

export const BROWSER_RUN_OUTPUT_V2_SCHEMA_DIGEST = createHash('sha256')
  .update(canonicalJson(BROWSER_RUN_OUTPUT_V2_SCHEMA))
  .digest('hex');

export function validateBrowserRunOutputV2(value: unknown): BrowserRunOutputValidationResult {
  const output = value as Partial<BrowserRunOutputV2> | null;
  const errors: string[] = [];
  if (!output || typeof output !== 'object' || Array.isArray(output)) return { valid: false, errors: ['output must be an object'] };
  if (output.schemaVersion !== 'browser-run-output/v2') errors.push('schemaVersion must be browser-run-output/v2');
  if (!output.run || typeof output.run !== 'object') errors.push('run is required');
  if (!output.summary || typeof output.summary !== 'object') errors.push('summary is required');
  if (!Array.isArray(output.steps)) errors.push('steps must be an array');
  if (!Array.isArray(output.pages)) errors.push('pages must be an array');
  if (!Array.isArray(output.artifacts)) errors.push('artifacts must be an array');
  if (!output.outputs || typeof output.outputs !== 'object' || Array.isArray(output.outputs)) errors.push('outputs must be an object');
  if (!Array.isArray(output.warnings)) errors.push('warnings must be an array');
  if (errors.length) return { valid: false, errors };

  const run = output.run as BrowserRunOutputV2['run'];
  if (!run.executionId || !run.runtimeSessionId || !run.backend || !run.startedAt || !run.endedAt || !run.contractDigest) errors.push('run identity is incomplete');
  if (!['completed', 'completed_with_warnings', 'failed', 'blocked', 'takeover_required'].includes(run.status)) errors.push('run.status is invalid');
  const steps = output.steps as BrowserRunOutputV2['steps'];
  for (const step of steps) {
    if (!step.stepId || !step.action || !Number.isInteger(step.attempt) || step.attempt < 1) errors.push('step identity is incomplete');
    if (!['completed', 'failed', 'recovered', 'skipped', 'blocked', 'takeover_required'].includes(step.status)) errors.push(`step ${step.stepId || '<unknown>'} has invalid status`);
  }
  for (const artifact of output.artifacts as BrowserRunOutputV2['artifacts']) {
    if (!artifact.id || !artifact.type) errors.push('artifact identity is incomplete');
  }
  const pageIds = new Set<string>();
  for (const page of output.pages as BrowserRunOutputV2['pages']) {
    if (!page.pageId || pageIds.has(page.pageId)) errors.push(`duplicate or empty pageId: ${page.pageId || '<empty>'}`);
    pageIds.add(page.pageId);
  }
  if (run.finalPageId && !pageIds.has(run.finalPageId)) errors.push('finalPageId must exist in pages');
  const stepIds = new Set(steps.map((step) => step.stepId));
  const artifactIds = new Set((output.artifacts as BrowserRunOutputV2['artifacts']).map((artifact) => artifact.id));
  for (const page of output.pages as BrowserRunOutputV2['pages']) {
    if (!stepIds.has(page.stepId)) errors.push(`page ${page.pageId} references unknown step ${page.stepId}`);
    for (const artifactId of page.artifactIds) if (!artifactIds.has(artifactId)) errors.push(`page ${page.pageId} references unknown artifact ${artifactId}`);
  }
  const summary = output.summary as BrowserRunOutputV2['summary'];
  if (summary.totalSteps !== steps.length) errors.push('summary.totalSteps must equal steps.length');
  const actual = {
    completedSteps: steps.filter((step) => step.status === 'completed').length,
    recoveredSteps: steps.filter((step) => step.status === 'recovered').length,
    failedSteps: steps.filter((step) => step.status === 'failed').length,
    skippedSteps: steps.filter((step) => step.status === 'skipped').length,
  };
  for (const [key, count] of Object.entries(actual)) if (summary[key as keyof typeof actual] !== count) errors.push(`summary.${key} is inconsistent`);
  return { valid: errors.length === 0, errors };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
