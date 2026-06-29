export function stripMarkdownCodeFences(content: string): string {
  return String(content || '')
    .replace(/```json\s*/gi, '')
    .replace(/```javascript\s*/gi, '')
    .replace(/```js\s*/gi, '')
    .replace(/```\s*/g, '')
    .replace(/^\s*json\s*/i, '')
    .trim();
}

export function stringifyAiResponse(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (content == null) {
    return '';
  }

  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}

export function tryParseJsonValue(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return undefined;
  }
}

export function stripJsonLikeComments(content: string): string {
  let result = '';
  let inString = false;
  let escaped = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const nextChar = content[index + 1];

    if (escaped) {
      result += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      result += char;
      escaped = true;
      continue;
    }

    if (char === '"') {
      result += char;
      inString = !inString;
      continue;
    }

    if (!inString && char === '/' && nextChar === '/') {
      index += 2;
      while (index < content.length && content[index] !== '\n') {
        index += 1;
      }
      if (index < content.length) {
        result += '\n';
      }
      continue;
    }

    if (!inString && char === '/' && nextChar === '*') {
      index += 2;
      while (
        index < content.length - 1 &&
        !(content[index] === '*' && content[index + 1] === '/')
      ) {
        index += 1;
      }
      index += 1;
      continue;
    }

    result += char;
  }

  return result;
}

export function removeTrailingCommas(content: string): string {
  let result = '';
  let inString = false;
  let escaped = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];

    if (escaped) {
      result += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      result += char;
      escaped = true;
      continue;
    }

    if (char === '"') {
      result += char;
      inString = !inString;
      continue;
    }

    if (!inString && char === ',') {
      let lookahead = index + 1;
      while (lookahead < content.length && /\s/.test(content[lookahead])) {
        lookahead += 1;
      }
      if (content[lookahead] === '}' || content[lookahead] === ']') {
        continue;
      }
    }

    result += char;
  }

  return result;
}

export function extractFirstBalancedJsonObject(content: string): string | null {
  const text = String(content || '');
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === '{') {
      if (start < 0) {
        start = index;
      }
      depth += 1;
      continue;
    }

    if (char === '}') {
      if (depth > 0) {
        depth -= 1;
        if (depth === 0 && start >= 0) {
          return text.slice(start, index + 1);
        }
      }
    }
  }

  return null;
}

export function extractJsonCandidate(content: string): string | null {
  const fencedMatch = String(content || '').match(/```(?:json|javascript|js)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]?.trim()) {
    return fencedMatch[1].trim();
  }

  return extractFirstBalancedJsonObject(content);
}

export function normalizeJsonLikeText(content: string): string {
  const withoutFences = stripMarkdownCodeFences(String(content || ''))
    .replace(/^\uFEFF/, '')
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");

  const withoutComments = stripJsonLikeComments(withoutFences);
  return removeTrailingCommas(withoutComments).trim();
}

export function tryNormalizeGeneratedParameters(content: unknown): unknown {
  if (content && typeof content === 'object' && !Array.isArray(content)) {
    return content;
  }

  const text = stringifyAiResponse(content);
  if (!text.trim()) {
    return undefined;
  }

  const direct = tryParseJsonValue(normalizeJsonLikeText(text));
  if (direct !== undefined) {
    return direct;
  }

  const extracted = extractJsonCandidate(text);
  if (!extracted) {
    return undefined;
  }

  return tryParseJsonValue(normalizeJsonLikeText(extracted));
}
