/**
 * Helper utilities for repairing and extracting JSON from LLM responses.
 *
 * LLMs (especially local or quantized models) often output malformed JSON:
 * - Duplicate leading braces: `{{...}` or `{{...}}`
 * - Unclosed braces at token limit: `{"key": "value"`
 * - Trailing commas: `{"key": "value",}`
 * - Markdown fences or text surrounds
 */

export function tryParseOrRepairJson(raw: string): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  // 1. Direct parse attempt
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    // Continue to repairs
  }

  // 2. Strip leading redundant open braces: e.g. {{...} or {{...}}
  let candidate = trimmed;
  if (/^\s*\{+\s*\{/.test(candidate)) {
    const stripped = candidate.replace(/^\s*\{+\s*(\{[\s\S]*)/, '$1');
    try {
      JSON.parse(stripped);
      return stripped;
    } catch {
      candidate = stripped;
    }
  }

  // 3. Remove trailing redundant '}' if candidate has more closing braces than opening
  if (/\}\s*\}+$/.test(candidate)) {
    const strippedEnd = candidate.replace(/(\}[\s\S]*?)\}+\s*$/, '$1');
    try {
      JSON.parse(strippedEnd);
      return strippedEnd;
    } catch {
      // continue
    }
  }

  // 4. Trailing commas before '}' or ']'
  const trailingCommaFixed = candidate.replace(/,\s*([}\]])/g, '$1');
  try {
    JSON.parse(trailingCommaFixed);
    return trailingCommaFixed;
  } catch {
    // continue
  }

  // 5. Unbalanced braces: append missing closing braces if opened
  let openCount = 0;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < candidate.length; i++) {
    const c = candidate[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') openCount++;
    else if (c === '}') openCount--;
  }

  if (openCount > 0) {
    const closed = candidate + '}'.repeat(openCount);
    try {
      JSON.parse(closed);
      return closed;
    } catch {
      const fixedClosed = closed.replace(/,\s*([}\]])/g, '$1');
      try {
        JSON.parse(fixedClosed);
        return fixedClosed;
      } catch {
        // continue
      }
    }
  }

  return undefined;
}

export function extractJsonCandidate(response: string): string | undefined {
  if (!response || typeof response !== 'string') return undefined;

  const fencedMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]?.trim()) {
    const repaired = tryParseOrRepairJson(fencedMatch[1].trim());
    if (repaired) return repaired;
  }

  const candidates: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < response.length; index += 1) {
    const char = response[index]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }
    if (char === '}' && depth > 0) {
      depth -= 1;
      if (start >= 0) {
        const candidate = response.slice(start, index + 1);
        const repaired = tryParseOrRepairJson(candidate);
        if (repaired) {
          candidates.push(repaired);
          if (depth === 0) {
            start = -1;
          }
        } else if (depth === 0) {
          start = -1;
        }
      }
    }
  }

  // If depth never returned to 0 (e.g. unclosed JSON at end of text)
  if (start >= 0 && depth > 0) {
    const unclosed = response.slice(start);
    const repaired = tryParseOrRepairJson(unclosed);
    if (repaired) {
      candidates.push(repaired);
    }
  }

  if (candidates.length > 0) {
    return candidates.at(-1);
  }

  return tryParseOrRepairJson(response);
}
