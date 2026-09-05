import {
  CalendarOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  MessageOutlined,
  PlayCircleOutlined,
  RobotOutlined,
  SendOutlined,
} from '@ant-design/icons';
import { Button, Card, Tag, Tooltip, Typography, theme } from 'antd';
import type { PublishedSkillCatalogItem } from '@/api/skill';
import type { ScheduleDto } from '@/api/schedules';
import styles from './EmployeeManagement.module.css';
import { formatLocalizedDateTime } from '@/shared/utils/dateText';
import { summarizeCronExpression } from '@/shared/utils/scheduleText';

interface SkillCardProps {
  authorized: boolean;
  onPrimaryAction: (skill: PublishedSkillCatalogItem, authorized: boolean) => void;
  onChatCollaborate?: (skill: PublishedSkillCatalogItem) => void;
  recentlyRequested: boolean;
  schedules: ScheduleDto[];
  skill: PublishedSkillCatalogItem;
}

const getEmployeeAvatarBackground = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const gradients = [
    'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
    'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
    'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
    'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
    'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
  ];
  return gradients[Math.abs(hash) % gradients.length];
};

const getAccessStatusTag = (skill: PublishedSkillCatalogItem) => {
  if (skill.accessStatus === 'authorized') {
    return <Tag color="success" style={{ marginInlineEnd: 0 }}>在岗 (已授权)</Tag>;
  }

  if (skill.accessStatus === 'requested') {
    return <Tag color="processing" style={{ marginInlineEnd: 0 }}>审批中</Tag>;
  }

  if (skill.accessRequest?.status === 'rejected') {
    return <Tag color="error" style={{ marginInlineEnd: 0 }}>未通过</Tag>;
  }

  return <Tag style={{ marginInlineEnd: 0 }}>待开通</Tag>;
};

