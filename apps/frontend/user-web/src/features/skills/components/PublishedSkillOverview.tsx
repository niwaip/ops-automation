import {
  CalendarOutlined,
  CheckCircleOutlined,
  HourglassOutlined,
  SendOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import styles from './EmployeeManagement.module.css';
import type {
  PublishedSkillCounts,
  PublishedSkillOverviewItem,
} from '@/features/skills/lib/publishedSkillList';

interface PublishedSkillOverviewProps {
  counts: PublishedSkillCounts;
  activeFilter?: string;
  onSelectFilter?: (filter?: string) => void;
}

export function PublishedSkillOverview({
  counts,
  activeFilter,
  onSelectFilter,
}: PublishedSkillOverviewProps) {
  const overviewItems: PublishedSkillOverviewItem[] = [
    {
      key: 'total',
      label: '全量员工',
      value: counts.total,
      icon: <TeamOutlined />,
      iconStyle: { color: '#4f46e5', background: 'rgba(99, 102, 241, 0.12)' },
      statusFilterValue: 'all',
    },
    {
      key: 'authorized',
      label: '已在岗 (已授权)',
      value: counts.authorized,
      icon: <CheckCircleOutlined />,
      iconStyle: { color: '#059669', background: 'rgba(16, 185, 129, 0.12)' },
      statusFilterValue: 'authorized',
    },
    {
      key: 'requested',
      label: '入职审批中',
      value: counts.requested,
      icon: <HourglassOutlined />,
      iconStyle: { color: '#2563eb', background: 'rgba(59, 130, 246, 0.12)' },
      statusFilterValue: 'requested',
    },
    {
      key: 'available',
      label: '待开通员工',
      value: counts.available,
      icon: <SendOutlined />,
      iconStyle: { color: '#475569', background: 'rgba(148, 163, 184, 0.16)' },
      statusFilterValue: 'available',
    },
    {
      key: 'scheduled',
      label: '自动化排班中',
      value: counts.scheduled ?? 0,
      icon: <CalendarOutlined />,
      iconStyle: { color: '#7c3aed', background: 'rgba(147, 51, 234, 0.12)' },
      statusFilterValue: 'scheduled',
    },
  ];

  return (
    <div className={styles['employee-overview-strip']}>
      {overviewItems.map((item) => {
        const isClickable = Boolean(onSelectFilter && item.statusFilterValue);
        const isActive =
          item.statusFilterValue === 'all'
            ? !activeFilter || activeFilter === 'all'
            : activeFilter === item.statusFilterValue;

        const handleClick = () => {
          if (!onSelectFilter || !item.statusFilterValue) return;
          if (item.statusFilterValue === 'all') {
            onSelectFilter(undefined);
          } else if (isActive) {
            onSelectFilter(undefined);
          } else {
            onSelectFilter(item.statusFilterValue);
          }
        };

        return (
          <div
            key={item.key}
            className={`${styles['employee-overview-card']} ${isActive ? styles['is-active'] : ''}`}
            onClick={isClickable ? handleClick : undefined}
            role={isClickable ? 'button' : undefined}
            tabIndex={isClickable ? 0 : undefined}
            title={isClickable ? `点击快速筛选: ${item.label}` : undefined}
          >
            <div className={styles['employee-overview-icon']} style={item.iconStyle}>
              {item.icon}
            </div>
            <div className={styles['employee-overview-body']}>
              <span className={styles['employee-overview-title']}>{item.label}</span>
              <span className={styles['employee-overview-value']}>{item.value}</span>
            </div>
            {isClickable && <span className={styles['employee-overview-indicator']} />}
          </div>
        );
      })}
    </div>
  );
}
