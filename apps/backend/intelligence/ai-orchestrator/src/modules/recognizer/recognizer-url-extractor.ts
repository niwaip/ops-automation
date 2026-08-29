const stripTrailingSentencePunctuation = (value: string): string =>
  value.replace(/[，。！？；：、,;!）)】\]}]+$/u, '');

const validateHttpUrl = (value: string): string | undefined => {
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
      return undefined;
    }
    return value;
  } catch {
    return undefined;
  }
};

/**
 * Extract an explicit web address without attempting to reverse display-name slugs.
 * Slug forms such as `https_example_com_path` are intentionally rejected because
 * underscores do not preserve the boundary between host labels and path segments.
 */
export const extractUrlFromInput = (userInput: string): string | undefined => {
  const input = String(userInput || '').trim();
  if (!input) {
    return undefined;
  }

  const directMatch = input.match(/https?:\/\/[^\s"'<>]+/iu);
  if (directMatch?.[0]) {
    const candidate = stripTrailingSentencePunctuation(directMatch[0]);
    return validateHttpUrl(candidate);
  }

  const domainMatch = input.match(
    /(?:^|[^a-zA-Z0-9@._-])((?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}(?::\d{1,5})?(?:[/?#][^\s"'<>]*)?)/u
  );
  if (!domainMatch?.[1]) {
    return undefined;
  }

  const candidate = `https://${stripTrailingSentencePunctuation(domainMatch[1])}`;
  return validateHttpUrl(candidate);
};