export function SkillCard({
  authorized,
  onPrimaryAction,
  onChatCollaborate,
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

  const statusDotClass =
    skill.accessStatus === 'authorized'
      ? styles['dot-authorized']
      : skill.accessStatus === 'requested'
        ? styles['dot-requested']
        : skill.accessRequest?.status === 'rejected'
          ? styles['dot-rejected']
          : styles['dot-unauthorized'];

  // Collect display capabilities (tools + keywords)
  const capabilities = [
    ...(skill.tools || []),
    ...(skill.triggerKeywords || []),
  ].slice(0, 4);

  return (
    <Card
      className={styles['employee-card']}
      style={{
        borderColor: recentlyRequested && skill.accessStatus === 'requested' ? token.colorInfoBorder : undefined,
      }}
      styles={{
        body: {
          display: 'flex',
          flexDirection: 'column',
          padding: '18px',
          height: '100%',
          flex: 1,
        },
      }}
    >
      {/* Employee Identity Header */}
      <div className={styles['employee-card-header']}>
        <div className={styles['employee-avatar-wrapper']}>
          <div
            className={styles['employee-avatar']}
            style={{ background: getEmployeeAvatarBackground(skill.name) }}
          >
            <RobotOutlined />
          </div>
          <span className={`${styles['employee-status-dot']} ${statusDotClass}`} />
        </div>

        <div className={styles['employee-header-meta']}>
          <div className={styles['employee-name-row']}>
            <Typography.Title
              level={5}
              ellipsis={{ tooltip: skill.name }}
              className={styles['employee-name']}
              style={{ margin: 0, flex: 1, minWidth: 0 }}
            >
              {skill.name}
            </Typography.Title>
            {getAccessStatusTag(skill)}
          </div>

          <div className={styles['employee-tags-row']}>
            {skill.publishedReleaseVersion && (
              <span className={styles['employee-version-pill']}>
                v{skill.publishedReleaseVersion}
              </span>
            )}
            {skill.publishedSourceType && (
              <Tag bordered={false} style={{ margin: 0, fontSize: 11, padding: '0 4px' }}>
                {skill.publishedSourceType}
              </Tag>
            )}
          </div>
        </div>
      </div>

      {/* Main Description and Capabilities */}
      <div className={styles['employee-card-content']}>
        <Typography.Paragraph
          type="secondary"
          ellipsis={{ rows: 2, tooltip: skill.description }}
          className={styles['employee-desc']}
        >
          {skill.description || '专注执行自动化业务流程与跨系统任务协同。'}
        </Typography.Paragraph>

        {capabilities.length > 0 && (
          <div className={styles['employee-capabilities-box']}>
            <div className={styles['employee-cap-tags']}>
              {capabilities.map((cap, idx) => (
                <span key={idx} className={styles['employee-cap-tag']}>
                  {cap}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Schedule & Duty Section */}
        {authorized && (
          <div
            className={`${styles['employee-duty-box']} ${
              activeSchedules.length > 0 ? styles['is-active-schedule'] : ''
            }`}
          >
            <div className={styles['employee-duty-header']}>
              <span className={styles['employee-duty-title']}>
                <CalendarOutlined style={{ color: activeSchedules.length > 0 ? '#10b981' : undefined }} />
                勤务排班
              </span>
              {activeSchedules.length > 0 ? (
                <Tag color="success" bordered={false} style={{ margin: 0, fontSize: 10 }}>
                  {activeSchedules.length} 项排班运行中
                </Tag>
              ) : (
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>按需即时指派</span>
              )}
            </div>

            {nextSchedule ? (
              <>
                <span className={styles['employee-duty-desc']}>
                  {summarizeCronExpression(nextSchedule.cronExpression, { workdaysLabel: '工作日' })}
                </span>
                <span className={styles['employee-duty-next']}>
                  {nextSchedule.isActive ? '下次执勤' : '最近更新'}：
                  {formatLocalizedDateTime(
                    nextSchedule.isActive
                      ? nextSchedule.nextRunAt
                      : nextSchedule.updatedAt || nextSchedule.nextRunAt
                  )}
                </span>
              </>
            ) : (
              <span className={styles['employee-duty-next']}>当前无周期定时执勤，随时接受人工指派</span>
            )}
          </div>
        )}

        {/* Request Alerts */}
        {skill.accessStatus === 'requested' && (
          <div className={`${styles['employee-request-alert']} ${styles['alert-pending']}`}>
            <span style={{ fontWeight: 600 }}>
              <ClockCircleOutlined style={{ marginRight: 5 }} />
              开通申请审核中
            </span>
            {skill.accessRequest?.reason && (
              <span>申请理由：{skill.accessRequest.reason}</span>
            )}
            {requestCreatedAt && <span>提交时间：{requestCreatedAt}</span>}
          </div>
        )}

        {skill.accessStatus === 'unauthorized' && skill.accessRequest?.status === 'rejected' && (
          <div className={`${styles['employee-request-alert']} ${styles['alert-rejected']}`}>
            <span style={{ fontWeight: 600 }}>
              <CloseCircleOutlined style={{ marginRight: 5 }} />
              上次开通申请未通过
            </span>
            {skill.accessRequest?.responseNote && (
              <span>管理员备注：{skill.accessRequest.responseNote}</span>
            )}
            {requestProcessedAt && <span>处理时间：{requestProcessedAt}</span>}
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div className={styles['employee-card-footer']}>
        <Button
          type={authorized ? 'primary' : skill.accessStatus === 'requested' ? 'default' : 'primary'}
          ghost={!authorized && skill.accessStatus !== 'requested'}
          icon={authorized ? <PlayCircleOutlined /> : <SendOutlined />}
          disabled={!authorized && skill.accessStatus === 'requested'}
          onClick={() => onPrimaryAction(skill, authorized)}
          className={styles['employee-primary-action-btn']}
        >
          {authorized
            ? '指派任务'
            : skill.accessStatus === 'requested'
              ? '审批中'
              : skill.accessRequest?.status === 'rejected'
                ? '重新申请'
                : '申请开通'}
        </Button>

        {authorized && onChatCollaborate && (
          <Tooltip title="进入智能协同，与该数字员工开展人机协同问答与任务委派">
            <Button
              icon={<MessageOutlined />}
              onClick={() => onChatCollaborate(skill)}
              className={styles['employee-secondary-action-btn']}
            >
              协同
            </Button>
          </Tooltip>
        )}
      </div>
    </Card>
  );
}
