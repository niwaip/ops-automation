const MACHINE_LIKE_LABEL_PATTERN = /^[A-Za-z0-9_.\[\]-]+$/;

const PURPOSE_PREFIX_PATTERNS = [
  /^用于(?:渲染|规定|约定|配置|控制|生成|填写|展示|补充|说明|确定)?/u,
  /^用来(?:渲染|规定|约定|配置|控制|生成|填写|展示|补充|说明|确定)?/u,
];

const CONTEXT_PREFIX_PATTERNS = [
  /^合同文本中的/u,
  /^合同文本里(?:的)?/u,
  /^合同中约定(?:的)?/u,
  /^合同中(?:的)?/u,
  /^文档中的/u,
  /^文档里(?:的)?/u,
  /^模板中的/u,
  /^模板里(?:的)?/u,
];

const CONTEXT_SUFFIX_PATTERNS = [/占位符$/u];

const stripFriendlyInputLabelBoilerplate = (label: string): string => {
  let normalized = String(label || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) {
    return '';
  }

  PURPOSE_PREFIX_PATTERNS.forEach((pattern) => {
    normalized = normalized.replace(pattern, '').trim();
  });

  CONTEXT_PREFIX_PATTERNS.forEach((pattern) => {
    normalized = normalized.replace(pattern, '').trim();
  });

  CONTEXT_SUFFIX_PATTERNS.forEach((pattern) => {
    normalized = normalized.replace(pattern, '').trim();
  });

  return (
    normalized ||
    String(label || '')
      .replace(/\s+/g, ' ')
      .trim()
  );
};

export const deriveFriendlyInputLabel = (
  description?: string,
  maxLength = 32
): string | undefined => {
  const normalized = String(description || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) {
    return undefined;
  }

  const concise = stripFriendlyInputLabelBoilerplate(
    normalized.split(/[，,；;。:：]/)[0]?.trim() || ''
  );
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
