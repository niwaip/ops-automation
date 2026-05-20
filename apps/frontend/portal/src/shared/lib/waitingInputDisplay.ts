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

export const resolveWaitingInputDisplayLabel = (
  field: WaitingInputDisplayField,
  fallback = '未命名信息',
): string => {
  const displayName = String(field.display_name || '').trim();
  if (displayName && displayName !== field.name && !MACHINE_LIKE_LABEL_PATTERN.test(displayName)) {
    return displayName;
  }

  const description = String(field.description || '').replace(/\s+/g, ' ').trim();
  const concise = description.split(/[，,；;。:：]/)[0]?.trim();
  if (concise) {
    return concise.length > 32 ? `${concise.slice(0, 32).trim()}...` : concise;
  }

  return displayName || field.name || fallback;
};

export const buildWaitingInputDisplayGroups = <T extends WaitingInputDisplayField>(
  fields: T[],
): WaitingInputDisplayGroup<T>[] => {
  const hasGroupLabel = fields.some((field) => String(field.group_label || '').trim());
  if (!hasGroupLabel) {
    return [];
  }

  const groups = new Map<string, WaitingInputDisplayGroup<T>>();
  fields.forEach((field) => {
    const label = String(field.group_label || '').trim() || DEFAULT_GROUP_LABEL;
    const existing = groups.get(label);
    if (existing) {
      existing.items.push(field);
      return;
    }
    groups.set(label, { label, items: [field] });
  });

  return Array.from(groups.values());
};
