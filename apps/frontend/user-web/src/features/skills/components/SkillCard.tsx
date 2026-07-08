import {
  ClockCircleOutlined,
  CloseCircleOutlined,
  PlayCircleOutlined,
  SendOutlined,
} from '@ant-design/icons';
import { Button, Card, Space, Tag, Typography, theme } from 'antd';
import type { PublishedSkillCatalogItem } from '@/api/skill';
import type { ScheduleDto } from '@/api/schedules';
import { deploymentColor } from '@/features/skills/lib/publishedSkillList';
import {
  descriptionStyle,
  skillCardStyle,
  skillMetaRowStyle,
  skillMetaSectionStyle,
  skillMetaSectionTitleStyle,
  skillMetaValueStyle,
} from '@/features/skills/components/publishedSkillListStyles';
import { formatLocalizedDateTime } from '@/shared/lib/dateText';
import { summarizeCronExpression } from '@/shared/lib/scheduleText';

interface SkillCardProps {
  authorized: boolean;
  onPrimaryAction: (skill: PublishedSkillCatalogItem, authorized: boolean) => void;
  recentlyRequested: boolean;
  schedules: ScheduleDto[];
  skill: PublishedSkillCatalogItem;
}

const getAccessStatusTag = (skill: PublishedSkillCatalogItem) => {
  if (skill.accessStatus === 'authorized') {
    return <Tag color="success">已授权</Tag>;
  }

  if (skill.accessStatus === 'requested') {
    return <Tag color="processing">申请中</Tag>;
  }

  if (skill.accessRequest?.status === 'rejected') {
    return <Tag color="error">已拒绝</Tag>;
  }

  return <Tag>未授权</Tag>;
};

