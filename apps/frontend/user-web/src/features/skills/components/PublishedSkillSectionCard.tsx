import { DownOutlined, UpOutlined } from '@ant-design/icons';
import { Card } from 'antd';
import type { ReactNode } from 'react';
import styles from './EmployeeManagement.module.css';
import type { PublishedSkillSectionKey } from '@/features/skills/lib/publishedSkillList';

interface PublishedSkillSectionCardProps {
  children: ReactNode;
  collapsed: boolean;
  onToggle: (sectionKey: PublishedSkillSectionKey) => void;
  sectionKey: PublishedSkillSectionKey;
  title: string;
  count?: number;
  icon?: ReactNode;
}

export function PublishedSkillSectionCard({
  children,
  collapsed,
  onToggle,
  sectionKey,
  title,
  count,
  icon,
}: PublishedSkillSectionCardProps) {
  return (
    <Card
      size="small"
      className={styles['employee-section-card']}
      title={
        <button
          type="button"
          onClick={() => onToggle(sectionKey)}
          className={styles['employee-section-toggle-btn']}
        >
          <div className={styles['employee-section-title-wrap']}>
            {icon}
            <span style={{ fontWeight: 600, fontSize: 14 }}>{title}</span>
            {typeof count === 'number' && (
              <span className={styles['employee-section-badge']}>{count}</span>
            )}
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {collapsed ? <DownOutlined /> : <UpOutlined />}
          </span>
        </button>
      }
      styles={{
        header: { cursor: 'pointer', paddingInline: 18, minHeight: 46 },
        body: collapsed ? { display: 'none' } : { padding: 18, paddingTop: 14 },
      }}
    >
      {children}
    </Card>
  );
}
