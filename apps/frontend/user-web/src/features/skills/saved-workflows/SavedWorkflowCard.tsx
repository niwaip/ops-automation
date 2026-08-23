import { ClockCircleOutlined, PlayCircleOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { Button, Card, Space, Tag, Typography, theme } from 'antd';
import type { SavedSkill } from '@/api/savedSkills';
import type { ScheduleDto } from '@/api/schedules';
import { formatLocalizedDateTime } from '@/shared/utils/dateText';
import { summarizeCronExpression } from '@/shared/utils/scheduleText';
import { SavedWorkflowAliasAction } from './SavedWorkflowAliasAction';

interface SavedWorkflowCardProps {
  highlighted?: boolean;
  schedules: ScheduleDto[];
  skill: SavedSkill;
  onExecute: (skill: SavedSkill) => void;
  onSchedule: (skill: SavedSkill) => void;
}

export function SavedWorkflowCard({
  highlighted,
  schedules,
  skill,
  onExecute,
  onSchedule,
}: SavedWorkflowCardProps) {
  const { token } = theme.useToken();
  const activeSchedules = schedules.filter((schedule) => schedule.isActive);
  const nextSchedule = activeSchedules[0] || schedules[0];

  return (
    <Card
      style={{
        height: '100%',
        borderRadius: 16,
        borderColor: highlighted ? token.colorPrimary : undefined,
        boxShadow: highlighted ? `0 0 0 2px ${token.colorPrimaryBg}` : undefined,
      }}
      styles={{ body: { display: 'flex', flexDirection: 'column', gap: 16, height: '100%' } }}
    >
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        <Space align="start" style={{ width: '100%', justifyContent: 'space-between' }}>
          <Typography.Title level={5} style={{ margin: 0 }} ellipsis={{ tooltip: skill.name }}>
            {skill.name}
          </Typography.Title>
          <Tag color="blue">我的</Tag>
        </Space>
        <Space wrap size={[6, 6]}>
          <Tag color="purple">固定多步 · {skill.stepCount} 步</Tag>
          <Tag>v{skill.version}</Tag>
          <Tag color={skill.status === 'active' ? 'success' : 'default'}>{skill.status}</Tag>
        </Space>
        <Typography.Paragraph type="secondary" ellipsis={{ rows: 3 }} style={{ margin: 0 }}>
          {skill.description || '从成功执行保存的用户私有工作流'}
        </Typography.Paragraph>
      </Space>

      <Card size="small" variant="borderless" style={{ background: token.colorFillTertiary }}>
        <Space direction="vertical" size={5} style={{ width: '100%' }}>
          <Typography.Text strong>
            <ClockCircleOutlined style={{ marginRight: 6 }} />
            定时任务
          </Typography.Text>
          {nextSchedule ? (
            <>
              <Typography.Text>
                共 {schedules.length} 个，启用中 {activeSchedules.length} 个
              </Typography.Text>
              <Typography.Text type="secondary">
                {summarizeCronExpression(nextSchedule.cronExpression, { workdaysLabel: '工作日' })}
              </Typography.Text>
              {nextSchedule.isActive ? (
                <Typography.Text type="secondary">
                  下次执行：{formatLocalizedDateTime(nextSchedule.nextRunAt)}
                </Typography.Text>
              ) : null}
            </>
          ) : (
            <Typography.Text type="secondary">尚未创建定时任务</Typography.Text>
          )}
        </Space>
      </Card>

      <Space direction="vertical" size={5}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          <SafetyCertificateOutlined style={{ marginRight: 5 }} />
          {skill.review.summary || 'AI 审查已完成，计划未被改写'}
        </Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          保存于 {formatLocalizedDateTime(skill.createdAt)}
        </Typography.Text>
      </Space>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 'auto' }}>
        <Button
          block
          type="primary"
          icon={<PlayCircleOutlined />}
          disabled={skill.status !== 'active'}
          onClick={() => onExecute(skill)}
        >
          立即执行
        </Button>
        <Button block disabled={skill.status !== 'active'} onClick={() => onSchedule(skill)}>
          {schedules.length > 0 ? '管理定时' : '创建定时'}
        </Button>
        <SavedWorkflowAliasAction skill={skill} />
      </div>
    </Card>
  );
}
