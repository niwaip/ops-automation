import type { CSSProperties, ReactNode } from 'react';
import type { PublishedSkillCatalogItem } from '@/api/skill';
import type { ScheduleDto } from '@/api/schedules';

export interface PublishedSkillOverviewItem {
  key: string;
  label: string;
  value: number;
  icon: ReactNode;
  iconStyle: CSSProperties;
}

export interface PublishedSkillCounts {
  authorized: number;
  available: number;
  rejected: number;
  requested: number;
  total: number;
  unauthorized: number;
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
