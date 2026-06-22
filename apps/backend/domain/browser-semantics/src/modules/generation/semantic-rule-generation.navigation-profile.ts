const NAVIGATION_PROFILE_TYPE = 'navigation_target';

type NavigationProfileDraftSource = {
  sampleText?: string | null;
  errorMessage?: string | null;
  observationSummary?: string | null;
  pageUrl?: string | null;
  normalizedSemantic?: unknown;
  parserOutput?: unknown;
};

const NAVIGATION_INTENT_CANDIDATES = [
  '打开',
  '访问',
  '前往',
  '进入',
  'go to',
  'goto',
  'open',
  'navigate',
  'visit',
] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function collectSourceTexts(sources: NavigationProfileDraftSource[]): string[] {
  return sources
    .flatMap((source) => [source.sampleText, source.errorMessage, source.observationSummary])
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
}

function getNavigationMetadata(source: NavigationProfileDraftSource): Record<string, unknown> | null {
  const normalizedSemantic = asRecord(source.normalizedSemantic);
  const parserOutput = asRecord(source.parserOutput);
  const normalizedNavigation = asRecord(asRecord(normalizedSemantic?.parser_metadata)?.navigation);
  const parserNavigation = asRecord(asRecord(parserOutput?.metadata)?.navigation);
  return normalizedNavigation || parserNavigation;
}

function sanitizeTerm(value: string): string {
  return value
    .trim()
    .replace(/^[“"'`]+|[”"'`]+$/g, '')
    .replace(/\s+/g, ' ');
}

function looksLikeExplicitUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) || /^[\w.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(value);
}

function looksLikeRelativePath(value: string): boolean {
  return /^[#/?][^\s]+$/.test(value.trim());
}

function extractTargetFromSampleText(sampleText: string): string | null {
  const match = sampleText.match(
    /^(?:打开|访问|前往|进入|go\s*to|goto|open|navigate|visit)\s+(.+)$/i
  );
  if (!match?.[1]) {
    return null;
  }

  const target = sanitizeTerm(match[1]).replace(/\s*(?:页面|页|界面|入口|模块|菜单)$/i, '').trim();
  if (!target || looksLikeExplicitUrl(target) || looksLikeRelativePath(target)) {
    return null;
  }
  if (/^(?:详情|详细|明细|详情页|详细页)$/i.test(target)) {
    return null;
  }

  return target;
}

function extractExplicitUrlOrPath(text: string): string | null {
  const explicitUrl = text.match(/https?:\/\/[^\s"'）)]+/i)?.[0];
  if (explicitUrl) {
    return explicitUrl;
  }

  const relativePath = text.match(/(?:^|\s)([#/][^\s"'）)]+)/)?.[1];
  if (relativePath) {
    return relativePath;
  }

  return null;
}

function inferLocaleHints(sourceTexts: string[]): string[] {
  const joined = sourceTexts.join(' ');
  const hints: string[] = [];

  if (/[\u4e00-\u9fff]/.test(joined)) {
    hints.push('zh-CN');
  }

  if (/[a-z]/i.test(joined)) {
    hints.push('en-US');
  }

  return hints;
}

function toRelativePathIfSameOrigin(
  resolvedUrl: string,
  pageUrl?: string | null
): { destinationPath?: string; destinationUrl?: string } {
  try {
    const destination = new URL(resolvedUrl);
    if (pageUrl) {
      const current = new URL(pageUrl);
      if (destination.origin === current.origin) {
        return {
          destinationPath: `${destination.pathname}${destination.search}${destination.hash}` || '/',
        };
      }
    }
    return { destinationUrl: destination.toString() };
  } catch {
    return { destinationUrl: resolvedUrl };
  }
}

export function buildNavigationProfileDraftOutputs(input: {
  sources: NavigationProfileDraftSource[];
}): Record<string, unknown> | null {
  const sourceTexts = collectSourceTexts(input.sources);
  const metadataEntries = input.sources
    .map((source) => ({
      source,
      metadata: getNavigationMetadata(source),
    }))
    .filter((item): item is { source: NavigationProfileDraftSource; metadata: Record<string, unknown> } =>
      Boolean(item.metadata)
    );

  const targetTerms = unique(
    [
      ...metadataEntries
        .map((item) => item.metadata.resolvedTarget)
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .map(sanitizeTerm),
      ...sourceTexts
        .map((text) => extractTargetFromSampleText(text))
        .filter((value): value is string => Boolean(value)),
    ].filter((value) => value.length > 0)
  );

  const intentTerms = NAVIGATION_INTENT_CANDIDATES.filter((candidate) =>
    sourceTexts.some((text) => normalizeText(text).includes(normalizeText(candidate)))
  );
  const localeHints = inferLocaleHints(sourceTexts);

  const metadataResolvedUrl = metadataEntries.find(
    (item) => typeof item.metadata.resolvedUrl === 'string' && item.metadata.resolvedUrl.trim().length > 0
  );
  const explicitUrlOrPath = sourceTexts
    .map((text) => extractExplicitUrlOrPath(text))
    .find((value): value is string => Boolean(value));

  let destinationUrl: string | undefined;
  let destinationPath: string | undefined;

  if (metadataResolvedUrl && typeof metadataResolvedUrl.metadata.resolvedUrl === 'string') {
    const resolved = toRelativePathIfSameOrigin(
      metadataResolvedUrl.metadata.resolvedUrl,
      metadataResolvedUrl.source.pageUrl
    );
    destinationUrl = resolved.destinationUrl;
    destinationPath = resolved.destinationPath;
  } else if (explicitUrlOrPath) {
    if (looksLikeRelativePath(explicitUrlOrPath)) {
      destinationPath = explicitUrlOrPath;
    } else {
      destinationUrl = explicitUrlOrPath;
    }
  }

  if (targetTerms.length === 0 || (!destinationUrl && !destinationPath)) {
    return null;
  }

  const outputs: Record<string, unknown> = {
    profile_type: NAVIGATION_PROFILE_TYPE,
    target_terms: targetTerms,
  };

  if (destinationUrl) {
    outputs.destination_url = destinationUrl;
  }
  if (destinationPath) {
    outputs.destination_path = destinationPath;
  }
  if (intentTerms.length) {
    outputs.intent_terms = intentTerms;
  }
  if (localeHints.length) {
    outputs.locale_hints = localeHints;
  }

  return outputs;
}
