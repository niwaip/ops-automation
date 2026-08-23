const GENERIC_ASCII_TOKENS = new Set([
  'api',
  'http',
  'skill',
  'service',
  'workflow',
  'flow',
  'query',
  'task',
  'tool',
  'platform',
  'builtin',
]);

const GENERIC_NAME_SUFFIXES = ['工作流', '服务', '能力', '技能'];

export function calculateCapabilityIntentScore(
  userRequest: string,
  candidateTexts: unknown[],
): number {
  const request = normalizeText(userRequest);
  const compactRequest = compactText(userRequest);
  let score = 0;

  for (const text of candidateTexts.flatMap(flattenTextValues)) {
    const normalized = normalizeText(text);
    const compact = compactText(text);
    if (!normalized || isUuid(normalized) || GENERIC_ASCII_TOKENS.has(normalized)) continue;

    if (compact.length >= 4 && compactRequest.includes(compact)) {
      score = Math.max(score, 100 + Math.min(compact.length, 30));
    }

    for (const token of extractDistinctiveAsciiTokens(normalized)) {
      if (request.includes(token)) score += 25;
    }

    const chineseAlias = stripGenericSuffix(compact);
    if (/^[\u3400-\u9fff]{2,}$/.test(chineseAlias) && compactRequest.includes(chineseAlias)) {
      score += 40;
    }
  }

  return score;
}

export function selectIntentRankedCandidates<T>(
  userRequest: string,
  candidates: T[],
  limit: number,
  getCandidateTexts: (candidate: T) => unknown[],
): T[] {
  if (candidates.length <= limit) return candidates;

  return candidates
    .map((candidate, index) => ({
      candidate,
      index,
      score: calculateCapabilityIntentScore(userRequest, getCandidateTexts(candidate)),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit)
    .map(({ candidate }) => candidate);
}

export function hasExplicitCapabilityInvocation(
  userRequest: string,
  candidateTexts: unknown[],
): boolean {
  const normalizedRequest = normalizeText(userRequest);
  const compactRequest = compactText(userRequest);

  for (const text of candidateTexts.flatMap(flattenTextValues)) {
    const normalized = normalizeText(text);
    const compact = compactText(text);
    if (!normalized || isUuid(normalized) || GENERIC_ASCII_TOKENS.has(normalized)) continue;

    if (compact.length >= 4 && compactRequest.includes(compact)) return true;

    const invocationAliases = [
      ...extractDistinctiveAsciiTokens(normalized),
      stripGenericSuffix(compact),
    ].filter((alias) => alias.length >= 2);

    for (const alias of invocationAliases) {
      const index = normalizedRequest.indexOf(alias);
      if (index < 0) continue;

      const prefix = normalizedRequest.slice(Math.max(0, index - 16), index);
      if (
        /(?:最后|然后|并且|再)?\s*(?:用|使用|通过|调用|借助|using|use|via)\s*$/.test(prefix) ||
        /(?:最后|然后|并且|再)\s*$/.test(prefix) ||
        ['bark', 'bark推送'].includes(alias)
      ) {
        return true;
      }
    }
  }

  return false;
}

function flattenTextValues(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(flattenTextValues);
  return [];
}

function extractDistinctiveAsciiTokens(text: string): string[] {
  return Array.from(text.matchAll(/[a-z][a-z0-9_-]{2,}/g), (match) => match[0])
    .filter((token) => !GENERIC_ASCII_TOKENS.has(token) && !isUuid(token));
}

function stripGenericSuffix(value: string): string {
  let result = value;
  for (const suffix of GENERIC_NAME_SUFFIXES) {
    if (result.endsWith(suffix)) result = result.slice(0, -suffix.length);
  }
  return result;
}

function normalizeText(value: string): string {
  return value.toLowerCase().trim();
}

function compactText(value: string): string {
  return normalizeText(value).replace(/[^a-z0-9\u3400-\u9fff]+/g, '');
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
