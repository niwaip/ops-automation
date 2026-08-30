export const ENUM_ALIASES_SCHEMA_KEY = 'x-enum-aliases' as const;

export interface DeterministicRoutingCapability {
  id: string;
  name: string;
  aliases?: string[];
  triggerKeywords?: string[];
}

export interface DeterministicRoutingMatch<T extends DeterministicRoutingCapability> {
  capability: T;
  matchedSignals: string[];
  confidence: number;
  reason: 'deterministic_routing_signal';
}

export interface EnumAliasProperty {
  enum?: Array<string | number>;
  [ENUM_ALIASES_SCHEMA_KEY]?: Record<string, Array<string | number>>;
}

export interface DeterministicParamResolution {
  params: Record<string, string | number>;
  fieldConfidences: Record<string, number>;
  matchedAliases: Record<string, string>;
}

const ROUTING_CONTAINER_SUFFIXES = [
  '工作流',
  '服务',
  '技能',
  '能力',
  'workflow',
  'service',
  'skill',
] as const;

const ROUTING_ACTION_SUFFIXES = [
  '查询',
  '检索',
  '搜索',
  '查找',
  '获取',
  '生成',
  '创建',
  '发送',
  '推送',
  '导出',
  '解析',
  '转换',
  'query',
  'search',
  'find',
  'get',
  'create',
  'generate',
  'send',
  'export',
  'parse',
  'convert',
] as const;

export function normalizePlanningText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\s\p{P}\p{S}_]+/gu, '');
}

export function matchDeterministicRoutingCapability<T extends DeterministicRoutingCapability>(
  userInput: string,
  capabilities: T[]
): DeterministicRoutingMatch<T> | null {
  const normalizedInput = normalizePlanningText(userInput);
  if (!normalizedInput) return null;

  const ranked = capabilities
    .map((capability) => rankCapability(normalizedInput, capability))
    .filter((candidate) => candidate.score >= 150)
    .sort((left, right) => right.score - left.score);
  const best = ranked[0];
  if (!best || (ranked[1] && best.score === ranked[1].score)) return null;

  return {
    capability: best.capability,
    matchedSignals: best.matchedSignals,
    confidence: 0.99,
    reason: 'deterministic_routing_signal',
  };
}

export function resolveDeterministicEnumParams(
  userInput: string,
  properties: Record<string, EnumAliasProperty>
): DeterministicParamResolution {
  const normalizedInput = normalizePlanningText(userInput);
  const result: DeterministicParamResolution = {
    params: {},
    fieldConfidences: {},
    matchedAliases: {},
  };

  for (const [fieldName, property] of Object.entries(properties)) {
    const candidates = buildEnumAliasCandidates(property)
      .filter((candidate) => normalizedInput.includes(candidate.normalizedAlias))
      .sort((left, right) => right.normalizedAlias.length - left.normalizedAlias.length);
    const best = candidates[0];
    if (!best) continue;
    const equallySpecificValues = new Set(
      candidates
        .filter((candidate) => candidate.normalizedAlias.length === best.normalizedAlias.length)
        .map((candidate) => String(candidate.canonicalValue))
    );
    if (equallySpecificValues.size !== 1) continue;

    result.params[fieldName] = best.canonicalValue;
    result.fieldConfidences[fieldName] = 1;
    result.matchedAliases[fieldName] = best.alias;
  }
  return result;
}

function rankCapability<T extends DeterministicRoutingCapability>(
  normalizedInput: string,
  capability: T
): { capability: T; matchedSignals: string[]; score: number } {
  // Capability IDs are stable, user-visible invocation handles. Treat an exact
  // ID mention as an explicit routing signal alongside display names/aliases so
  // prompts such as "use platform.document.pdf-create" never depend on an LLM
  // guessing the intended capability.
  const explicitSignals = [capability.id, capability.name, ...(capability.aliases || [])];
  const derivedSignals = explicitSignals.flatMap(deriveRoutingSignals);
  const triggerSignals = capability.triggerKeywords || [];
  let score = 0;
  const matchedSignals: string[] = [];

  for (const signal of [...explicitSignals, ...derivedSignals, ...triggerSignals]) {
    const normalizedSignal = normalizePlanningText(signal);
    if (!isDistinctiveSignal(normalizedSignal) || !normalizedInput.includes(normalizedSignal)) {
      continue;
    }
    matchedSignals.push(signal);
    const exact = normalizedInput === normalizedSignal;
    const explicit = explicitSignals.includes(signal);
    score = Math.max(
      score,
      (exact ? 220 : explicit ? 175 : 160) + Math.min(normalizedSignal.length, 20)
    );
  }
  return { capability, matchedSignals: [...new Set(matchedSignals)], score };
}

function deriveRoutingSignals(value: string): string[] {
  const normalized = normalizePlanningText(value);
  const signals = new Set<string>();
  value
    .split(/[\s,，。；;:：/|]+/u)
    .map(normalizePlanningText)
    .filter(isDistinctiveSignal)
    .forEach((segment) => signals.add(segment));
  let current = stripSuffixes(normalized, ROUTING_CONTAINER_SUFFIXES);
  if (current && current !== normalized) signals.add(current);
  const withoutAction = stripSuffixes(current, ROUTING_ACTION_SUFFIXES);
  if (withoutAction && withoutAction !== current) signals.add(withoutAction);
  return [...signals].filter(isDistinctiveSignal);
}

function stripSuffixes(value: string, suffixes: readonly string[]): string {
  let current = value;
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of suffixes) {
      if (current.endsWith(suffix) && current.length > suffix.length) {
        current = current.slice(0, -suffix.length);
        changed = true;
        break;
      }
    }
  }
  return current;
}

function isDistinctiveSignal(value: string): boolean {
  if (/^[a-z0-9]+$/.test(value)) return value.length >= 3;
  return value.length >= 2;
}

function buildEnumAliasCandidates(property: EnumAliasProperty): Array<{
  canonicalValue: string | number;
  alias: string;
  normalizedAlias: string;
}> {
  const allowedValues = property.enum || [];
  const allowed = new Set(allowedValues.map(String));
  const aliases = property[ENUM_ALIASES_SCHEMA_KEY] || {};
  return allowedValues.flatMap((canonicalValue) => {
    const configuredAliases = aliases[String(canonicalValue)] || [];
    return [canonicalValue, ...configuredAliases]
      .map(String)
      .map((alias) => ({
        canonicalValue,
        alias,
        normalizedAlias: normalizePlanningText(alias),
      }))
      .filter(
        (candidate) =>
          allowed.has(String(candidate.canonicalValue)) &&
          isDistinctiveSignal(candidate.normalizedAlias)
      );
  });
}
