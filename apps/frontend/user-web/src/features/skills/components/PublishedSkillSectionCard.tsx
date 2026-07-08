import { DownOutlined, UpOutlined } from '@ant-design/icons';
import { Card } from 'antd';
import type { ReactNode } from 'react';
import {
  sectionCardStyle,
  sectionToggleButtonStyle,
} from '@/features/skills/components/publishedSkillListStyles';
import type { PublishedSkillSectionKey } from '@/features/skills/lib/publishedSkillList';

interface PublishedSkillSectionCardProps {
  children: ReactNode;
  collapsed: boolean;
  onToggle: (sectionKey: PublishedSkillSectionKey) => void;
  sectionKey: PublishedSkillSectionKey;
  title: string;
}

export function PublishedSkillSectionCard({
  children,
  collapsed,
  onToggle,
  sectionKey,
  title,
}: PublishedSkillSectionCardProps) {
  return (
    <Card
      size="small"
      title={
        <button type="button" onClick={() => onToggle(sectionKey)} style={sectionToggleButtonStyle}>
          <span>{title}</span>
          {collapsed ? <DownOutlined /> : <UpOutlined />}
        </button>
      }
      style={{ ...sectionCardStyle, marginBottom: sectionKey === 'authorized' ? 16 : 0 }}
      styles={{
        header: { cursor: 'pointer' },
        body: collapsed ? { display: 'none' } : { paddingTop: 8 },
      }}
    >
      {children}
    </Card>
  );
}
