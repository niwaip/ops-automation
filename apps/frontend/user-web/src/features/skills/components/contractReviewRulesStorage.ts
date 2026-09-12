import {
  DEFAULT_ORG_RULES,
} from './contractReviewBuiltinRules';
import type {
  PartyPosition,
  UserCustomRule,
} from './contractReviewRules.types';
import {
  LEGACY_STORAGE_KEY,
  STORAGE_KEY_ORG_RULES,
  STORAGE_KEY_USER_RULES,
} from './contractReviewRules.types';

export const DEFAULT_PERSONAL_PRESETS: UserCustomRule[] = [
  {
    id: 'user-preset-01',
    scope: 'personal',
    applicablePosition: 'party_b',
    title: '到货验收后异议期必须限定 5 个工作日内',
    category: '验收交付',
    contractType: 'software_development',
    severity: 'HIGH',
    rule: '要求相对方在收到交付物或试运行后，必须在 5 个工作日内出具书面异议，否则视为验收合格通过。',
    recommendedRevision: '甲方在收到乙方交付的阶段性成果后，应于 5 个工作日内组织验收。逾期未提出书面修改意见的，视为该阶段成果已合格验收。',
    enabled: true,
    creator: '个人偏好',
    createdAt: '2026-01-15',
  },
  {
    id: 'user-preset-02',
    scope: 'personal',
    applicablePosition: 'party_a',
    title: '要求服务商提供 12 个月免费缺陷质保与 2 小时紧急响应',
    category: '售后服务',
    contractType: 'software_development',
    severity: 'MEDIUM',
    rule: '作为甲方采购软件系统时，要求乙方提供自终验合格之日起不少于 12 个月的免费缺陷修复，且重大故障 2 小时内响应。',
    recommendedRevision: '乙方提供自系统终验合格之日起 12 个月的免费技术支持与系统缺陷保修服务；若出现一级重大系统故障，乙方应在接到通知后 2 小时内到达现场或远程接入排查。',
    enabled: true,
    creator: '个人偏好',
    createdAt: '2026-01-15',
  },
];

/**
 * Reads organization-level rules from localStorage.
 * Falls back to DEFAULT_ORG_RULES if none saved.
 */
export function getOrgRules(): UserCustomRule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ORG_RULES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('[ContractRules] Failed to parse org rules from localStorage', err);
  }
  return DEFAULT_ORG_RULES;
}

/**
 * Saves organization-level rules to localStorage.
 */
export function saveOrgRules(rules: UserCustomRule[]): void {
  localStorage.setItem(STORAGE_KEY_ORG_RULES, JSON.stringify(rules));
}

/**
 * Reads personal-level rules from localStorage.
 * Migrates from legacy storage key if found.
 */
export function getUserRules(): UserCustomRule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_USER_RULES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
    // Check legacy storage
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const parsedLegacy = JSON.parse(legacy);
      if (Array.isArray(parsedLegacy) && parsedLegacy.length > 0) {
        const migrated: UserCustomRule[] = parsedLegacy.map((r: any) => ({
          id: r.id || `migrated-${Date.now()}`,
          scope: 'personal',
          applicablePosition: r.applicablePosition || 'both',
          title: r.title || '自定义规则',
          category: r.category || '通用风控',
          contractType: r.contractType || 'all',
          severity: r.severity || 'HIGH',
          rule: r.rule || '',
          recommendedRevision: r.recommendedRevision,
          enabled: r.enabled !== false,
          creator: '个人定义',
          createdAt: new Date().toISOString().split('T')[0],
        }));
        saveUserRules(migrated);
        return migrated;
      }
    }
  } catch (err) {
    console.warn('[ContractRules] Failed to parse user rules from localStorage', err);
  }
  return DEFAULT_PERSONAL_PRESETS;
}

/**
 * Saves personal-level rules to localStorage.
 */
export function saveUserRules(rules: UserCustomRule[]): void {
  localStorage.setItem(STORAGE_KEY_USER_RULES, JSON.stringify(rules));
}

/**
 * Combines active org and personal rules into CustomCheckpointDto format for execution.
 */
export function getActiveCustomCheckpoints(options?: {
  contractType?: string;
  position?: PartyPosition;
}): Array<{
  id: string;
  title: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  rule: string;
  category?: string;
  recommendedRevision?: string;
}> {
  const orgRules = getOrgRules();
  const userRules = getUserRules();
  const allActive = [...orgRules, ...userRules].filter((r) => r.enabled);

  const filtered = allActive.filter((r) => {
    // Check contract type match
    if (options?.contractType && r.contractType && r.contractType !== 'all') {
      if (r.contractType !== options.contractType) {
        return false;
      }
    }
    // Check position match
    if (options?.position && r.applicablePosition && r.applicablePosition !== 'both') {
      if (options.position !== 'both' && r.applicablePosition !== options.position) {
        return false;
      }
    }
    return true;
  });

  return filtered.map((r) => ({
    id: r.id,
    title: r.scope === 'org' ? `【组织红线】${r.title}` : `【个人要点】${r.title}`,
    severity: r.severity,
    rule: r.rule,
    category: r.category,
    recommendedRevision: r.recommendedRevision,
  }));
}
