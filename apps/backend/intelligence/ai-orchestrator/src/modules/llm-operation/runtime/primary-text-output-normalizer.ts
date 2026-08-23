const MAX_TRAVERSAL_DEPTH = 6;
const MAX_STRING_CANDIDATES = 32;

const IGNORED_KEYS = new Set([
  'analysis',
  'finish_reason',
  'id',
  'model',
  'reasoning',
  'role',
  'status',
  'thinking',
  'thought',
  'type',
  'usage',
]);

const CONTENT_KEY_SCORES: Record<string, number> = {
  answer: 900,
  content: 850,
  final_answer: 920,
  finalanswer: 920,
  markdown_content: 820,
  message: 700,
  output: 760,
  response: 760,
  result: 760,
  summary: 820,
  text: 840,
};

interface TextCandidate {
  value: string;
  score: number;
}

function normalizeKey(key: string): string {
  return key.replace(/[-\s]/g, '_').toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function scoreTerminalKey(key: string, primaryOutput: string): number {
  const normalized = normalizeKey(key);
  if (normalized === normalizeKey(primaryOutput)) return 1000;
  return CONTENT_KEY_SCORES[normalized] ?? 100;
}

function collectTextCandidates(
  value: unknown,
  primaryOutput: string,
  depth: number,
  terminalKey: string,
  candidates: TextCandidate[]
): void {
  if (depth > MAX_TRAVERSAL_DEPTH || candidates.length >= MAX_STRING_CANDIDATES) return;

  if (typeof value === 'string') {
    const cleaned = value.trim();
    if (cleaned) {
      candidates.push({
        value: cleaned,
        score: scoreTerminalKey(terminalKey, primaryOutput),
      });
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectTextCandidates(item, primaryOutput, depth + 1, terminalKey, candidates);
      if (candidates.length >= MAX_STRING_CANDIDATES) return;
    }
    return;
  }

  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (IGNORED_KEYS.has(normalizeKey(key))) continue;
    collectTextCandidates(child, primaryOutput, depth + 1, key, candidates);
    if (candidates.length >= MAX_STRING_CANDIDATES) return;
  }
}

/**
 * Extracts one deterministic business-text value from provider-specific model
 * response shapes. It intentionally fails closed when equally plausible values
 * disagree, so protocol normalization never guesses business meaning.
 */
export function resolvePrimaryTextValue(value: unknown, primaryOutput: string): string | undefined {
  if (typeof value === 'string') {
    const cleaned = value.trim();
    return cleaned || undefined;
  }

  if (isRecord(value)) {
    const declaredValue = value[primaryOutput];
    if (typeof declaredValue === 'string' && declaredValue.trim()) {
      return declaredValue.trim();
    }
  }

  const candidates: TextCandidate[] = [];
  collectTextCandidates(value, primaryOutput, 0, primaryOutput, candidates);
  if (candidates.length === 0) return undefined;

  const highestScore = Math.max(...candidates.map((candidate) => candidate.score));
  const highestValues = [
    ...new Set(
      candidates
        .filter((candidate) => candidate.score === highestScore)
        .map((candidate) => candidate.value)
    ),
  ];
  return highestValues.length === 1 ? highestValues[0] : undefined;
}

export function stripModelThinking(rawText: string): string {
  return (rawText || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

/**
 * Compatibility helper for the legacy registry runtime. The V2 runtime parses
 * JSON separately and applies the same value resolver before schema validation.
 */
export function resolvePrimaryTextFromRaw(
  rawText: string,
  primaryOutput: string
): string | undefined {
  const cleaned = stripModelThinking(rawText);
  if (!cleaned) return undefined;

  const candidates = [cleaned];
  const codeBlock = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (codeBlock) candidates.push(codeBlock);
  const jsonObject = cleaned.match(/\{[\s\S]*\}/)?.[0]?.trim();
  if (jsonObject) candidates.push(jsonObject);

  let parsedStructuredOutput = false;
  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      parsedStructuredOutput = true;
      const resolved = resolvePrimaryTextValue(parsed, primaryOutput);
      if (resolved) return resolved;
    } catch {
      // A model may return the requested body directly instead of JSON.
    }
  }
  const looksLikeBrokenStructuredOutput = /^(?:```(?:json)?\s*)?(?:\{|\[)/i.test(cleaned);
  return parsedStructuredOutput || looksLikeBrokenStructuredOutput ? undefined : cleaned;
}
