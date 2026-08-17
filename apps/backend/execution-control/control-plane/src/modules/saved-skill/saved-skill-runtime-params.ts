import type { DeterministicPlanDraftV1 } from '@ops/backend-deterministic-plan';

interface SavedSkillRuntimeParam {
  key: string;
  nodeId: string;
  sequence: number;
  nodeTitle: string;
  field: string;
  source: 'literal' | 'user_input';
  sourcePath?: string;
  defaultValue: unknown;
}

export interface ConfiguredSavedSkillExecution {
  planSnapshot: DeterministicPlanDraftV1;
  executionInput: Record<string, unknown>;
  unknownOverrideKeys: string[];
}

/**
 * Builds the editable parameter contract for one saved workflow version.
 * Upstream node outputs and runtime defaults are intentionally excluded.
 */
export const buildSavedSkillRuntimeParamsSchema = (
  plan: DeterministicPlanDraftV1,
  fixedInput: Record<string, unknown>
): Record<string, unknown> => {
  const params = describeRuntimeParams(plan, fixedInput);
  return {
    type: 'object',
    properties: Object.fromEntries(
      params.map((param) => [
        param.key,
        {
          type: inferJsonType(param.defaultValue),
          description: `第 ${param.sequence} 步 · ${param.nodeTitle} / ${param.field}`,
          default: param.defaultValue,
          'x-workflow-node-id': param.nodeId,
          'x-workflow-field': param.field,
          'x-workflow-binding-source': param.source,
        },
      ])
    ),
    required: [],
    additionalProperties: false,
  };
};

/**
 * Specializes an immutable saved plan for one run without invoking Planner.
 * Editable literals become user_input bindings so the execution input records
 * the exact values used by immediate and scheduled runs.
 */
export const configureSavedSkillExecution = (
  plan: DeterministicPlanDraftV1,
  fixedInput: Record<string, unknown>,
  overrides: Record<string, unknown>
): ConfiguredSavedSkillExecution => {
  const planSnapshot = cloneJson(plan);
  const executionInput = cloneJson(fixedInput);
  const params = describeRuntimeParams(planSnapshot, fixedInput);
  const paramKeys = new Set(params.map((param) => param.key));
  const directUserInputRoots = collectDirectUserInputRoots(params);
  const unknownOverrideKeys = Object.keys(overrides).filter(
    (key) => !paramKeys.has(key) && !directUserInputRoots.has(key)
  );

  // Compatibility for previously stored schedules whose input_json used the
  // original nested user_input shape instead of editable parameter keys.
  for (const root of directUserInputRoots) {
    if (hasOwn(overrides, root)) {
      executionInput[root] = cloneJson(overrides[root]);
    }
  }

  const nodesById = new Map(planSnapshot.nodes.map((node) => [node.nodeId, node]));
  for (const param of params) {
    const directUserInputOverride =
      param.source === 'user_input'
        ? getValueByPath(overrides, param.sourcePath || '')
        : undefined;
    const value = hasOwn(overrides, param.key)
      ? overrides[param.key]
      : directUserInputOverride !== undefined
        ? directUserInputOverride
        : param.defaultValue;
    if (value === undefined) continue;

    if (param.source === 'literal') {
      executionInput[param.key] = cloneJson(value);
      const node = nodesById.get(param.nodeId);
      if (node) {
        node.inputBindings[param.field] = {
          source: 'user_input',
          path: param.key,
        };
      }
      continue;
    }

    const pathSegments = normalizePath(param.sourcePath || '');
    if (pathSegments) {
      setValueByPath(executionInput, pathSegments, cloneJson(value));
    }
  }

  return { planSnapshot, executionInput, unknownOverrideKeys };
};

const describeRuntimeParams = (
  plan: DeterministicPlanDraftV1,
  fixedInput: Record<string, unknown>
): SavedSkillRuntimeParam[] => {
  const candidates: Array<Omit<SavedSkillRuntimeParam, 'key'>> = [];
  const seenUserInputPaths = new Set<string>();

  for (const node of [...(plan.nodes || [])].sort((left, right) => left.sequence - right.sequence)) {
    for (const [field, binding] of Object.entries(node.inputBindings || {})) {
      if (binding?.source === 'literal') {
        candidates.push({
          nodeId: node.nodeId,
          sequence: node.sequence,
          nodeTitle: node.title,
          field,
          source: 'literal',
          defaultValue: binding.value,
        });
        continue;
      }
      if (binding?.source !== 'user_input' || seenUserInputPaths.has(binding.path)) continue;
      seenUserInputPaths.add(binding.path);
      candidates.push({
        nodeId: node.nodeId,
        sequence: node.sequence,
        nodeTitle: node.title,
        field,
        source: 'user_input',
        sourcePath: binding.path,
        defaultValue: getValueByPath(fixedInput, binding.path),
      });
    }
  }

  const fieldCounts = new Map<string, number>();
  candidates.forEach((candidate) => {
    fieldCounts.set(candidate.field, (fieldCounts.get(candidate.field) || 0) + 1);
  });
  const usedKeys = new Set<string>();
  return candidates.map((candidate) => {
    const preferredKey =
      fieldCounts.get(candidate.field) === 1 && isSafePathSegment(candidate.field)
        ? candidate.field
        : `step${candidate.sequence}__${toSafeKey(candidate.field)}`;
    const key = makeUniqueKey(preferredKey, usedKeys);
    usedKeys.add(key);
    return { ...candidate, key };
  });
};

const collectDirectUserInputRoots = (params: SavedSkillRuntimeParam[]): Set<string> => {
  const roots = new Set<string>();
  params.forEach((param) => {
    if (param.source !== 'user_input') return;
    const segments = normalizePath(param.sourcePath || '');
    if (segments?.[0]) roots.add(segments[0]);
  });
  return roots;
};

const getValueByPath = (input: Record<string, unknown>, path: string): unknown => {
  const segments = normalizePath(path);
  if (!segments) return undefined;
  if (segments.length === 0) return input;
  let current: unknown = input;
  for (const segment of segments) {
    if ((!isRecord(current) && !Array.isArray(current)) || !hasOwn(current, segment)) {
      return undefined;
    }
    current = Reflect.get(current, segment) as unknown;
  }
  return current;
};

const setValueByPath = (
  target: Record<string, unknown>,
  segments: string[],
  value: unknown
): void => {
  if (segments.length === 0) {
    if (isRecord(value)) Object.assign(target, value);
    return;
  }
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

const normalizePath = (path: string): string[] | null => {
  if (typeof path !== 'string') return null;
  const normalized = path.trim().replace(/^\$\.?/, '');
  if (!normalized) return [];
  const segments = normalized.split('.');
  return segments.every(isSafePathSegment) ? segments : null;
};

const isSafePathSegment = (value: string): boolean =>
  Boolean(value) && !['__proto__', 'prototype', 'constructor'].includes(value) && !value.includes('.');

const toSafeKey = (value: string): string => {
  const normalized = value.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^_+/, '');
  return normalized || 'parameter';
};

const makeUniqueKey = (preferred: string, usedKeys: Set<string>): string => {
  if (!usedKeys.has(preferred)) return preferred;
  let suffix = 2;
  while (usedKeys.has(`${preferred}__${suffix}`)) suffix += 1;
  return `${preferred}__${suffix}`;
};

const inferJsonType = (value: unknown): string => {
  if (Array.isArray(value)) return 'array';
  if (isRecord(value)) return 'object';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'string';
};

const cloneJson = <T>(value: T): T => {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
};

const hasOwn = (value: object, key: string): boolean =>
  Boolean(Object.prototype.hasOwnProperty.call(value, key));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
