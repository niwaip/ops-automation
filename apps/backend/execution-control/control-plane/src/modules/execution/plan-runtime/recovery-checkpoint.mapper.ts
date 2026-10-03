/**
 * Recovery Checkpoint Mapper
 * 负责从历史执行输出中提取轻量恢复 Checkpoint，
 * 剔除内联 Base64 截图、巨型 HTML 快照等非必要重型数据，避免恢复请求突破 2 MiB 上限。
 */

export interface SanitizedStepArtifact {
  id: string;
  type: string;
  name?: string;
  url?: string;
  mimeType?: string;
  sizeBytes?: number;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface SanitizedStepPageState {
  pageUrl?: string;
  pageTitle?: string;
  readyState?: string;
  pageFingerprint?: string;
  observedAt?: string;
  [key: string]: unknown;
}

export interface SanitizedRecoveryStepResult {
  stepId: string;
  name?: string;
  action?: string;
  target?: string | null;
  attempt?: number;
  success?: boolean;
  status?: string;
  outcome?: string;
  takeover?: boolean;
  takeoverReason?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  outputVar?: string;
  output?: Record<string, unknown> | null;
  pageState?: SanitizedStepPageState;
  artifacts?: SanitizedStepArtifact[];
  attemptedAt?: string;
  observedAt?: string;
  warningCodes?: string[];
  meta?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface RecoveryCheckpointOutput {
  variables?: Record<string, unknown>;
  runtimeEvidence?: Record<string, unknown>;
  previousStepResults?: SanitizedRecoveryStepResult[];
  attemptByStepId?: Record<string, number>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const STRIP_OUTPUT_KEY_REGEX = /screenshot|screenshotBase64|rawHtml|htmlSnapshot|domSnapshot|pageSource/i;
const MAX_STRING_LENGTH_THRESHOLD = 4096;

/**
 * 递归清理 step output 中可能潜藏的大型 base64 字符串或 HTML
 */
export function sanitizeStepOutput(output: unknown, depth = 0): Record<string, unknown> | null {
  if (!isRecord(output)) {
    return null;
  }
  if (depth > 5) {
    return output;
  }

  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(output)) {
    if (STRIP_OUTPUT_KEY_REGEX.test(key)) {
      continue;
    }
    if (typeof value === 'string') {
      if (value.length > MAX_STRING_LENGTH_THRESHOLD) {
        cleaned[key] = `[pruned: ${value.length} chars string]`;
        continue;
      }
      cleaned[key] = value;
    } else if (isRecord(value)) {
      cleaned[key] = sanitizeStepOutput(value, depth + 1);
    } else if (Array.isArray(value)) {
      cleaned[key] = value.map((item) => (isRecord(item) ? sanitizeStepOutput(item, depth + 1) : item));
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

/**
 * 提取精简的 PageState，保留 URL/Title/状态，剔除截图与 DOM 树
 */
export function sanitizeStepPageState(pageState: unknown): SanitizedStepPageState | undefined {
  if (!isRecord(pageState)) {
    return undefined;
  }
  const result: SanitizedStepPageState = {};
  if (typeof pageState.pageUrl === 'string') result.pageUrl = pageState.pageUrl;
  if (typeof pageState.pageTitle === 'string') result.pageTitle = pageState.pageTitle;
  if (typeof pageState.readyState === 'string') result.readyState = pageState.readyState;
  if (typeof pageState.pageFingerprint === 'string') result.pageFingerprint = pageState.pageFingerprint;
  if (typeof pageState.observedAt === 'string') result.observedAt = pageState.observedAt;
  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * 规范化并精简 Artifact 列表：仅保留文件引用/URL/ID，剔除 inlineText/base64
 */
export function sanitizeStepArtifacts(artifacts: unknown): SanitizedStepArtifact[] | undefined {
  if (!Array.isArray(artifacts)) {
    return undefined;
  }
  const cleaned: SanitizedStepArtifact[] = [];
  for (const raw of artifacts) {
    if (!isRecord(raw)) continue;
    const id = typeof raw.id === 'string' ? raw.id : undefined;
    const type = typeof raw.type === 'string' ? raw.type : 'browser_artifact';
    if (!id && !type) continue;

    const item: SanitizedStepArtifact = {
      id: id || `artifact_${Date.now()}`,
      type,
    };
    if (typeof raw.name === 'string') item.name = raw.name;
    if (typeof raw.url === 'string') item.url = raw.url;
    if (typeof raw.mimeType === 'string') item.mimeType = raw.mimeType;
    if (typeof raw.sizeBytes === 'number') item.sizeBytes = raw.sizeBytes;

    if (isRecord(raw.metadata)) {
      const meta = { ...raw.metadata };
      delete meta.screenshot;
      delete meta.screenshotBase64;
      delete meta.html;
      delete meta.htmlSnapshot;
      item.metadata = meta;
    }
    cleaned.push(item);
  }
  return cleaned.length > 0 ? cleaned : undefined;
}

/**
 * 单步结果精净化
 */
export function sanitizeStepResultForRecovery(rawStep: Record<string, unknown>): SanitizedRecoveryStepResult {
  const stepId = typeof rawStep.stepId === 'string' ? rawStep.stepId : 'unknown_step';
  const result: SanitizedRecoveryStepResult = {
    stepId,
  };

  if (typeof rawStep.name === 'string') result.name = rawStep.name;
  if (typeof rawStep.action === 'string') result.action = rawStep.action;
  if (rawStep.target !== undefined) result.target = rawStep.target as string | null;
  if (typeof rawStep.attempt === 'number') result.attempt = rawStep.attempt;
  if (typeof rawStep.success === 'boolean') result.success = rawStep.success;
  if (typeof rawStep.status === 'string') result.status = rawStep.status;
  if (typeof rawStep.outcome === 'string') result.outcome = rawStep.outcome;
  if (rawStep.takeover === true) result.takeover = true;
  if (typeof rawStep.takeoverReason === 'string') result.takeoverReason = rawStep.takeoverReason;
  if (typeof rawStep.errorCode === 'string') result.errorCode = rawStep.errorCode;
  if (typeof rawStep.errorMessage === 'string') result.errorMessage = rawStep.errorMessage;
  if (typeof rawStep.outputVar === 'string') result.outputVar = rawStep.outputVar;
  if (typeof rawStep.attemptedAt === 'string') result.attemptedAt = rawStep.attemptedAt;
  if (typeof rawStep.observedAt === 'string') result.observedAt = rawStep.observedAt;
  if (Array.isArray(rawStep.warningCodes)) {
    result.warningCodes = rawStep.warningCodes.filter((item): item is string => typeof item === 'string');
  }
  if (isRecord(rawStep.meta)) {
    result.meta = rawStep.meta;
  }

  const cleanedOutput = sanitizeStepOutput(rawStep.output);
  if (cleanedOutput && Object.keys(cleanedOutput).length > 0) {
    result.output = cleanedOutput;
  } else if (rawStep.output === null) {
    result.output = null;
  }

  const cleanedPageState = sanitizeStepPageState(rawStep.pageState);
  if (cleanedPageState) {
    result.pageState = cleanedPageState;
  }

  const cleanedArtifacts = sanitizeStepArtifacts(rawStep.artifacts);
  if (cleanedArtifacts) {
    result.artifacts = cleanedArtifacts;
  }

  return result;
}

/**
 * 批量精简化历史步骤结果
 */
export function sanitizeStepResultsForRecovery(rawStepResults: unknown): SanitizedRecoveryStepResult[] {
  if (!Array.isArray(rawStepResults)) {
    return [];
  }
  return rawStepResults
    .filter(isRecord)
    .map(sanitizeStepResultForRecovery);
}

/**
 * 从阶段输出对象中提取瘦身后的恢复 Checkpoint
 */
export function extractRecoveryCheckpoint(nestedPhaseOutput: unknown): RecoveryCheckpointOutput {
  if (!isRecord(nestedPhaseOutput)) {
    return {};
  }

  const checkpoint: RecoveryCheckpointOutput = {};

  if (isRecord(nestedPhaseOutput.variables)) {
    checkpoint.variables = { ...nestedPhaseOutput.variables };
  }

  if (isRecord(nestedPhaseOutput.runtimeEvidence)) {
    checkpoint.runtimeEvidence = { ...nestedPhaseOutput.runtimeEvidence };
  }

  if (isRecord(nestedPhaseOutput.attemptByStepId)) {
    checkpoint.attemptByStepId = { ...(nestedPhaseOutput.attemptByStepId as Record<string, number>) };
  }

  if (Array.isArray(nestedPhaseOutput.stepResults)) {
    checkpoint.previousStepResults = sanitizeStepResultsForRecovery(nestedPhaseOutput.stepResults);
    if (!checkpoint.attemptByStepId) {
      const attempts: Record<string, number> = {};
      for (const step of checkpoint.previousStepResults) {
        if (step.stepId && typeof step.attempt === 'number') {
          attempts[step.stepId] = Math.max(attempts[step.stepId] || 0, step.attempt);
        }
      }
      if (Object.keys(attempts).length > 0) {
        checkpoint.attemptByStepId = attempts;
      }
    }
  }

  return checkpoint;
}
