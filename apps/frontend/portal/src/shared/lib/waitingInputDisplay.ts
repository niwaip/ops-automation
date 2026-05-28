export interface WaitingInputDisplayField {
  name: string;
  description?: string;
  display_name?: string;
  group_label?: string;
}

export interface WaitingInputDisplayGroup<T> {
  label: string;
  items: T[];
}

const MACHINE_LIKE_LABEL_PATTERN = /^[A-Za-z0-9_.[-\]]+$/;
const DEFAULT_GROUP_LABEL = '其他待补信息';

export const normalizeWaitingInputDisplayLabel = (label: string): string => (
  String(label || '')
    .trim()
    .replace(/\s*[（(](?:中文|日文|日语|zh|ja|cn|jp)[）)]\s*$/iu, '')
    .replace(/[_-](?:zh|ja|cn|jp)$/iu, '')
    .trim()
);

export const resolveWaitingInputDisplayLabel = (
  field: WaitingInputDisplayField,
  fallback = '未命名信息',
): string => {
  const displayName = String(field.display_name || '').trim();
  if (displayName && displayName !== field.name && !MACHINE_LIKE_LABEL_PATTERN.test(displayName)) {
    return normalizeWaitingInputDisplayLabel(displayName);
  }

  const description = String(field.description || '').replace(/\s+/g, ' ').trim();
  const concise = description.split(/[，,；;。:：]/)[0]?.trim();
  if (concise) {
    const normalized = normalizeWaitingInputDisplayLabel(concise);
    return normalized.length > 32 ? `${normalized.slice(0, 32).trim()}...` : normalized;
  }

  return normalizeWaitingInputDisplayLabel(displayName || field.name || fallback);
};

export const dedupeWaitingInputDisplayFields = <T extends WaitingInputDisplayField>(
  fields: T[],
): T[] => {
  const deduped: T[] = [];
  const seen = new Set<string>();

  fields.forEach((field) => {
    const groupLabel = normalizeWaitingInputDisplayLabel(String(field.group_label || '').trim() || DEFAULT_GROUP_LABEL);
    const fieldLabel = normalizeWaitingInputDisplayLabel(resolveWaitingInputDisplayLabel(field));
    const dedupeKey = `${groupLabel}::${fieldLabel || String(field.name || '').trim()}`;
    if (seen.has(dedupeKey)) {
      return;
    }
    seen.add(dedupeKey);
    deduped.push(field);
  });

  return deduped;
};

export const buildWaitingInputDisplayGroups = <T extends WaitingInputDisplayField>(
  fields: T[],
): WaitingInputDisplayGroup<T>[] => {
  const dedupedFields = dedupeWaitingInputDisplayFields(fields);
  const hasGroupLabel = dedupedFields.some((field) => String(field.group_label || '').trim());
  if (!hasGroupLabel) {
    return [];
  }

  const groups = new Map<string, WaitingInputDisplayGroup<T>>();
  dedupedFields.forEach((field) => {
    const label = normalizeWaitingInputDisplayLabel(String(field.group_label || '').trim() || DEFAULT_GROUP_LABEL);
    const existing = groups.get(label);
    if (existing) {
      existing.items.push(field);
      return;
    }
    groups.set(label, { label, items: [field] });
  });

  return Array.from(groups.values());
};