export function SkillCard({
  authorized,
  onPrimaryAction,
  recentlyRequested,
  schedules,
  skill,
}: SkillCardProps) {
  const { token } = theme.useToken();
  const activeSchedules = schedules.filter((schedule) => schedule.isActive);
  const nextSchedule = activeSchedules[0] || schedules[0];
  const requestCreatedAt = formatLocalizedDateTime(skill.accessRequest?.createdAt, { fallback: null });
  const requestProcessedAt = formatLocalizedDateTime(
    skill.accessRequest?.processedAt || skill.accessRequest?.updatedAt,
    { fallback: null }
  );
  const resolvedSkillMetaSectionStyle = {
    ...skillMetaSectionStyle,
    border: `1px solid ${token.colorBorderSecondary}`,
    background: token.colorFillTertiary,
  };

  return (
    <Card
      style={{
        ...skillCardStyle,
        borderColor: recentlyRequested && skill.accessStatus === 'requested' ? token.colorInfoBorder : undefined,
        background: recentlyRequested && skill.accessStatus === 'requested' ? token.colorInfoBg : undefined,
      }}
      styles={{ body: { display: 'flex', flexDirection: 'column', gap: 16 } }}
    >
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start">
          <Typography.Title
            level={5}
            ellipsis={{ tooltip: skill.name }}
            style={{ margin: 0, flex: 1, minWidth: 0 }}
          >
            {skill.name}
          </Typography.Title>
          {getAccessStatusTag(skill)}
        </Space>

        {authorized ? (
          <>
            <div style={resolvedSkillMetaSectionStyle}>
              <Typography.Text type="secondary" style={skillMetaSectionTitleStyle}>
                说明
              </Typography.Text>
              <Typography.Paragraph
                type="secondary"
                ellipsis={{ rows: 3 }}
                style={{ ...descriptionStyle, minHeight: 'auto' }}
              >
                {skill.description || '暂无说明'}
              </Typography.Paragraph>
            </div>
            <div style={resolvedSkillMetaSectionStyle}>
              <Typography.Text type="secondary" style={skillMetaSectionTitleStyle}>
                定期任务
              </Typography.Text>
              {schedules.length === 0 ? (
                <Typography.Text type="secondary" style={skillMetaValueStyle}>
                  当前没有关联的定期任务
                </Typography.Text>
              ) : (
                <Space direction="vertical" size={6} style={{ width: '100%' }}>
                  <div style={skillMetaRowStyle}>
                    <Typography.Text type="secondary" style={skillMetaValueStyle}>
                      共 {schedules.length} 个，启用中 {activeSchedules.length} 个
                    </Typography.Text>
                    {nextSchedule?.timezone ? <Tag bordered={false}>{nextSchedule.timezone}</Tag> : null}
                  </div>
                  {nextSchedule ? (
                    <>
                      <Typography.Text style={skillMetaValueStyle}>
                        {summarizeCronExpression(nextSchedule.cronExpression, {
                          workdaysLabel: '工作日',
                        })}
                      </Typography.Text>
                      <Typography.Text type="secondary" style={skillMetaValueStyle}>
                        {nextSchedule.isActive ? '下次执行' : '最近更新'}：
                        {formatLocalizedDateTime(
                          nextSchedule.isActive
                            ? nextSchedule.nextRunAt
                            : nextSchedule.updatedAt || nextSchedule.nextRunAt
                        )}
                      </Typography.Text>
                    </>
                  ) : null}
                </Space>
              )}
            </div>
          </>
        ) : (
          <>
            <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }} style={descriptionStyle}>
              {skill.description || '暂无说明'}
            </Typography.Paragraph>
            <Space size={[8, 8]} wrap>
              <Tag>{skill.publishedSourceType || 'published'}</Tag>
              <Tag color={deploymentColor(skill.publishedDeploymentStatus)}>
                {skill.publishedDeploymentStatus || 'unknown'}
              </Tag>
              {skill.publishedReleaseVersion ? <Tag color="blue">v{skill.publishedReleaseVersion}</Tag> : null}
            </Space>
          </>
        )}
      </Space>

      {skill.accessStatus === 'requested' ? (
        <Card
          size="small"
          variant="borderless"
          style={{ background: recentlyRequested ? token.colorInfoBg : token.colorFillQuaternary }}
          styles={{ body: { padding: 12 } }}
        >
          <Space direction="vertical" size={4}>
            {recentlyRequested ? (
              <Tag color="blue" style={{ width: 'fit-content', marginInlineEnd: 0 }}>
                刚刚提交
              </Tag>
            ) : null}
            <Typography.Text>
              <ClockCircleOutlined style={{ marginRight: 6 }} />
              已提交授权申请，等待管理员处理
            </Typography.Text>
            {skill.accessRequest?.reason ? (
              <Typography.Text type="secondary">申请原因：{skill.accessRequest.reason}</Typography.Text>
            ) : null}
            {requestCreatedAt ? (
              <Typography.Text type="secondary">提交时间：{requestCreatedAt}</Typography.Text>
            ) : null}
          </Space>
        </Card>
      ) : null}

      {skill.accessStatus === 'unauthorized' && skill.accessRequest?.status === 'rejected' ? (
        <Card
          size="small"
          variant="borderless"
          style={{ background: token.colorErrorBg }}
          styles={{ body: { padding: 12 } }}
        >
          <Space direction="vertical" size={4}>
            <Typography.Text>
              <CloseCircleOutlined style={{ marginRight: 6 }} />
              最近一次授权申请未通过
            </Typography.Text>
            {skill.accessRequest?.reason ? (
              <Typography.Text type="secondary">申请原因：{skill.accessRequest.reason}</Typography.Text>
            ) : null}
            {skill.accessRequest?.responseNote ? (
              <Typography.Text type="secondary">
                管理员备注：{skill.accessRequest.responseNote}
              </Typography.Text>
            ) : null}
            {requestProcessedAt ? (
              <Typography.Text type="secondary">处理时间：{requestProcessedAt}</Typography.Text>
            ) : null}
          </Space>
        </Card>
      ) : null}

      <Space direction="vertical" size={8} style={{ marginTop: 'auto', width: '100%' }}>
        <Button
          block
          type={authorized ? 'primary' : skill.accessStatus === 'requested' ? 'default' : 'primary'}
          ghost={!authorized && skill.accessStatus !== 'requested'}
          icon={authorized ? <PlayCircleOutlined /> : <SendOutlined />}
          disabled={!authorized && skill.accessStatus === 'requested'}
          onClick={() => onPrimaryAction(skill, authorized)}
        >
          {authorized
            ? '确认配置'
            : skill.accessStatus === 'requested'
              ? '已提交申请'
              : skill.accessRequest?.status === 'rejected'
                ? '重新申请'
                : '申请授权'}
        </Button>
      </Space>
    </Card>
  );
}
