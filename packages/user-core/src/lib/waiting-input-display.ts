import type {
  WaitingInputDisplayField,
  WaitingInputDisplayGroup,
} from '../types/execution.types.js';

const MACHINE_LIKE_LABEL_PATTERN = /^[A-Za-z0-9_.[-\]]+$/;
const DEFAULT_GROUP_LABEL = '其他待补信息';
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

const stripWaitingInputLabelBoilerplate = (label: string): string => {
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

/**
 * Normalizes extra whitespace between Chinese characters while preserving English words spacing.
 * e.g. "保 密 协 议" -> "保密协议", "Hello World" -> "Hello World"
 */
export const normalizeChineseSpace = (text?: string): string => {
  if (!text || typeof text !== 'string') return '';
  return text.replace(/(?<=[\u4e00-\u9fa5])\s+(?=[\u4e00-\u9fa5])/g, '').trim();
};

export const normalizeWaitingInputDisplayLabel = (label: string): string =>
  normalizeChineseSpace(
    String(label || '')
      .trim()
      .replace(/\s*[（(](?:中文|日文|日语|zh|ja|cn|jp)[）)]\s*$/iu, '')
      .replace(/[_-](?:zh|ja|cn|jp)$/iu, '')
  );

export const WELL_KNOWN_FRIENDLY_INPUT_LABELS: Record<string, string> = {
  fileBase64: '待提取的文档附件',
  file_base64: '待提取的文档附件',
  fileName: '文档名称',
  file_name: '文档名称',
  fileBase64A: '文档 A 附件',
  fileBase64B: '文档 B 附件',
  workspaceId: '工作空间 ID',
  workspace_id: '工作空间 ID',
  recipientId: '接收人',
  recipient_id: '接收人',
  mailboxKey: '邮箱账号',
  mailbox_key: '邮箱账号',
};

export const resolveWaitingInputDisplayLabel = (
  field: WaitingInputDisplayField,
  fallback = '未命名信息'
): string => {
  const rawName = String(field.name || '').trim();
  const cleanName = rawName.split('.').pop() || rawName;
  const isFile =
    /file(?:base64|_base64)?/i.test(cleanName) ||
    /file(?:base64|_base64)?/i.test(rawName) ||
    /file(?:base64|_base64)?/i.test(String(field.display_name || ''));

  // 1. Explicit label (e.g. from backend presentation)
  const explicitLabel = String(field.label || '').trim();
  if (explicitLabel && !MACHINE_LIKE_LABEL_PATTERN.test(explicitLabel)) {
    const norm = normalizeWaitingInputDisplayLabel(explicitLabel);
    return isFile && !norm.includes('上传')
      ? `${norm}（请通过下方附件图标上传）`
      : norm;
  }

  // 2. Display name
  const displayName = String(field.display_name || '').trim();
  if (displayName && displayName !== field.name && !MACHINE_LIKE_LABEL_PATTERN.test(displayName)) {
    const norm = normalizeWaitingInputDisplayLabel(displayName);
    return isFile && !norm.includes('上传')
      ? `${norm}（请通过下方附件图标上传）`
      : norm;
  }

  // 3. Well-known machine field mapping
  const wellKnown =
    WELL_KNOWN_FRIENDLY_INPUT_LABELS[cleanName] ||
    WELL_KNOWN_FRIENDLY_INPUT_LABELS[rawName];
  if (wellKnown) {
    const norm = normalizeWaitingInputDisplayLabel(wellKnown);
    return isFile && !norm.includes('上传')
      ? `${norm}（请通过下方附件图标上传）`
      : norm;
  }

  // 4. Concise from description
  const description = String(field.description || '')
    .replace(/\s+/g, ' ')
    .trim();
  const concise = stripWaitingInputLabelBoilerplate(
    description.split(/[，,；;。:：]/)[0]?.trim() || ''
  );
  if (concise && !MACHINE_LIKE_LABEL_PATTERN.test(concise)) {
    const normalized = normalizeWaitingInputDisplayLabel(concise);
    const base = normalized.length > 32 ? `${normalized.slice(0, 32).trim()}...` : normalized;
    return isFile && !base.includes('上传')
      ? `${base}（请通过下方附件图标上传）`
      : base;
  }

  const baseFallback = normalizeWaitingInputDisplayLabel(
    displayName || cleanName || field.name || fallback
  );
  return isFile && !baseFallback.includes('上传')
    ? `${baseFallback}（请通过下方附件图标上传）`
    : baseFallback;
};

export const dedupeWaitingInputDisplayFields = <T extends WaitingInputDisplayField>(
  fields: T[]
): T[] => {
  const deduped: T[] = [];
  const seen = new Set<string>();

  fields.forEach((field) => {
    const groupLabel = normalizeWaitingInputDisplayLabel(
      String(field.group_label || '').trim() || DEFAULT_GROUP_LABEL
    );
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
  fields: T[]
): WaitingInputDisplayGroup<T>[] => {
  const dedupedFields = dedupeWaitingInputDisplayFields(fields);
  const hasGroupLabel = dedupedFields.some((field) => String(field.group_label || '').trim());
  if (!hasGroupLabel) {
    return [];
  }

  const groups = new Map<string, WaitingInputDisplayGroup<T>>();
  dedupedFields.forEach((field) => {
    const label = normalizeWaitingInputDisplayLabel(
      String(field.group_label || '').trim() || DEFAULT_GROUP_LABEL
    );
    const existing = groups.get(label);
    if (existing) {
      existing.items.push(field);
      return;
    }
    groups.set(label, { label, items: [field] });
  });

  return Array.from(groups.values());
};
