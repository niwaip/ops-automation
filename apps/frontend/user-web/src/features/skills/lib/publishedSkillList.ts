import type { CSSProperties, ReactNode } from 'react';
import type { PublishedSkillCatalogItem } from '@/api/skill';
import type { ScheduleDto } from '@/api/schedules';

export interface PublishedSkillOverviewItem {
  key: string;
  label: string;
  value: number;
  icon: ReactNode;
  iconStyle: CSSProperties;
  statusFilterValue?: string;
}

export interface PublishedSkillCounts {
  authorized: number;
  available: number;
  rejected: number;
  requested: number;
  total: number;
  unauthorized: number;
  scheduled?: number;
}

export type PublishedSkillSectionKey = 'authorized' | 'unauthorized';

export interface UnauthorizedPublishedSkillCollections {
  requestedSkills: PublishedSkillCatalogItem[];
  rejectedSkills: PublishedSkillCatalogItem[];
  neverRequestedSkills: PublishedSkillCatalogItem[];
  orderedUnauthorizedSkills: PublishedSkillCatalogItem[];
}

export const deploymentColor = (status?: string | null): string => {
  switch (status) {
    case 'deployed':
    case 'succeeded':
      return 'success';
    case 'deploying':
      return 'processing';
    case 'failed':
      return 'error';
    default:
      return 'default';
  }
};

export const sortPublishedSkillsByName = (
  skills: PublishedSkillCatalogItem[] | undefined
): PublishedSkillCatalogItem[] =>
  [...(skills || [])].sort((left, right) => left.name.localeCompare(right.name));

export const buildUnauthorizedPublishedSkillCollections = (
  skills: PublishedSkillCatalogItem[]
): UnauthorizedPublishedSkillCollections => {
  const requestedSkills = skills.filter((skill) => skill.accessStatus === 'requested');
  const rejectedSkills = skills.filter((skill) => skill.accessRequest?.status === 'rejected');
  const neverRequestedSkills = skills.filter(
    (skill) => skill.accessStatus !== 'requested' && skill.accessRequest?.status !== 'rejected'
  );

  return {
    requestedSkills,
    rejectedSkills,
    neverRequestedSkills,
    orderedUnauthorizedSkills: [...requestedSkills, ...rejectedSkills, ...neverRequestedSkills],
  };
};

export const buildSchedulesBySkillId = (
  schedules: ScheduleDto[] | undefined
): Map<string, ScheduleDto[]> => {
  const grouped = new Map<string, ScheduleDto[]>();

  (schedules || []).forEach((schedule) => {
    const current = grouped.get(schedule.skillId) || [];
    current.push(schedule);
    grouped.set(schedule.skillId, current);
  });

  grouped.forEach((items, skillId) => {
    grouped.set(
      skillId,
      [...items].sort((left, right) => {
        const leftTime = new Date(left.nextRunAt || left.updatedAt || left.id).getTime();
        const rightTime = new Date(right.nextRunAt || right.updatedAt || right.id).getTime();
        return leftTime - rightTime;
      })
    );
  });

  return grouped;
};

/**
 * Determines whether a skill is a system built-in skill.
 */
export const isBuiltinSkill = (skill: PublishedSkillCatalogItem): boolean => {
  return (
    skill.publishedSourceType === 'builtin' ||
    skill.id.startsWith('platform.') ||
    (skill as any).capabilityKey?.startsWith('platform.') ||
    (skill as any).apiEndpoints?.runtimeMetadata?.sourceType === 'builtin_skill'
  );
};

/**
 * Checks whether a skill requires or supports user-level configuration
 * (e.g. custom checklist rules, user-bound credentials, or explicit userConfigurable flag).
 */
export const isSkillUserConfigurable = (skill: PublishedSkillCatalogItem): boolean => {
  // 1. Contract reviewer has user-configurable legal checklist rules & thresholds
  if (
    skill.id === 'platform.document.contract-reviewer' ||
    skill.id.includes('contract-reviewer') ||
    (skill as any).capabilityKey === 'platform.document.contract-reviewer' ||
    Boolean(skill.paramsSchema?.properties?.customChecklistRules) ||
    Boolean(skill.paramsSchema?.properties?.customCheckpoints)
  ) {
    return true;
  }

  // 2. Explicit userConfigurable flag in skill definition
  if ((skill as any).userConfigurable || (skill as any).requiresUserConfig) {
    return true;
  }

  // 3. User credential configuration (fields requiring user secrets, keys, or passwords)
  const properties = skill.paramsSchema?.properties || {};
  for (const [key, prop] of Object.entries(properties)) {
    const p = prop as any;
    if (
      p?.credentialRequired === true ||
      p?.['x-credential-required'] === true ||
      p?.['x-credential-category']
    ) {
      return true;
    }
    const lower = key.toLowerCase();
    if (
      (p?.isSecret || p?.['x-is-secret']) &&
      (lower.includes('devicekey') ||
        lower.includes('device_key') ||
        lower.includes('apikey') ||
        lower.includes('api_key') ||
        lower.includes('auth_token') ||
        lower.includes('credential'))
    ) {
      return true;
    }
  }

  return false;
};

/**
 * Filters skills for the Digital Employees roster.
 * Built-in skills do not appear in digital employees unless they require user configuration.
 */
export const filterSkillsForDigitalEmployees = (
  skills: PublishedSkillCatalogItem[]
): PublishedSkillCatalogItem[] => {
  return skills.filter((skill) => {
    if (!isBuiltinSkill(skill)) {
      return true;
    }
    return isSkillUserConfigurable(skill);
  });
};
