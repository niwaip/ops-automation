import React from 'react';
import {
  Button,
  Collapse,
  Empty,
  List,
  Popconfirm,
  Space,
  Spin,
  Statistic,
  Tag,
  Typography,
} from 'antd';
import {
  ClockCircleOutlined,
  DeleteOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import ExecutionCreatePanelCard from '@/features/executions/create/components/ExecutionCreatePanelCard';
import { JsonPreview } from '@/features/executions/shared/components/JsonPreview';
import {
  executionCreatePillTagStyle,
  executionCreateSubtleCardStyle,
} from '@/features/executions/create/components/executionCreateStyles';
import type { ScheduleDto } from '@/api/schedules';
import { stringifyPreview, WEEKDAY_LABEL_MAP } from '@/features/executions/create/lib/executionCreate';
import { formatLocalizedDateTime } from '@/shared/utils/dateText';
import { summarizeCronExpression } from '@/shared/utils/scheduleText';

const { Panel } = Collapse;
const { Text } = Typography;

interface ExecutionCreateScheduleListCardProps {
  selectedSkillId?: string;
  schedulesLoading: boolean;
  schedules: ScheduleDto[];
  activeScheduleCount: number;
  togglingScheduleId?: string;
  deletingScheduleId?: string;
  triggeringScheduleId?: string;
  onCreateSchedule: () => void;
  onToggleSchedule: (payload: { id: string; isActive: boolean }) => void;
  onDeleteSchedule: (id: string) => void;
  onTriggerSchedule: (id: string) => void;
}

const ExecutionCreateScheduleListCard: React.FC<ExecutionCreateScheduleListCardProps> = ({
  selectedSkillId,
  schedulesLoading,
  schedules,
  activeScheduleCount,
  togglingScheduleId,
  deletingScheduleId,
  triggeringScheduleId,
  onCreateSchedule,
  onToggleSchedule,
  onDeleteSchedule,
  onTriggerSchedule,
}) => {
  return (
    <ExecutionCreatePanelCard
      title={
        <Space size={8}>
          <ClockCircleOutlined style={{ color: 'var(--text-secondary)' }} />
          <Text strong>当前定时配置</Text>
        </Space>
      }
      extra={
        <Button size="small" type="link" disabled={!selectedSkillId} onClick={onCreateSchedule}>
          新建
        </Button>
      }
    >
      {!selectedSkillId ? (
        <Empty description="选择技能后查看当前定时任务配置" />
      ) : schedulesLoading ? (
        <div style={{ padding: '24px 0', textAlign: 'center' }}>
          <Spin tip="正在加载定时任务..." />
        </div>
      ) : schedules.length === 0 ? (
        <Empty description="当前技能还没有定时任务配置" />
      ) : (
        <>
          <div
            style={{
              marginBottom: 16,
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 14,
            }}
          >
            <ExecutionCreatePanelCard size="small" style={executionCreateSubtleCardStyle}>
              <Statistic title="总数" value={schedules.length} />
            </ExecutionCreatePanelCard>
            <ExecutionCreatePanelCard size="small" style={executionCreateSubtleCardStyle}>
              <Statistic title="启用中" value={activeScheduleCount} valueStyle={{ color: '#1677ff' }} />
            </ExecutionCreatePanelCard>
          </div>
          <List
            dataSource={schedules}
            renderItem={(schedule) => {
              const updatingThisSchedule = togglingScheduleId === schedule.id;
              const deletingThisSchedule = deletingScheduleId === schedule.id;
              const triggeringThisSchedule = triggeringScheduleId === schedule.id;

              return (
                <List.Item style={{ paddingInline: 0 }}>
                  <ExecutionCreatePanelCard
                    size="small"
                    style={{
                      width: '100%',
                      ...executionCreateSubtleCardStyle,
                      borderRadius: 16,
                    }}
                  >
                    <Collapse ghost defaultActiveKey={[]} style={{ margin: -8 }}>
                      <Panel
                        key={schedule.id}
                        header={
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              gap: 12,
                              alignItems: 'center',
                              flexWrap: 'wrap',
                            }}
                          >
                            <Space wrap size={8}>
                              <Text strong>{schedule.name}</Text>
                              <Tag style={executionCreatePillTagStyle}>
                                {schedule.isActive ? '启用中' : '已停用'}
                              </Tag>
                              <Tag
                                icon={<ClockCircleOutlined />}
                                style={executionCreatePillTagStyle}
                              >
                                {summarizeCronExpression(schedule.cronExpression, {
                                  workdaysLabel: '每个工作日',
                                  weekdayLabelMap: WEEKDAY_LABEL_MAP,
                                })}
                              </Tag>
                            </Space>
                            <Space wrap size={8}>
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                下次执行：{formatLocalizedDateTime(schedule.nextRunAt)}
                              </Text>
                              <Tag style={executionCreatePillTagStyle}>{schedule.timezone}</Tag>
                            </Space>
                          </div>
                        }
                      >
                        <Space direction="vertical" size={10} style={{ width: '100%' }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            更新时间：{formatLocalizedDateTime(schedule.updatedAt)}
                          </Text>

                          {schedule.description ? (
                            <Text type="secondary">{schedule.description}</Text>
                          ) : null}

                          <div
                            style={{
                              padding: 10,
                              borderRadius: 12,
                              background: 'var(--bg-secondary)',
                            }}
                          >
                            <Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>
                              输入参数预览
                            </Text>
                            <JsonPreview
                              renderedValue={stringifyPreview(schedule.input)}
                              marginTop={0}
                            />
                          </div>

                          <Space wrap size={8}>
                            <Text type="secondary">
                              上次执行：{formatLocalizedDateTime(schedule.lastRunAt)}
                            </Text>
                          </Space>

                          <Space wrap>
                            <Button
                              size="small"
                              icon={<PlayCircleOutlined />}
                              loading={triggeringThisSchedule}
                              onClick={() => onTriggerSchedule(schedule.id)}
                            >
                              立即触发
                            </Button>
                            <Button
                              size="small"
                              icon={schedule.isActive ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                              loading={updatingThisSchedule}
                              onClick={() =>
                                onToggleSchedule({
                                  id: schedule.id,
                                  isActive: !schedule.isActive,
                                })
                              }
                            >
                              {schedule.isActive ? '停用' : '启用'}
                            </Button>
                            <Popconfirm
                              title="确认删除这个定时任务吗？"
                              onConfirm={() => onDeleteSchedule(schedule.id)}
                            >
                              <Button
                                size="small"
                                danger
                                icon={<DeleteOutlined />}
                                loading={deletingThisSchedule}
                              >
                                删除
                              </Button>
                            </Popconfirm>
                          </Space>
                        </Space>
                      </Panel>
                    </Collapse>
                  </ExecutionCreatePanelCard>
                </List.Item>
              );
            }}
          />
        </>
      )}
    </ExecutionCreatePanelCard>
  );
};

export default ExecutionCreateScheduleListCard;
