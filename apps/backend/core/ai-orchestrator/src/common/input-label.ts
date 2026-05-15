const MACHINE_LIKE_LABEL_PATTERN = /^[A-Za-z0-9_.\[\]-]+$/;

export const deriveFriendlyInputLabel = (
  description?: string,
  maxLength = 32,
): string | undefined => {
  const normalized = String(description || '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return undefined;
  }

  const concise = normalized.split(/[，,；;。:：]/)[0]?.trim();
  if (!concise) {
    return undefined;
  }

  return concise.length > maxLength ? `${concise.slice(0, maxLength).trim()}...` : concise;
};

export const isMachineLikeInputLabel = (label: string, fieldName: string): boolean => {
  const normalized = label.trim();
  if (!normalized) {
    return true;
  }
  if (normalized === fieldName) {
    return true;
  }
  return MACHINE_LIKE_LABEL_PATTERN.test(normalized);
};

export const resolveFriendlyInputDisplayName = (input: {
  name: string;
  display_name?: string;
  description?: string;
}): string => {
  const displayName = String(input.display_name || '').trim();
  if (displayName && !isMachineLikeInputLabel(displayName, input.name)) {
    return displayName;
  }

  const concise = deriveFriendlyInputLabel(input.description);
  if (concise) {
    return concise;
  }

  return displayName || input.name;
};
