import { useMemo, useState } from 'react';
import {
  BranchesOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  ClearOutlined,
  FilterOutlined,
  InfoCircleOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { Alert, Button, Card, Empty, Input, Select } from 'antd';
import { useQuery } from 'react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { savedSkillApi } from '@/api/savedSkills';
import { scheduleApi } from '@/api/schedules';
import styles from '../components/EmployeeManagement.module.css';
import { PersonalizationControlCard } from './PersonalizationControlCard';
import { SavedWorkflowCard } from './SavedWorkflowCard';

export function SavedWorkflowList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const highlightedSkillId = searchParams.get('skillId') || undefined;

  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

  const skillsQuery = useQuery(['user-saved-skills'], () => savedSkillApi.list(), {
    staleTime: 15_000,
  });
  const schedulesQuery = useQuery(['user-saved-skill-schedules'], () => scheduleApi.list(), {
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const skills = skillsQuery.data?.skills || [];

  const schedulesBySkillId = useMemo(() => {
    const result = new Map<string, NonNullable<typeof schedulesQuery.data>>();
    (schedulesQuery.data || []).forEach((schedule) => {
      const current = result.get(schedule.skillId) || [];
      current.push(schedule);
      result.set(schedule.skillId, current);
    });
    return result;
  }, [schedulesQuery.data]);

  const activeSkillsCount = useMemo(
    () => skills.filter((skill) => skill.status === 'active').length,
    [skills]
  );


  const scheduledSkillsCount = useMemo(
    () =>
      skills.filter((skill) => {
        const sList = schedulesBySkillId.get(skill.id) || [];
        return sList.some((s) => s.isActive);
      }).length,
    [skills, schedulesBySkillId]
  );

  // Filter skills
  const filteredSkills = useMemo(() => {
    return skills.filter((skill) => {
      if (searchText.trim()) {
        const q = searchText.trim().toLowerCase();
        const nameMatch = skill.name?.toLowerCase().includes(q);
        const descMatch = skill.description?.toLowerCase().includes(q);
        const aliasMatch = skill.aliases?.some((a) => a.toLowerCase().includes(q));
        if (!nameMatch && !descMatch && !aliasMatch) {
          return false;
        }
      }

      if (statusFilter && statusFilter !== 'all') {
        if (statusFilter === 'active' && skill.status !== 'active') return false;
        if (statusFilter === 'scheduled') {
          const sList = schedulesBySkillId.get(skill.id) || [];
          if (!sList.some((s) => s.isActive)) return false;
        }
      }

      return true;
    });
  }, [schedulesBySkillId, searchText, skills, statusFilter]);

  const hasActiveFilters = Boolean(searchText.trim() || (statusFilter && statusFilter !== 'all'));

  const clearAllFilters = () => {
    setSearchText('');
    setStatusFilter(undefined);
  };

  const overviewItems = [
    {
      key: 'total',
      label: '全部专属工作流',
      value: skills.length,
      icon: <BranchesOutlined />,
      iconStyle: { color: '#8b5cf6', background: 'rgba(139, 92, 246, 0.12)' },
      statusFilterValue: 'all',
    },
    {
      key: 'active',
      label: '就绪可执行',
      value: activeSkillsCount,
      icon: <CheckCircleOutlined />,
      iconStyle: { color: '#059669', background: 'rgba(16, 185, 129, 0.12)' },
      statusFilterValue: 'active',
    },
    {
      key: 'scheduled',
      label: '自动化排班中',
      value: scheduledSkillsCount,
      icon: <CalendarOutlined />,
      iconStyle: { color: '#2563eb', background: 'rgba(59, 130, 246, 0.12)' },
      statusFilterValue: 'scheduled',
    },
  ];

  if (skillsQuery.isLoading) {
    return (
      <div className={styles['employee-grid']}>
        {[0, 1, 2].map((item) => (
          <Card key={item} loading className={styles['employee-card']} style={{ minHeight: 280 }} />
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* 1. Overview Interactive Statistics Strip */}
      <div className={styles['employee-overview-strip']}>
        {overviewItems.map((item) => {
          const isActive =
            item.statusFilterValue === 'all'
              ? !statusFilter || statusFilter === 'all'
              : statusFilter === item.statusFilterValue;

          const handleClick = () => {
            if (item.statusFilterValue === 'all') {
              setStatusFilter(undefined);
            } else if (isActive) {
              setStatusFilter(undefined);
            } else {
              setStatusFilter(item.statusFilterValue);
            }
          };

          return (
            <div
              key={item.key}
              className={`${styles['employee-overview-card']} ${isActive ? styles['is-active'] : ''}`}
              onClick={handleClick}
              role="button"
              tabIndex={0}
              title={`点击筛选: ${item.label}`}
            >
              <div className={styles['employee-overview-icon']} style={item.iconStyle}>
                {item.icon}
              </div>
              <div className={styles['employee-overview-body']}>
                <span className={styles['employee-overview-title']}>{item.label}</span>
                <span className={styles['employee-overview-value']}>{item.value}</span>
              </div>
              <span className={styles['employee-overview-indicator']} />
            </div>
          );
        })}
      </div>

      {/* 2. Unified Search & Filter Toolbar */}
      <div className={styles['employee-toolbar']}>
        <div className={styles['employee-toolbar-header']}>
          <div className={styles['employee-toolbar-title-box']}>
            <span className={styles['employee-toolbar-icon-badge']} style={{ background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(99, 102, 241, 0.25))', color: '#8b5cf6' }}>
              <BranchesOutlined />
            </span>
            <div>
              <span className={styles['employee-toolbar-title']}>我的专属工作流库</span>
              <span className={styles['employee-toolbar-subtitle']}>
                {' '}
                · 保存成功执行的固定多步计划与参数，执行时无需重新规划
              </span>
            </div>
          </div>

          <div className={styles['employee-toolbar-stats-text']}>
            共 <strong>{skills.length}</strong> 个专属工作流
            {hasActiveFilters && (
              <span>
                {' '}(当前匹配 <strong>{filteredSkills.length}</strong> 个)
              </span>
            )}
          </div>
        </div>

        <div className={styles['employee-toolbar-controls']}>
          <Input
            className={styles['employee-search-input']}
            placeholder="搜索工作流名称、步骤描述或触发别名..."
            prefix={<SearchOutlined style={{ color: 'var(--text-secondary)' }} />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
            size="middle"
          />

          <Select
            className={styles['employee-filter-select']}
            placeholder="状态筛选"
            value={statusFilter || 'all'}
            onChange={(val) => setStatusFilter(val === 'all' ? undefined : val)}
            suffixIcon={<FilterOutlined style={{ color: 'var(--text-secondary)' }} />}
            size="middle"
            popupMatchSelectWidth={false}
          >
            <Select.Option value="all">全部工作流</Select.Option>
            <Select.Option value="active">就绪可执行</Select.Option>
            <Select.Option value="scheduled">有定时排班</Select.Option>
          </Select>

          {hasActiveFilters && (
            <Button
              size="middle"
              type="dashed"
              icon={<ClearOutlined />}
              onClick={clearAllFilters}
              style={{ borderRadius: 999 }}
            >
              清空筛选
            </Button>
          )}
        </div>
      </div>

      {/* 3. Tip Alert */}
      <Alert
        showIcon
        icon={<InfoCircleOutlined style={{ color: '#8b5cf6' }} />}
        type="info"
        message="专属工作流仅当前账号可见"
        description="在智能协同中完成复杂多步任务后，可在结果下方一键保存为专属工作流。"
        style={{ marginBottom: 16, borderRadius: 12, border: '1px solid rgba(139, 92, 246, 0.2)', background: 'rgba(139, 92, 246, 0.04)' }}
      />

      {/* 4. Personalization & Habits Collapsible Card */}
      <PersonalizationControlCard />

      {/* 5. Workflows Grid or Empty State */}
      {skills.length === 0 ? (
        <div
          style={{
            padding: '56px 24px',
            textAlign: 'center',
            background: 'var(--bg-card)',
            borderRadius: 16,
            border: '1px solid var(--border-color)',
          }}
        >
          <Empty
            description={
              <span style={{ color: 'var(--text-secondary)' }}>
                还没有保存的专属工作流。在智能协同中完成复杂多步任务后，可一键将其沉淀保存至此处。
              </span>
            }
          >
            <Button
              type="primary"
              onClick={() => navigate('/chat')}
              style={{ borderRadius: 8, marginTop: 8 }}
            >
              前往智能协同开展任务
            </Button>
          </Empty>
        </div>
      ) : hasActiveFilters && filteredSkills.length === 0 ? (
        <div
          style={{
            padding: '48px 24px',
            textAlign: 'center',
            background: 'var(--bg-card)',
            borderRadius: 16,
            border: '1px solid var(--border-color)',
          }}
        >
          <Empty
            description={
              <span style={{ color: 'var(--text-secondary)' }}>
                未找到匹配 “<strong>{searchText || statusFilter}</strong>” 的工作流
              </span>
            }
          >
            <Button type="primary" onClick={clearAllFilters} style={{ borderRadius: 8 }}>
              清空筛选条件
            </Button>
          </Empty>
        </div>
      ) : (
        <div className={styles['employee-grid']}>
          {filteredSkills.map((skill) => (
            <SavedWorkflowCard
              key={skill.id}
              highlighted={skill.id === highlightedSkillId}
              skill={skill}
              schedules={schedulesBySkillId.get(skill.id) || []}
              onExecute={(item) => navigate(`/executions/new?skillId=${item.id}`)}
              onSchedule={(item) => navigate(`/executions/new?skillId=${item.id}&mode=schedule`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
