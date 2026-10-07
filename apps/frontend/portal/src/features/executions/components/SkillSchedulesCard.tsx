import React from 'react';
import {
  Button,
  Card,
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
import { useMutation, useQueryClient } from 'react-query';
import { scheduleApi, ScheduleDto } from '@/api/schedules';
import { summarizeCronExpression } from '@/features/executions/lib/executionSchedule';

const { Text } = Typography;
const { Panel } = Collapse;

export interface SkillSchedulesCardProps {
  selectedSkillId?: string;
  isLoading: boolean;
  skillSchedules: ScheduleDto[];
  activeScheduleCount: number;
  onNewSchedule: () => void;
  panelCardStyle: React.CSSProperties;
  subtleCardStyle: React.CSSProperties;
  pillTagStyle: React.CSSProperties;
  formatDateTime: (value?: string | Date | null) => string;
  stringifyPreview: (value: unknown) => string;
  message: {
    success: (content: string) => void;
    error: (content: string) => void;
  };
}

export const SkillSchedulesCard: React.FC<SkillSchedulesCardProps> = ({
  selectedSkillId,
  isLoading,
  skillSchedules,
  activeScheduleCount,
  onNewSchedule,
  panelCardStyle,
  subtleCardStyle,
  pillTagStyle,
  formatDateTime,
  stringifyPreview,
  message,
}) => {
  const queryClient = useQueryClient();

  const toggleScheduleMutation = useMutation(
    async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return scheduleApi.update(id, { isActive });
    },
    {
      onSuccess: async (schedule) => {
        void message.success(`${schedule.name} 已${schedule.isActive ? '启用' : '停用'}`);
        await queryClient.invalidateQueries(['execution-create-schedules']);
      },
      onError: (error: Error) => {
        void message.error(`更新定时任务状态失败：${error.message}`);
      },
    }
  );

  const triggerScheduleMutation = useMutation(
    async (id: string) => scheduleApi.trigger(id),
    {
      onSuccess: async () => {
        void message.success('已触发一次立即执行');
        await Promise.all([
          queryClient.invalidateQueries(['executions']),
          queryClient.invalidateQueries(['dashboard-executions-recent']),
          queryClient.invalidateQueries(['execution-create-schedules']),
        ]);
      },
      onError: (error: Error) => {
        void message.error(`触发定时任务失败：${error.message}`);
      },
    }
  );

  const deleteScheduleMutation = useMutation(
    async (id: string) => scheduleApi.delete(id),
    {
      onSuccess: async () => {
        void message.success('定时任务已删除');
        await queryClient.invalidateQueries(['execution-create-schedules']);
      },
      onError: (error: Error) => {
        void message.error(`删除定时任务失败：${error.message}`);
      },
    }
  );

  return (
    <Card
      title={
        <Space size={8}>
          <ClockCircleOutlined style={{ color: 'var(--text-secondary)' }} />
          <Text strong>当前定时配置</Text>
        </Space>
      }
      extra={
        <Button
          size="small"
          type="link"
          disabled={!selectedSkillId}
          onClick={onNewSchedule}
        >
          新建
        </Button>
      }
      style={panelCardStyle}
    >
      {!selectedSkillId ? (
        <Empty description="选择技能后查看当前定时任务配置" />
      ) : isLoading ? (
        <div style={{ padding: '24px 0', textAlign: 'center' }}>
          <Spin tip="正在加载定时任务..." />
        </div>
      ) : skillSchedules.length === 0 ? (
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
            <Card size="small" style={subtleCardStyle}>
              <Statistic title="总数" value={skillSchedules.length} />
            </Card>
            <Card size="small" style={subtleCardStyle}>
              <Statistic
                title="启用中"
                value={activeScheduleCount}
                valueStyle={{ color: '#1677ff' }}
              />
            </Card>
          </div>
          <List
            dataSource={skillSchedules}
            renderItem={(schedule) => {
              const updatingThisSchedule =
                toggleScheduleMutation.isLoading &&
                toggleScheduleMutation.variables?.id === schedule.id;
              const deletingThisSchedule =
                deleteScheduleMutation.isLoading &&
                deleteScheduleMutation.variables === schedule.id;
              const triggeringThisSchedule =
                triggerScheduleMutation.isLoading &&
                triggerScheduleMutation.variables === schedule.id;

              return (
                <List.Item style={{ paddingInline: 0 }}>
                  <Card
                    size="small"
                    style={{
                      width: '100%',
                      ...subtleCardStyle,
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
                              <Tag style={pillTagStyle}>
                                {schedule.isActive ? '启用中' : '已停用'}
                              </Tag>
                              <Tag icon={<ClockCircleOutlined />} style={pillTagStyle}>
                                {summarizeCronExpression(schedule.cronExpression)}
                              </Tag>
                            </Space>
                            <Space wrap size={8}>
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                下次执行：{formatDateTime(schedule.nextRunAt)}
                              </Text>
                              <Tag style={pillTagStyle}>{schedule.timezone}</Tag>
                            </Space>
                          </div>
                        }
                      >
                        <Space direction="vertical" size={10} style={{ width: '100%' }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            更新时间：{formatDateTime(schedule.updatedAt)}
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
                            <pre
                              style={{
                                margin: 0,
                                fontSize: 12,
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                maxHeight: 120,
                                overflow: 'auto',
                              }}
                            >
                              {stringifyPreview(schedule.input)}
                            </pre>
                          </div>

                          <Space wrap size={8}>
                            <Text type="secondary">
                              上次执行：{formatDateTime(schedule.lastRunAt)}
                            </Text>
                          </Space>

                          <Space wrap>
                            <Button
                              size="small"
                              icon={<PlayCircleOutlined />}
                              loading={triggeringThisSchedule}
                              onClick={() => triggerScheduleMutation.mutate(schedule.id)}
                            >
                              立即触发
                            </Button>
                            <Button
                              size="small"
                              icon={schedule.isActive ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                              loading={updatingThisSchedule}
                              onClick={() =>
                                toggleScheduleMutation.mutate({
                                  id: schedule.id,
                                  isActive: !schedule.isActive,
                                })
                              }
                            >
                              {schedule.isActive ? '停用' : '启用'}
                            </Button>
                            <Popconfirm
                              title="确认删除这个定时任务吗？"
                              onConfirm={() => deleteScheduleMutation.mutate(schedule.id)}
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
                  </Card>
                </List.Item>
              );
            }}
          />
        </>
      )}
    </Card>
  );
};
