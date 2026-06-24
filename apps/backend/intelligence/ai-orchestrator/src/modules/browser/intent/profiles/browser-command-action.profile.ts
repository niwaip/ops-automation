import type { RuntimeSemanticRule } from '../../../../client/browser-semantics.client';
import {
  ACTION_PROFILE_MAX_TERM_COUNT,
  ACTION_PROFILE_MAX_TERM_LENGTH,
  ACTION_PROFILE_TYPE,
  DEFAULT_ACTION_INTENT_TERMS,
} from './browser-command-action.constants';
import type {
  ActionProfile,
  ActionProfileCategoryHint,
  ActionProfileEntry,
  ActionProfileSemanticKey,
} from './browser-command-action.types';
import type { PendingActionRoleHint } from '../atomic-parsers/action-intent.builder';

function normalizeProfileTerm(term: string): string {
  return term.replace(/\s+/g, ' ').trim();
}

function normalizeProfileTerms(value: unknown, maxCount = ACTION_PROFILE_MAX_TERM_COUNT): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => normalizeProfileTerm(item))
        .filter((item) => item.length > 0 && item.length <= ACTION_PROFILE_MAX_TERM_LENGTH)
    )
  ).slice(0, maxCount);
}

function normalizeRoleHints(value: unknown): PendingActionRoleHint[] {
  return normalizeProfileTerms(value).filter(
    (item): item is PendingActionRoleHint =>
      item === 'button' || item === 'link' || item === 'tab' || item === 'menuitem'
  );
}

function normalizeSemanticKey(value: unknown): ActionProfileSemanticKey | undefined {
  return value === 'detail' ||
    value === 'approve' ||
    value === 'reject' ||
    value === 'menu' ||
    value === 'edit' ||
    value === 'delete' ||
    value === 'open'
    ? value
    : undefined;
}

function normalizeCategoryHint(value: unknown): ActionProfileCategoryHint | undefined {
  return value === 'DETAIL_OPEN' || value === 'ROW_ACTION' || value === 'MENU_SELECTION'
    ? value
    : undefined;
}

function toActionProfileEntry(rule: RuntimeSemanticRule): ActionProfileEntry | null {
  const outputs = rule.outputs || {};
  if (outputs.profile_type !== ACTION_PROFILE_TYPE) {
    return null;
  }

  const targetTerms = normalizeProfileTerms(outputs.target_terms);
  const actionTerms = normalizeProfileTerms(outputs.action_terms);
  const semanticKey = normalizeSemanticKey(outputs.semantic_hint);
  if (targetTerms.length === 0 || (!semanticKey && actionTerms.length === 0)) {
    return null;
  }

  return {
    ruleId: typeof rule.id === 'string' && rule.id.trim() ? rule.id : undefined,
    targetTerms,
    semanticKey,
    actionTerms,
    regionTerms: normalizeProfileTerms(outputs.region_terms),
    roleHints: normalizeRoleHints(outputs.role_hints),
    categoryHint: normalizeCategoryHint(outputs.category_hint),
    intentTerms: normalizeProfileTerms(outputs.intent_terms),
    localeHints: normalizeProfileTerms(outputs.locale_hints),
  };
}

export function buildActionProfile(runtimeRules: RuntimeSemanticRule[]): ActionProfile {
  const entries = runtimeRules
    .filter(
      (rule) =>
        rule.category === 'DETAIL_OPEN' ||
        rule.category === 'ROW_ACTION' ||
        rule.category === 'MENU_SELECTION'
    )
    .map((rule) => toActionProfileEntry(rule))
    .filter((entry): entry is ActionProfileEntry => Boolean(entry));

  const intentTerms = Array.from(
    new Set([
      ...DEFAULT_ACTION_INTENT_TERMS,
      ...entries.flatMap((entry) => entry.intentTerms),
    ])
  );

  return {
    intentTerms,
    entries,
  };
}

export function canonicalizeActionText(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[“”"'`]/g, '')
    .replace(/[，。！？、:：()（）[\]【】]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return '';
  }

  return normalized
    .replace(/^(?:点击|单击|选择|打开|进入|click|select|open|enter)\s*/i, '')
    .replace(/没有承认的数据|没有承認的数据|未承认数据|未承認数据/g, 'pending')
    .replace(/没有承认|没有承認|未承认|未承認|待处理|待審批|待审批|保留中|pending/g, 'pending')
    .replace(/详情|詳細/g, 'detail')
    .replace(/承认する|承認する|承认|承認|批准|审批通过|审批|通过|approve/g, 'approve')
    .replace(/却下する|却下|拒绝|拒否|reject/g, 'reject')
    .replace(/更多|菜单|下拉|操作菜单|menu|more/g, 'menu')
    .replace(/编辑|修改|edit/g, 'edit')
    .replace(/删除|移除|delete|remove/g, 'delete')
    .replace(/查看|明细/g, 'detail')
    .replace(/按钮|按键|链接|入口|菜单项|页面|页|面板|区域|模块|区块|部分/g, '')
    .replace(/[的"'\s:=|]/g, '')
    .trim();
}
