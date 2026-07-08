export const parseMessageContent = (content: string): { thoughts: string[]; answer: string } => {
  const thoughts: string[] = [];
  let answer = content;
  const thinkTagRegex = /<think>([\s\S]*?)(?:<\/think>|$)/gi;

  // Legacy fallback for older assistant text payloads. This duplicate parser
  // can be removed after all backends emit dedicated thought/action/
  // observation events and user-web fully switches to those fields.
  const thoughtRegex = /【思考】([^\n]*(?:\n(?!【)[^\n]*)*)/g;
  const actionRegex = /【行动】([^\n]*(?:\n(?!【)[^\n]*)*)/g;
  const observationRegex = /【观察】([^\n]*(?:\n(?!【)[^\n]*)*)/g;

  let match: RegExpExecArray | null;
  while ((match = thinkTagRegex.exec(content)) !== null) {
    if (match[1]?.trim()) {
      thoughts.push(match[1].trim());
    }
  }
  while ((match = thoughtRegex.exec(content)) !== null) {
    if (match[1]?.trim()) {
      thoughts.push(`思考: ${match[1].trim()}`);
    }
  }
  while ((match = actionRegex.exec(content)) !== null) {
    if (match[1]?.trim()) {
      thoughts.push(`行动: ${match[1].trim()}`);
    }
  }

  answer = content
    .replace(thinkTagRegex, '')
    .replace(/<\/?think>/gi, '')
    .replace(thoughtRegex, '')
    .replace(actionRegex, '')
    .trim();

  if (!answer) {
    const observations = [...content.matchAll(observationRegex)]
      .map((item) => item[1]?.trim())
      .filter((item): item is string => Boolean(item));
    answer = observations.join('\n\n');
  }

  return { thoughts, answer };
};

export const summarizeThoughts = (thoughts: string[]): string | undefined => {
  const lastMeaningfulThought = [...thoughts]
    .reverse()
    .map((item) => item.trim())
    .find(Boolean);

  if (!lastMeaningfulThought) {
    return undefined;
  }

  const normalized = lastMeaningfulThought.replace(/^(思考|行动)\s*:\s*/u, '').trim();
  if (!normalized) {
    return undefined;
  }

  return normalized.length > 140 ? `${normalized.slice(0, 140).trim()}...` : normalized;
};
