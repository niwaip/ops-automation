import { Alert, Card, Empty, Space, Statistic } from 'antd';
import { useMemo } from 'react';
import { useQuery } from 'react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { savedSkillApi } from '@/api/savedSkills';
import { scheduleApi } from '@/api/schedules';
import { SavedWorkflowCard } from './SavedWorkflowCard';

export function SavedWorkflowList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const highlightedSkillId = searchParams.get('skillId') || undefined;
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
  const activeScheduleCount = (schedulesQuery.data || []).filter(
    (schedule) => schedule.isActive && skills.some((skill) => skill.id === schedule.skillId)
  ).length;

  if (skillsQuery.isLoading) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        {[0, 1, 2].map((item) => <Card key={item} loading style={{ minHeight: 320 }} />)}
      </div>
    );
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Alert
        showIcon
        type="info"
        message="我的工作流只对当前账号可见"
        description="工作流保存成功执行的固定多步计划和固定参数；再次执行或定时触发时不会重新规划。"
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
        <Card><Statistic title="我的工作流" value={skills.length} /></Card>
        <Card><Statistic title="可执行" value={skills.filter((skill) => skill.status === 'active').length} /></Card>
        <Card><Statistic title="启用中的定时任务" value={activeScheduleCount} /></Card>
      </div>
      {skills.length === 0 ? (
        <Card>
          <Empty description="还没有保存的工作流。完成一次多步任务后，可在 AI 回答下方保存。" />
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          {skills.map((skill) => (
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
    </Space>
  );
}
