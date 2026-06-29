export function buildStudioSkillGuideSuggestionKey(suggestion: any): string | null {
  const candidates = [
    suggestion?.id,
    suggestion?.suggestedName,
    suggestion?.details?.variableName,
    suggestion?.details?.arrayPath,
    suggestion?.variablePath,
  ];

  for (const candidate of candidates) {
    const normalized = String(candidate || '').trim();
    if (normalized) {
      return normalized;
    }
  }

  const originalText = String(suggestion?.originalText || '').trim();
  const elementPath = String(suggestion?.elementPath || '').trim();
  if (originalText || elementPath) {
    return `${suggestion?.type || 'variable'}:${originalText}:${elementPath}`;
  }

  return null;
}

export function mergeStudioSkillGuideSuggestions(
  cachedSuggestions?: any[],
  incomingSuggestions?: any[]
): any[] {
  const merged = new Map<string, any>();

  const upsertSuggestion = (suggestion: any) => {
    if (!suggestion || typeof suggestion !== 'object') {
      return;
    }

    const key = buildStudioSkillGuideSuggestionKey(suggestion);
    if (!key) {
      return;
    }

    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, suggestion);
      return;
    }

    merged.set(key, {
      ...existing,
      ...suggestion,
      details: {
        ...(existing.details || {}),
        ...(suggestion.details || {}),
      },
      applied: Boolean(existing.applied || suggestion.applied),
    });
  };

  for (const suggestion of Array.isArray(cachedSuggestions) ? cachedSuggestions : []) {
    upsertSuggestion(suggestion);
  }

  for (const suggestion of Array.isArray(incomingSuggestions) ? incomingSuggestions : []) {
    upsertSuggestion(suggestion);
  }

  return Array.from(merged.values());
}

export function mergeStudioSkillGuideTemplateConfig(
  cachedTemplateConfig?: any,
  incomingTemplateConfig?: any
): any {
  const cachedConfig =
    cachedTemplateConfig && typeof cachedTemplateConfig === 'object' ? cachedTemplateConfig : {};
  const incomingConfig =
    incomingTemplateConfig && typeof incomingTemplateConfig === 'object'
      ? incomingTemplateConfig
      : {};

  return {
    ...cachedConfig,
    ...incomingConfig,
  };
}
