import {
  BranchesOutlined,
  CalendarOutlined,
  PlayCircleOutlined,
  SafetyCertificateFilled,
  TagOutlined,
} from '@ant-design/icons';
import { Button, Card, Tag, Typography, theme } from 'antd';
import type { SavedSkill } from '@/api/savedSkills';
import type { ScheduleDto } from '@/api/schedules';
import styles from '../components/EmployeeManagement.module.css';
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
  const isActive = skill.status === 'active';

  return (
    <Card
      className={styles['employee-card']}
      style={{
        borderColor: highlighted ? token.colorPrimary : undefined,
        boxShadow: highlighted ? `0 0 0 2px ${token.colorPrimaryBg}` : undefined,
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
      {/* Header */}
      <div className={styles['employee-card-header']}>
        <div className={styles['employee-avatar-wrapper']}>
          <div
            className={styles['employee-avatar']}
            style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)' }}
          >
            <BranchesOutlined />
          </div>
          <span
            className={`${styles['employee-status-dot']} ${
              isActive ? styles['dot-authorized'] : styles['dot-unauthorized']
            }`}
          />
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
            <Tag color="purple" style={{ marginInlineEnd: 0 }}>专属</Tag>
          </div>

          <div className={styles['employee-tags-row']}>
            <span className={styles['workflow-step-pill']}>
              固定 {skill.stepCount} 步
            </span>
            <span className={styles['employee-version-pill']}>v{skill.version}</span>
            <Tag color={isActive ? 'success' : 'default'} bordered={false} style={{ margin: 0, fontSize: 11 }}>
              {isActive ? '就绪' : skill.status}
            </Tag>
          </div>
        </div>
      </div>

      {/* Body Content */}
      <div className={styles['employee-card-content']}>
        <Typography.Paragraph
          type="secondary"
          ellipsis={{ rows: 2, tooltip: skill.description }}
          className={styles['employee-desc']}
        >
          {skill.description || '从成功执行保存的用户私有工作流，执行时按固定计划执行。'}
        </Typography.Paragraph>

        {/* Aliases */}
        {skill.aliases && skill.aliases.length > 0 && (
          <div className={styles['employee-capabilities-box']}>
            <div className={styles['employee-cap-tags']}>
              {skill.aliases.slice(0, 3).map((alias, idx) => (
                <span key={idx} className={styles['workflow-alias-chip']}>
                  <TagOutlined style={{ fontSize: 10 }} />
                  {alias}
                </span>
              ))}
              {skill.aliases.length > 3 && (
                <span className={styles['employee-cap-tag']}>+{skill.aliases.length - 3}</span>
              )}
            </div>
          </div>
        )}

        {/* Schedule Duty Box */}
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
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>未配置排班</span>
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
            <span className={styles['employee-duty-next']}>尚未创建定时任务，可随时手动运行</span>
          )}
        </div>

        {/* AI Review & Saved time */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className={styles['workflow-review-badge']}>
            <SafetyCertificateFilled style={{ color: '#10b981', fontSize: 12 }} />
            <span>{skill.review.summary || 'AI 审查已通过，执行计划未被改写'}</span>
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', paddingLeft: 17 }}>
            保存于 {formatLocalizedDateTime(skill.createdAt)}
          </span>
        </div>
      </div>

      {/* Footer Actions */}
      <div className={styles['employee-card-footer']}>
        <Button
          type="primary"
          icon={<PlayCircleOutlined />}
          disabled={!isActive}
          onClick={() => onExecute(skill)}
          className={styles['employee-primary-action-btn']}
        >
          立即执行
        </Button>
        <Button
          disabled={!isActive}
          onClick={() => onSchedule(skill)}
          className={styles['employee-secondary-action-btn']}
        >
          {schedules.length > 0 ? '管理排班' : '创建排班'}
        </Button>
        <SavedWorkflowAliasAction skill={skill} />
      </div>
    </Card>
  );
}
