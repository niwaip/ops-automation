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

const PLANNER_STOP_WORDS = new Set([
  '然后',
  '进行',
  '如何',
  '最后',
  '并且',
  '通过',
  '使用',
  '一下',
  '当前',
  '可以',
  '以及',
  '根据',
  '基于',
  '为了',
  '如果',
  '或者',
  '用于',
  '一个',
  '给出',
  '完成',
  '帮我',
  '请帮',
  '麻烦',
  '怎样',
  '怎么',
  '给我',
]);

export function calculateCapabilityIntentScore(
  userRequest: string,
  candidateTexts: unknown[],
): number {
  if (!userRequest) return 0;
  const request = normalizeText(userRequest);
  const compactRequest = compactText(userRequest);
  let score = 0;

  const hasUrlInRequest = /https?:\/\/[^\s]+/i.test(userRequest);

  for (const rawText of candidateTexts.flatMap(flattenTextValues)) {
    if (!rawText) continue;
    const cleanText = String(rawText).replace(/-[0-9a-f]{8}$/i, '');
    const normalized = normalizeText(cleanText);
    const compact = compactText(cleanText);
    if (!normalized || isUuid(normalized) || GENERIC_ASCII_TOKENS.has(normalized)) continue;

    if (compact.length >= 4 && compactRequest.includes(compact)) {
      score = Math.max(score, 100 + Math.min(compact.length, 30));
    } else if (
      compact.length >= 2 &&
      compact.length < 8 &&
      !PLANNER_STOP_WORDS.has(compact) &&
      compactRequest.includes(compact)
    ) {
      score += 20 * compact.length;
    }

    for (let len = Math.min(compactRequest.length, 10); len >= 2; len--) {
      for (let start = 0; start <= compactRequest.length - len; start++) {
        const sub = compactRequest.slice(start, start + len);
        if (PLANNER_STOP_WORDS.has(sub)) continue;
        if (/^[a-z0-9_-]+$/.test(sub) && len < 4) continue;
        if (compact.includes(sub)) {
          score = Math.max(score, len >= 4 ? 80 + len * 5 : 35 + len * 15);
        }
      }
    }

    for (const token of extractDistinctiveAsciiTokens(cleanText)) {
      if (request.includes(token)) score += 25;
    }

    const chineseAlias = stripGenericSuffix(compact);
    if (/^[\u3400-\u9fff]{2,}$/.test(chineseAlias) && !PLANNER_STOP_WORDS.has(chineseAlias)) {
      if (compactRequest.includes(chineseAlias)) {
        score += 40;
      }
    }

    if (
      (hasUrlInRequest ||
        compactRequest.includes('网页') ||
        compactRequest.includes('网站') ||
        compactRequest.includes('页面') ||
        compactRequest.includes('url')) &&
      (normalized.includes('url') ||
        compact.includes('网页') ||
        compact.includes('页面') ||
        compact.includes('抓取') ||
        compact.includes('链接') ||
        compact.includes('正文') ||
        compact.includes('网站'))
    ) {
      score += 60;
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
      const suffix = normalizedRequest.slice(index + alias.length).trim();
      if (
        /(?:最后|然后|并且|再)?\s*(?:用|使用|通过|调用|借助|using|use|via)\s*$/.test(prefix) ||
        /(?:最后|然后|并且|再)\s*$/.test(prefix) ||
        (suffix.length === 0 && alias.length >= 4)
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
  const expanded = text.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return Array.from(expanded.matchAll(/[a-z][a-z0-9_-]{2,}/g), (match) => match[0])
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
