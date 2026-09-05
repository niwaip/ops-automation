import { Card, Empty } from 'antd';
import type { PublishedSkillCatalogItem } from '@/api/skill';
import type { ScheduleDto } from '@/api/schedules';
import { SkillCard } from '@/features/skills/components/SkillCard';
import styles from './EmployeeManagement.module.css';

interface SkillGridProps {
  authorized: boolean;
  emptyText: string;
  isLoading: boolean;
  onPrimaryAction: (skill: PublishedSkillCatalogItem, authorized: boolean) => void;
  onChatCollaborate?: (skill: PublishedSkillCatalogItem) => void;
  recentlyRequestedSkillId: string | null;
  schedulesBySkillId: Map<string, ScheduleDto[]>;
  skills: PublishedSkillCatalogItem[];
}

export function SkillGrid({
  authorized,
  emptyText,
  isLoading,
  onPrimaryAction,
  onChatCollaborate,
  recentlyRequestedSkillId,
  schedulesBySkillId,
  skills,
}: SkillGridProps) {
  if (isLoading) {
    return (
      <div className={styles['employee-grid']}>
        {[0, 1, 2].map((index) => (
          <Card
            key={index}
            loading
            className={styles['employee-card']}
            style={{ minHeight: 280 }}
          />
        ))}
      </div>
    );
  }

  if (skills.length === 0) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={<span style={{ color: 'var(--text-secondary)' }}>{emptyText}</span>}
        style={{ marginBlock: 32 }}
      />
    );
  }

  return (
    <div className={styles['employee-grid']}>
      {skills.map((skill) => (
        <SkillCard
          key={skill.id}
          authorized={authorized}
          onPrimaryAction={onPrimaryAction}
          onChatCollaborate={onChatCollaborate}
          recentlyRequested={recentlyRequestedSkillId === skill.id && skill.accessStatus === 'requested'}
          schedules={schedulesBySkillId.get(skill.id) || []}
          skill={skill}
        />
      ))}
    </div>
  );
}
