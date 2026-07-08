import { Card, Empty } from 'antd';
import type { PublishedSkillCatalogItem } from '@/api/skill';
import type { ScheduleDto } from '@/api/schedules';
import { SkillCard } from '@/features/skills/components/SkillCard';
import {
  skillCardStyle,
  skillGridStyle,
} from '@/features/skills/components/publishedSkillListStyles';

interface SkillGridProps {
  authorized: boolean;
  emptyText: string;
  isLoading: boolean;
  onPrimaryAction: (skill: PublishedSkillCatalogItem, authorized: boolean) => void;
  recentlyRequestedSkillId: string | null;
  schedulesBySkillId: Map<string, ScheduleDto[]>;
  skills: PublishedSkillCatalogItem[];
}

export function SkillGrid({
  authorized,
  emptyText,
  isLoading,
  onPrimaryAction,
  recentlyRequestedSkillId,
  schedulesBySkillId,
  skills,
}: SkillGridProps) {
  if (isLoading) {
    return (
      <div style={skillGridStyle}>
        {[0, 1, 2].map((index) => (
          <Card key={index} loading style={skillCardStyle} />
        ))}
      </div>
    );
  }

  if (skills.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} />;
  }

  return (
    <div style={skillGridStyle}>
      {skills.map((skill) => (
        <SkillCard
          key={skill.id}
          authorized={authorized}
          onPrimaryAction={onPrimaryAction}
          recentlyRequested={recentlyRequestedSkillId === skill.id && skill.accessStatus === 'requested'}
          schedules={schedulesBySkillId.get(skill.id) || []}
          skill={skill}
        />
      ))}
    </div>
  );
}
