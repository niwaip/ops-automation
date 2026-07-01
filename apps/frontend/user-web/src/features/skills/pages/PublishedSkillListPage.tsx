import { PlayCircleOutlined, ReloadOutlined, ScheduleOutlined, DeleteOutlined, PlusOutlined, LeftOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  TimePicker,
  Typography,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from 'react-query';
import { useNavigate } from 'react-router-dom';
import type { SkillConfig, SkillParamProperty } from '@ops/user-core';
import {
  buildSkillExecutionInputInitialValues,
  isBooleanInputType,
  isJsonLikeInputType,
  isNumericInputType,
  normalizeSkillExecutionInput,
} from '@ops/user-core';
import { scheduleApi, skillApi } from '../../../api';

const deploymentColor = (status?: string | null): string => {
  switch (status) {
    case 'deployed':
    case 'succeeded':
      return 'success';
    case 'deploying':
      return 'processing';
    case 'failed':
      return 'error';
    default:
      return 'default';
  }
};

const renderFieldInput = (name: string, config: SkillParamProperty) => {
  if (isNumericInputType(config.type)) {
    return <InputNumber style={{ width: '100%' }} placeholder={`请输入 ${name}`} />;
  }
  if (isBooleanInputType(config.type)) {
    return <Switch />;
  }
  if (isJsonLikeInputType(config.type)) {
    return <Input.TextArea rows={5} placeholder="请输入 JSON 字符串" />;
  }
  return <Input placeholder={config.description || `请输入 ${name}`} />;
};

const generateCronExpression = (values: any): string => {
  if (values.frequency === 'cron') {
    return values.cronExpression;
  }
  
  const time = values.time;
  const minute = time ? time.minute() : 0;
  const hour = time ? time.hour() : 0;

  if (values.frequency === 'daily') {
    return `${minute} ${hour} * * *`;
  }
  
  if (values.frequency === 'weekly') {
    const days = values.weekdays && values.weekdays.length > 0 ? values.weekdays.join(',') : '*';
    return `${minute} ${hour} * * ${days}`;
  }
  
  if (values.frequency === 'monthly') {
    const day = values.dayOfMonth || '1';
    return `${minute} ${hour} ${day} * *`;
  }
  
  return '* * * * *';
};

export function PublishedSkillListPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  
  const [isSchedulerModalVisible, setIsSchedulerModalVisible] = useState(false);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const selectedFrequency = Form.useWatch('frequency', form);

  const { data, isLoading, isFetching, refetch } = useQuery(
    ['user-web-published-skills-list'],
    () => skillApi.list()
  );

  const selectedSkillQuery = useQuery(
    ['user-web-skill-detail', selectedSkillId],
    () => skillApi.getById(selectedSkillId!),
    { enabled: Boolean(selectedSkillId) }
  );

  const schedulesQuery = useQuery(
    ['user-web-schedules-list'],
    () => scheduleApi.list(),
    { enabled: isSchedulerModalVisible }
  );

  const updateScheduleMutation = useMutation(
    async ({ id, data }: { id: string; data: any }) => scheduleApi.update(id, data),
    {
      onSuccess: () => {
        void message.success('定时任务已更新');
        void schedulesQuery.refetch();
      },
      onError: (error) => {
        void message.error(error instanceof Error ? error.message : '更新定时任务失败');
      },
    }
  );

  const deleteScheduleMutation = useMutation(
    async (id: string) => scheduleApi.delete(id),
    {
      onSuccess: () => {
        void message.success('定时任务已删除');
        void schedulesQuery.refetch();
      },
      onError: (error) => {
        void message.error(error instanceof Error ? error.message : '删除定时任务失败');
      },
    }
  );

  const triggerScheduleMutation = useMutation(
    async (id: string) => scheduleApi.trigger(id),
    {
      onSuccess: () => {
        void message.success('定时任务已手动触发执行');
      },
      onError: (error) => {
        void message.error(error instanceof Error ? error.message : '手动触发失败');
      },
    }
  );

  const skillSchedules = useMemo(() => {
    if (!schedulesQuery.data || !selectedSkillId) return [];
    return schedulesQuery.data.filter((s: any) => s.skillId === selectedSkillId);
  }, [schedulesQuery.data, selectedSkillId]);

  useEffect(() => {
    if (isSchedulerModalVisible && schedulesQuery.isSuccess) {
      const existing = schedulesQuery.data?.filter((s: any) => s.skillId === selectedSkillId) || [];
      setShowCreateForm(existing.length === 0);
    }
  }, [isSchedulerModalVisible, schedulesQuery.isSuccess, selectedSkillId]);

  useEffect(() => {
    if (isSchedulerModalVisible) {
      form.resetFields();
      form.setFieldValue('timezone', 'Asia/Shanghai');
      form.setFieldValue('frequency', 'daily');
    }
  }, [isSchedulerModalVisible, form]);

  useEffect(() => {
    if (selectedSkillQuery.data) {
      form.setFieldValue('input', buildSkillExecutionInputInitialValues(selectedSkillQuery.data));
    }
  }, [form, selectedSkillQuery.data]);

  const skills = useMemo(
    () =>
      (data?.skills || [])
        .filter((skill) => skill.isPublished)
        .sort((left, right) => left.name.localeCompare(right.name)),
    [data?.skills]
  );

  const createScheduleMutation = useMutation(
    async (values: any) => scheduleApi.create(values),
    {
      onSuccess: () => {
        void message.success('定时任务已成功配置');
        form.resetFields();
        form.setFieldValue('timezone', 'Asia/Shanghai');
        form.setFieldValue('frequency', 'daily');
        if (selectedSkillQuery.data) {
          form.setFieldValue('input', buildSkillExecutionInputInitialValues(selectedSkillQuery.data));
        }
        void schedulesQuery.refetch();
        setShowCreateForm(false);
      },
      onError: (error) => {
        void message.error(error instanceof Error ? error.message : '配置定时任务失败');
      },
    }
  );

  const handleOpenScheduler = (skillId: string) => {
    setSelectedSkillId(skillId);
    setShowCreateForm(false);
    setIsSchedulerModalVisible(true);
  };

  const handleSchedulerSubmit = (values: any) => {
    if (!selectedSkillId) return;

    const nextInput = normalizeSkillExecutionInput(
      values.input || {},
      selectedSkillQuery.data?.paramsSchema?.properties || {}
    );

    const cronExpression = generateCronExpression(values);

    createScheduleMutation.mutate({
      name: values.name,
      description: values.description,
      skillId: selectedSkillId,
      skillVersion: selectedSkillQuery.data?.publishedReleaseVersion || undefined,
      input: nextInput,
      cronExpression,
      timezone: values.timezone,
    });
  };

  const schemaEntries = Object.entries(selectedSkillQuery.data?.paramsSchema?.properties || {});
  const requiredFields = new Set(selectedSkillQuery.data?.paramsSchema?.required || []);

  return (
    <Card>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            已发布技能
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
            面向普通用户只展示可执行的公开技能，不展示管理员配置、调试和 Prompt 细节。
          </Typography.Paragraph>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => void refetch()} loading={isFetching}>
          刷新
        </Button>
      </Space>
      
      <Table<SkillConfig>
        rowKey="id"
        loading={isLoading}
        dataSource={skills}
        pagination={false}
        columns={[
          {
            title: '技能',
            dataIndex: 'name',
            key: 'name',
            render: (value: string, record) => (
              <Space direction="vertical" size={2}>
                <Typography.Text strong>{value}</Typography.Text>
                <Typography.Text type="secondary">
                  {record.description || '暂无说明'}
                </Typography.Text>
              </Space>
            ),
          },
          {
            title: '来源',
            dataIndex: 'publishedSourceType',
            key: 'publishedSourceType',
            render: (value?: string | null) => <Tag>{value || 'published'}</Tag>,
          },
          {
            title: '部署状态',
            dataIndex: 'publishedDeploymentStatus',
            key: 'publishedDeploymentStatus',
            render: (value?: string | null) => (
              <Tag color={deploymentColor(value)}>{value || 'unknown'}</Tag>
            ),
          },
          {
            title: '操作',
            key: 'actions',
            render: (_, record) => (
              <Space>
                <Button
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  onClick={() => navigate(`/executions/new?skillId=${record.id}`)}
                >
                  发起执行
                </Button>
                <Button
                  icon={<ScheduleOutlined />}
                  onClick={() => handleOpenScheduler(record.id)}
                >
                  定时任务
                </Button>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {showCreateForm && skillSchedules.length > 0 && (
              <Button
                type="text"
                size="small"
                icon={<LeftOutlined />}
                onClick={() => setShowCreateForm(false)}
              />
            )}
            <span>
              {showCreateForm ? '新建定时任务' : '定时任务管理'} - {selectedSkillQuery.data?.name || ''}
            </span>
          </div>
        }
        open={isSchedulerModalVisible}
        onCancel={() => {
          if (showCreateForm && skillSchedules.length > 0) {
            setShowCreateForm(false);
          } else {
            setIsSchedulerModalVisible(false);
          }
        }}
        onOk={() => {
          if (showCreateForm) {
            form.submit();
          } else {
            setIsSchedulerModalVisible(false);
          }
        }}
        okText={showCreateForm ? '创建' : '确定'}
        cancelText={showCreateForm && skillSchedules.length > 0 ? '返回列表' : '关闭'}
        cancelButtonProps={!showCreateForm ? { style: { display: 'none' } } : undefined}
        confirmLoading={createScheduleMutation.isLoading}
        width={750}
        destroyOnClose
      >
        {schedulesQuery.isLoading && <Spin style={{ display: 'block', margin: '32px auto' }} />}

        {!schedulesQuery.isLoading && !showCreateForm && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Typography.Text type="secondary">
                已配置 {skillSchedules.length} 个定时周期任务。
              </Typography.Text>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  form.resetFields();
                  form.setFieldValue('timezone', 'Asia/Shanghai');
                  form.setFieldValue('frequency', 'daily');
                  if (selectedSkillQuery.data) {
                    form.setFieldValue('input', buildSkillExecutionInputInitialValues(selectedSkillQuery.data));
                  }
                  setShowCreateForm(true);
                }}
              >
                新增定时任务
              </Button>
            </div>

            <Table
              dataSource={skillSchedules}
              rowKey="id"
              size="middle"
              pagination={false}
              locale={{ emptyText: '暂无定时任务，点击右上角按钮新增。' }}
              columns={[
                {
                  title: '任务名称',
                  dataIndex: 'name',
                  key: 'name',
                  render: (val, record: any) => (
                    <Space direction="vertical" size={2}>
                      <Typography.Text strong>{val}</Typography.Text>
                      {record.description && (
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {record.description}
                        </Typography.Text>
                      )}
                    </Space>
                  ),
                },
                {
                  title: '周期 / 时区',
                  dataIndex: 'cronExpression',
                  key: 'cronExpression',
                  render: (val, record: any) => (
                    <Space direction="vertical" size={2}>
                      <Tag color="processing">{val}</Tag>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {record.timezone}
                      </Typography.Text>
                    </Space>
                  ),
                },
                {
                  title: '下次执行时间',
                  dataIndex: 'nextRunAt',
                  key: 'nextRunAt',
                  render: (val, record: any) => {
                    if (!record.isActive) {
                      return <Typography.Text type="secondary">已暂停</Typography.Text>;
                    }
                    return val ? new Date(val).toLocaleString('zh-CN', { hour12: false }) : '-';
                  },
                },
                {
                  title: '状态',
                  dataIndex: 'isActive',
                  key: 'isActive',
                  width: 90,
                  render: (isActive, record: any) => (
                    <Switch
                      checked={isActive}
                      loading={updateScheduleMutation.isLoading}
                      onChange={(checked) => {
                        updateScheduleMutation.mutate({
                          id: record.id,
                          data: { isActive: checked },
                        });
                      }}
                    />
                  ),
                },
                {
                  title: '操作',
                  key: 'actions',
                  width: 120,
                  render: (_, record: any) => (
                    <Space size="middle">
                      <Button
                        type="text"
                        size="small"
                        icon={<PlayCircleOutlined style={{ color: '#52c41a' }} />}
                        title="立即执行一次"
                        onClick={() => triggerScheduleMutation.mutate(record.id)}
                      />
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        title="删除定时任务"
                        onClick={() => {
                          Modal.confirm({
                            title: '确认删除',
                            content: `确认要删除定时任务 "${record.name}" 吗？此操作无法撤销。`,
                            okText: '确认删除',
                            okType: 'danger',
                            cancelText: '取消',
                            onOk: () => deleteScheduleMutation.mutate(record.id),
                          });
                        }}
                      />
                    </Space>
                  ),
                },
              ]}
            />
          </div>
        )}

        {!schedulesQuery.isLoading && showCreateForm && (
          <Form
            form={form}
            layout="vertical"
            onFinish={handleSchedulerSubmit}
            style={{ marginTop: 16 }}
          >
            <Form.Item
              label="任务名称"
              name="name"
              rules={[{ required: true, message: '请输入定时任务名称' }]}
            >
              <Input placeholder="例如: 每日报表自动抓取" />
            </Form.Item>

            <Form.Item label="任务描述" name="description">
              <Input.TextArea rows={2} placeholder="请输入任务描述（可选）" />
            </Form.Item>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Form.Item
                label="定时周期"
                name="frequency"
                rules={[{ required: true, message: '请选择定时周期' }]}
              >
                <Select
                  options={[
                    { label: '每天 (Daily)', value: 'daily' },
                    { label: '每周 (Weekly)', value: 'weekly' },
                    { label: '每月 (Monthly)', value: 'monthly' },
                    { label: '高级 (Cron 表达式)', value: 'cron' },
                  ]}
                />
              </Form.Item>

              <Form.Item
                label="执行时区"
                name="timezone"
                rules={[{ required: true, message: '请选择执行时区' }]}
              >
                <Select
                  options={[
                    { label: '北京时间 (Asia/Shanghai)', value: 'Asia/Shanghai' },
                    { label: '协调世界时 (UTC)', value: 'UTC' },
                  ]}
                />
              </Form.Item>
            </div>

            {/* Conditional timing fields */}
            {selectedFrequency === 'daily' && (
              <Form.Item
                label="执行时间"
                name="time"
                rules={[{ required: true, message: '请选择执行时间' }]}
              >
                <TimePicker format="HH:mm" style={{ width: '100%' }} />
              </Form.Item>
            )}

            {selectedFrequency === 'weekly' && (
              <>
                <Form.Item
                  label="执行日 (周)"
                  name="weekdays"
                  rules={[{ required: true, message: '请选择星期几执行' }]}
                >
                  <Checkbox.Group
                    options={[
                      { label: '周一', value: '1' },
                      { label: '周二', value: '2' },
                      { label: '周三', value: '3' },
                      { label: '周四', value: '4' },
                      { label: '周五', value: '5' },
                      { label: '周六', value: '6' },
                      { label: '周日', value: '0' },
                    ]}
                  />
                </Form.Item>
                <Form.Item
                  label="执行时间"
                  name="time"
                  rules={[{ required: true, message: '请选择执行时间' }]}
                >
                  <TimePicker format="HH:mm" style={{ width: '100%' }} />
                </Form.Item>
              </>
            )}

            {selectedFrequency === 'monthly' && (
              <>
                <Form.Item
                  label="执行日 (月)"
                  name="dayOfMonth"
                  rules={[{ required: true, message: '请选择几号执行' }]}
                >
                  <Select
                    placeholder="选择月份中的日期"
                    options={Array.from({ length: 31 }, (_, i) => ({
                      label: `${i + 1} 号`,
                      value: String(i + 1),
                    }))}
                  />
                </Form.Item>
                <Form.Item
                  label="执行时间"
                  name="time"
                  rules={[{ required: true, message: '请选择执行时间' }]}
                >
                  <TimePicker format="HH:mm" style={{ width: '100%' }} />
                </Form.Item>
              </>
            )}

            {selectedFrequency === 'cron' && (
              <Form.Item
                label="Cron 表达式"
                name="cronExpression"
                rules={[{ required: true, message: '请输入 Cron 表达式' }]}
                extra="标准 5 位 Cron 格式，如：*/15 * * * * (每 15 分钟执行一次)"
              >
                <Input placeholder="* * * * *" />
              </Form.Item>
            )}

            {/* Skill parameters input schema */}
            {selectedSkillId && (
              <Card
                size="small"
                title="技能入参配置"
                style={{ marginTop: 16, backgroundColor: '#fafafa', borderRadius: 8 }}
              >
                {selectedSkillQuery.isLoading ? <Spin /> : null}

                {schemaEntries.length === 0 && !selectedSkillQuery.isLoading && (
                  <Typography.Text type="secondary">该技能无需输入任何参数。</Typography.Text>
                )}

                {schemaEntries.map(([name, config]) => (
                  <Form.Item
                    key={name}
                    label={config.description || name}
                    name={['input', name]}
                    valuePropName={isBooleanInputType(config.type) ? 'checked' : 'value'}
                    rules={
                      requiredFields.has(name)
                        ? [{ required: true, message: `请填写 ${name}` }]
                        : undefined
                    }
                    extra={`参数名: ${name} | 类型: ${config.type}`}
                  >
                    {renderFieldInput(name, config)}
                  </Form.Item>
                ))}
              </Card>
            )}
          </Form>
        )}
      </Modal>
    </Card>
  );
}
