import type { CaptureProfileV1 } from './capture-profile-v1.types';
import type { ContentRefV1 } from './content-ref-v1.types';
import type { OpsReportProjectionV1 } from './ops-report-projection-v1.types';

export type ContractValidationResult = { valid: boolean; errors: string[] };

export function validateCaptureProfileV1(value: unknown): ContractValidationResult {
  const profile = value as Partial<CaptureProfileV1> | undefined;
  const errors: string[] = [];
  if (!isRecord(profile) || profile.schemaVersion !== 'capture-profile/v1')
    errors.push('schemaVersion must be capture-profile/v1');
  if (!['article', 'application', 'audit', 'raw'].includes(String(profile?.profile)))
    errors.push('profile is invalid');
  if (
    !isRecord(profile?.capture) ||
    !['screenshot', 'html', 'snapshot', 'mainContent'].every(
      (key) => typeof profile?.capture?.[key as keyof CaptureProfileV1['capture']] === 'boolean'
    )
  )
    errors.push('capture is incomplete');
  if (
    !isRecord(profile?.limits) ||
    !['htmlBytes', 'contentChars', 'tableCells'].every(
      (key) =>
        Number.isInteger(profile?.limits?.[key as keyof CaptureProfileV1['limits']]) &&
        Number(profile?.limits?.[key as keyof CaptureProfileV1['limits']]) >= 0
    )
  )
    errors.push('limits are invalid');
  if (profile?.readiness !== undefined) {
    if (!isRecord(profile.readiness)) {
      errors.push('readiness must be an object');
    } else {
      if (
        profile.readiness.waitUntil !== undefined &&
        !['domcontentloaded', 'networkidle'].includes(String(profile.readiness.waitUntil))
      )
        errors.push('readiness.waitUntil is invalid');
      if (!isOptionalNonNegativeInteger(profile.readiness.timeoutMs))
        errors.push('readiness.timeoutMs is invalid');
      if (!isOptionalNonNegativeInteger(profile.readiness.stableMs))
        errors.push('readiness.stableMs is invalid');
      if (
        profile.readiness.selector !== undefined &&
        (typeof profile.readiness.selector !== 'string' || !profile.readiness.selector.trim())
      )
        errors.push('readiness.selector is invalid');
      if (!isOptionalNonNegativeInteger(profile.readiness.minCount))
        errors.push('readiness.minCount is invalid');
      if (
        profile.readiness.maxAttempts !== undefined &&
        (!Number.isInteger(profile.readiness.maxAttempts) ||
          Number(profile.readiness.maxAttempts) < 1 ||
          Number(profile.readiness.maxAttempts) > 3)
      )
        errors.push('readiness.maxAttempts is invalid');
      if (!isOptionalNonNegativeInteger(profile.readiness.retryDelayMs))
        errors.push('readiness.retryDelayMs is invalid');
    }
  }
  if (profile?.quality !== undefined) {
    if (!isRecord(profile.quality)) {
      errors.push('quality must be an object');
    } else {
      if (!isOptionalNonNegativeInteger(profile.quality.minChars))
        errors.push('quality.minChars is invalid');
      if (
        profile.quality.minConfidence !== undefined &&
        (!Number.isFinite(profile.quality.minConfidence) ||
          Number(profile.quality.minConfidence) < 0 ||
          Number(profile.quality.minConfidence) > 1)
      )
        errors.push('quality.minConfidence is invalid');
    }
  }
  if (profile?.profile === 'raw' && profile.capture?.mainContent === true)
    errors.push('raw profile cannot enable mainContent');
  return { valid: errors.length === 0, errors };
}

export function validateContentRefV1(value: unknown): ContractValidationResult {
  const content = value as Partial<ContentRefV1> | undefined;
  const errors: string[] = [];
  if (!isRecord(content) || content.schemaVersion !== 'content-ref/v1')
    errors.push('schemaVersion must be content-ref/v1');
  for (const key of [
    'contentId',
    'resultRefId',
    'pageId',
    'sourceUrl',
    'finalUrl',
    'preview',
  ] as const)
    if (!nonEmpty(content?.[key])) errors.push(`${key} is required`);
  if (!['text/markdown', 'text/plain', 'application/json'].includes(String(content?.mediaType)))
    errors.push('mediaType is invalid');
  if (
    !isRecord(content?.extraction) ||
    !Number.isFinite(content.extraction?.confidence) ||
    Number(content.extraction.confidence) < 0 ||
    Number(content.extraction.confidence) > 1
  )
    errors.push('extraction.confidence is invalid');
  if (
    !isRecord(content?.integrity) ||
    !/^[a-f0-9]{64}$/iu.test(String(content.integrity?.sha256 || '')) ||
    !Number.isInteger(content.integrity?.chars) ||
    !Number.isInteger(content.integrity?.bytes)
  )
    errors.push('integrity is invalid');
  if (!isRecord(content?.safety) || content.safety.untrustedExternalContent !== true)
    errors.push('safety must mark content as untrusted');
  return { valid: errors.length === 0, errors };
}

export function validateOpsReportProjectionV1(value: unknown): ContractValidationResult {
  const projection = value as Partial<OpsReportProjectionV1> | undefined;
  const errors: string[] = [];
  if (!isRecord(projection) || projection.schemaVersion !== 'ops-report-projection/v1')
    errors.push('schemaVersion must be ops-report-projection/v1');
  if (
    !isRecord(projection?.execution) ||
    !nonEmpty(projection.execution.executionId) ||
    !['succeeded', 'failed', 'partial', 'recovered'].includes(String(projection.execution.status))
  )
    errors.push('execution is invalid');
  if (!isRecord(projection?.target) || !nonEmpty(projection.target.entryUrl))
    errors.push('target.entryUrl is required');
  if (
    !isRecord(projection?.summary) ||
    !['totalSteps', 'succeededSteps', 'failedSteps', 'skippedSteps', 'loopIterations'].every(
      (key) =>
        Number.isInteger(projection.summary?.[key as keyof OpsReportProjectionV1['summary']]) &&
        Number(projection.summary?.[key as keyof OpsReportProjectionV1['summary']]) >= 0
    )
  )
    errors.push('summary is invalid');
  if (
    !Array.isArray(projection?.checks) ||
    !Array.isArray(projection?.incidents) ||
    !Array.isArray(projection?.evidence) ||
    !isRecord(projection?.declaredOutputs)
  )
    errors.push('collections are invalid');
  return { valid: errors.length === 0, errors };
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function nonEmpty(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}
function isOptionalNonNegativeInteger(value: unknown): boolean {
  return value === undefined || (Number.isInteger(value) && Number(value) >= 0);
}
