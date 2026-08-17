import type { DeterministicPlanDraftV1 } from '@ops/backend-deterministic-plan';
import type { SavedSkillReviewIssueDto } from './saved-skill.dto';
import {
  sanitizeSavedSkillInput,
  type SanitizedSavedSkillInput,
} from './saved-skill-input-sanitizer';

const UNSAFE_PATH_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

/**
 * Builds the minimum execution input needed to replay a frozen plan.
 *
 * Literal values are already part of the plan snapshot, node outputs are
 * produced at runtime, and runtime defaults belong to the target capability.
 * Only paths explicitly referenced by user_input bindings are external replay
 * parameters and may therefore be copied into a saved workflow version.
 */
export const projectSavedSkillFixedInput = (
  plan: DeterministicPlanDraftV1,
  executionInput: unknown
): SanitizedSavedSkillInput => {
  const projectionIssues: SavedSkillReviewIssueDto[] = [];
  const input = isRecord(executionInput) ? executionInput : {};
  const paths = collectUserInputPaths(plan);
  let projected: Record<string, unknown> = {};

  for (const path of paths) {
    const segments = normalizePath(path);
    if (!segments) {
      projectionIssues.push({
        code: 'INVALID_USER_INPUT_PATH',
        severity: 'error',
        path,
        message: `冻结计划包含无效的用户输入路径 ${path || '(empty)'}。`,
      });
      continue;
    }
    if (segments.length === 0) {
      projected = { ...input };
      continue;
    }

    const resolved = getOwnValueByPath(input, segments);
    if (!resolved.found || resolved.value === undefined) {
      projectionIssues.push({
        code: 'REFERENCED_USER_INPUT_MISSING',
        severity: 'warning',
        path: `$.${segments.join('.')}`,
        message: `用户输入中未找到冻结计划引用的参数 ${segments.join('.')}，未将其固化。`,
      });
      continue;
    }
    setValueByPath(projected, segments, resolved.value);
  }

  const sanitized = sanitizeSavedSkillInput(projected);
  return {
    ...sanitized,
    issues: [...projectionIssues, ...sanitized.issues],
  };
};

/** Produces a user-facing view of values already frozen into each plan node. */
export const projectSavedSkillStepInputs = (
  plan: DeterministicPlanDraftV1,
  executionInput: unknown
): Array<{
  nodeId: string;
  sequence: number;
  title: string;
  parameters: Record<string, unknown>;
}> => {
  const input = isRecord(executionInput) ? executionInput : {};
  return (plan.nodes || [])
    .map((node) => {
      const parameters: Record<string, unknown> = {};
      for (const [field, binding] of Object.entries(node.inputBindings || {})) {
        if (binding?.source === 'literal') {
          parameters[field] = binding.value;
          continue;
        }
        if (binding?.source !== 'user_input') continue;
        const segments = normalizePath(binding.path);
        if (!segments) continue;
        const resolved =
          segments.length === 0
            ? { found: true, value: input }
            : getOwnValueByPath(input, segments);
        if (resolved.found && resolved.value !== undefined) {
          parameters[field] = resolved.value;
        }
      }
      const sanitized = sanitizeSavedSkillInput(parameters).value;
      return {
        nodeId: node.nodeId,
        sequence: node.sequence,
        title: node.title,
        parameters: sanitized,
      };
    })
    .filter((node) => Object.keys(node.parameters).length > 0);
};

const collectUserInputPaths = (plan: DeterministicPlanDraftV1): string[] => {
  const paths = new Set<string>();
  for (const node of plan.nodes || []) {
    for (const binding of Object.values(node.inputBindings || {})) {
      if (binding?.source === 'user_input') {
        paths.add(binding.path);
      }
    }
  }
  return [...paths].sort((left, right) => pathDepth(left) - pathDepth(right));
};

const normalizePath = (path: string): string[] | null => {
  if (typeof path !== 'string') return null;
  const normalized = path.trim().replace(/^\$\.?/, '');
  if (!normalized) return [];
  const segments = normalized.split('.');
  if (
    segments.some(
      (segment) => !segment || UNSAFE_PATH_SEGMENTS.has(segment)
    )
  ) {
    return null;
  }
  return segments;
};

const pathDepth = (path: string): number => normalizePath(path)?.length ?? Number.MAX_SAFE_INTEGER;

const getOwnValueByPath = (
  input: Record<string, unknown>,
  segments: string[]
): { found: boolean; value?: unknown } => {
  let current: unknown = input;
  for (const segment of segments) {
    if ((!isRecord(current) && !Array.isArray(current)) || !hasOwn(current, segment)) {
      return { found: false };
    }
    current = current[segment as keyof typeof current];
  }
  return { found: true, value: current };
};

const setValueByPath = (
  target: Record<string, unknown>,
  segments: string[],
  value: unknown
): void => {
  let current: object = target;
  segments.forEach((segment, index) => {
    if (index === segments.length - 1) {
      Reflect.set(current, segment, value);
      return;
    }
    const nextSegment = segments[index + 1];
    const existing = Reflect.get(current, segment) as unknown;
    if (!isRecord(existing) && !Array.isArray(existing)) {
      Reflect.set(current, segment, /^\d+$/.test(nextSegment) ? [] : {});
    }
    current = Reflect.get(current, segment) as object;
  });
};

const hasOwn = (value: object, key: string): boolean =>
  Boolean(Object.prototype.hasOwnProperty.call(value, key));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
