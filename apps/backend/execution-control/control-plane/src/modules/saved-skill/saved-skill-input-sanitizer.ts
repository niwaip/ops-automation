import { createHash } from 'crypto';
import type { SavedSkillReviewIssueDto } from './saved-skill.dto';

const SENSITIVE_KEY = /(password|passwd|secret|authorization|cookie|api[_-]?key|access[_-]?token|refresh[_-]?token)$/i;
const TRANSIENT_KEY = /^(executionId|scheduleId|sessionId|runtimeSessionId|workerId|traceId|snapshotId|previousResultText|previousResultTitle)$/i;
const ALLOWED_REFERENCE_KEY = /(credential|secret|file|artifact)Ref$/i;

export interface SanitizedSavedSkillInput {
  value: Record<string, unknown>;
  issues: SavedSkillReviewIssueDto[];
  inputHash: string;
}

export const sanitizeSavedSkillInput = (input: unknown): SanitizedSavedSkillInput => {
  const issues: SavedSkillReviewIssueDto[] = [];
  const sanitized = sanitizeValue(input, '$', issues);
  const value = isRecord(sanitized) ? sanitized : {};
  return {
    value,
    issues,
    inputHash: createHash('sha256').update(stableStringify(value)).digest('hex'),
  };
};

const sanitizeValue = (
  value: unknown,
  path: string,
  issues: SavedSkillReviewIssueDto[]
): unknown => {
  if (Array.isArray(value)) {
    return value.map((item, index) => sanitizeValue(item, `${path}[${index}]`, issues));
  }
  if (!isRecord(value)) {
    if (typeof value === 'string' && value.length > 100000) {
      issues.push({
        code: 'LARGE_INLINE_VALUE_REMOVED',
        severity: 'error',
        path,
        message: '检测到超大内联内容，用户工作流只能保存文件或产物引用。',
      });
      return undefined;
    }
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (key.startsWith('__')) {
      continue;
    }
    if (TRANSIENT_KEY.test(key)) {
      issues.push({
        code: 'TRANSIENT_INPUT_REMOVED',
        severity: 'warning',
        path: childPath,
        message: `已移除瞬态运行参数 ${key}。`,
      });
      continue;
    }
    if (SENSITIVE_KEY.test(key) && !ALLOWED_REFERENCE_KEY.test(key)) {
      issues.push({
        code: 'SENSITIVE_INPUT_BLOCKED',
        severity: 'error',
        path: childPath,
        message: `固定参数不能保存明文敏感字段 ${key}，请改用凭证引用。`,
      });
      continue;
    }
    const nextValue = sanitizeValue(child, childPath, issues);
    if (nextValue !== undefined) {
      result[key] = nextValue;
    }
  }
  return result;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
};
