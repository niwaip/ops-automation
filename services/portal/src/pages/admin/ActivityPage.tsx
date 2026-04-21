import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Card, Button, Input, Space, Tag, Typography, Modal, message, Form, Select,
  Divider, Alert, Collapse, Badge, Popconfirm, Tooltip, Statistic, Row, Col, Switch,
  Tabs, Steps, Timeline, Progress, Empty, Drawer, List, Avatar, Slider, InputNumber,
  Radio, Checkbox, Card as AntCard
} from 'antd';
import {
  SearchOutlined, PlusOutlined, EditOutlined, DeleteOutlined, PlayCircleOutlined,
  ReloadOutlined, ApiOutlined, CodeOutlined, FileTextOutlined, ChromeOutlined,
  CheckCircleOutlined, ThunderboltOutlined, SettingOutlined, SyncOutlined,
  RobotOutlined, EyeOutlined, SaveOutlined, CloseOutlined, DragOutlined,
  UpOutlined, DownOutlined, CopyOutlined, ClearOutlined, ExperimentOutlined,
  HeartOutlined, ClockCircleOutlined, RetweetOutlined, SafetyOutlined,
  ThunderboltOutlined as LightningBold, CaretUpOutlined, CaretDownOutlined,
  BugOutlined, FieldTimeOutlined, KeyOutlined, LoadingOutlined, ExportOutlined,
  VideoCameraOutlined, LineChartOutlined, WarningOutlined, CheckSquareOutlined, OrderedListOutlined
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { activityApi, ActivityDTO, CreateActivityDto, ActivityValidationResult } from '../../api/activity';
import type { ColumnsType } from 'antd/es/table';

const { Text, Paragraph, Title } = Typography;
const { Option } = Select;
const { Panel } = Collapse;
const { TextArea } = Input;

const HANDLER_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode; description: string }> = {
  api: { label: 'API 调用', color: 'green', icon: <ApiOutlined />, description: '通过 HTTP API 调用外部服务' },
  carbone: { label: 'Carbone 渲染', color: 'blue', icon: <FileTextOutlined />, description: '使用 Carbone 引擎渲染文档' },
  browser: { label: '浏览器操作', color: 'purple', icon: <ChromeOutlined />, description: '自动化浏览器操作' },
  script: { label: '脚本执行', color: 'orange', icon: <CodeOutlined />, description: '执行自定义 JavaScript 脚本' },
};

interface ActivityStep {
  id: string;
  name: string;
  type: 'api' | 'carbone' | 'browser' | 'script';
  timeout: string;
  retryPolicy?: { maxRetries: number; backoffMs?: number; nonRetryableReasons?: string[] };
  idempotencyKey?: string;
  heartbeatTimeout?: string;
  startToCloseTimeout?: string;
  scheduleToStartTimeout?: string;
  scheduleToCloseTimeout?: string;
  config: Record<string, any>;
}

interface ActivityFormData {
  name: string;
  fn: string;
  taskQueue: string;
  startToCloseTimeout: string;
  scheduleToStartTimeout: string;
  scheduleToCloseTimeout: string;
  heartbeatTimeout: string;
  handler: 'api' | 'carbone' | 'browser' | 'script';
  retryPolicy?: { maxRetries: number; backoffMs?: number; nonRetryableReasons?: string[] };
  idempotencyKey: string;
  inputSchema: string;
  steps: ActivityStep[];
  config: Record<string, any>;
}

const generatePythonCode = (form: ActivityFormData): string => {
  const lines: string[] = [];
  lines.push('from datetime import timedelta');
  lines.push('from temporalio import activity');
  lines.push('from typing import Optional, Dict, Any');
  lines.push('');
  lines.push('@activity.defn');
  lines.push(`def ${form.fn}(input_data: Dict[str, Any]) -> Dict[str, Any]:`);
  lines.push('    """Auto-generated activity with heartbeat and retry support."""');
  lines.push(`    activity.logger.info(f"Starting activity ${form.name}")`);
  lines.push('');

  if (form.heartbeatTimeout) {
    lines.push(`    # Heartbeat timeout: ${form.heartbeatTimeout}`);
  }
  lines.push('    activity.logger.info("Activity started")');
  lines.push('    activity.heartbeat("initializing")');

  if (form.steps.length > 0) {
    form.steps.forEach((step, idx) => {
      lines.push('');
      lines.push(`    # Step ${idx + 1}: ${step.name}`);
      lines.push(`    activity.heartbeat("executing_step_${idx + 1}")`);
      lines.push(`    info = activity.info()`);
      lines.push('    if info.is_cancelled:');
      lines.push('        activity.logger.warning("Activity cancelled")');
      lines.push('        return {"status": "cancelled", "step": ' + (idx + 1) + '}');

      if (step.type === 'api') {
        lines.push(`    result_${idx + 1} = yield execute_api_request(`);
        lines.push(`        endpoint="${step.config.endpoint || 'https://api.example.com'}",`);
        lines.push(`        method="${step.config.method || 'POST'}"`);
        if (step.idempotencyKey) {
          lines.push(`        idempotency_key="${step.idempotencyKey}"`);
        }
        lines.push('    )');
      } else if (step.type === 'script') {
        lines.push(`    result_${idx + 1} = yield execute_script(`);
        lines.push('        """');
        lines.push((step.config.script || '// your code here').split('\n').map(l => `        ${l}`).join('\n'));
        lines.push('        """');
        lines.push('    )');
      } else if (step.type === 'carbone') {
        lines.push(`    result_${idx + 1} = yield render_with_carbone(`);
        lines.push(`        template_id="${step.config.templateId || '{{template_id}}'}",`);
        lines.push(`        data=input_data`);
        lines.push('    )');
      } else if (step.type === 'browser') {
        lines.push(`    result_${idx + 1} = yield execute_browser_action(`);
        lines.push(`        action="${step.config.action || 'click'}",`);
        lines.push(`        selector="${step.config.selector || '{{selector}}'}"`);
        lines.push('    )');
      }
    });
  } else {
    lines.push('    # Main activity logic');
    if (form.handler === 'api' && form.config.endpoint) {
      lines.push('    result = yield execute_api_request(');
      lines.push(`        endpoint="${form.config.endpoint}",`);
      lines.push(`        method="${form.config.method || 'POST'}"`);
      if (form.idempotencyKey) {
        lines.push(`        idempotency_key="${form.idempotencyKey}"`);
      }
      lines.push('    )');
    } else if (form.handler === 'script' && form.config.script) {
      lines.push('    result = yield execute_script(');
      lines.push('        """');
      lines.push(form.config.script.split('\n').map(l => `        ${l}`).join('\n'));
      lines.push('        """');
      lines.push('    )');
    }
  }

  lines.push('');
  lines.push('    # Final heartbeat');
  lines.push('    activity.heartbeat("completed")');
  lines.push('');
  lines.push('    return {');
  lines.push('        "status": "success",');
  lines.push(`        "activity": "${form.name}",`);
  lines.push('        "result": result if "result" in dir() else {}');
  lines.push('    }');
  lines.push('');
  lines.push('def get_heartbeat_details() -> Optional[Dict[str, Any]]:');
  lines.push('    """Retrieve heartbeat details for recovery."""');
  lines.push('    info = activity.info()');
  lines.push('    return info.heartbeat_details if hasattr(info, "heartbeat_details") else None');

  return lines.join('\n');
};

const ActivityPage: React.FC = () => {
  const { t } = useTranslation(['common', 'admin']);
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const [searchText, setSearchText] = useState('');
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [validateModalVisible, setValidateModalVisible] = useState(false);
  const [simulationModalVisible, setSimulationModalVisible] = useState(false);
  const [showCodePreview, setShowCodePreview] = useState(false);
  const [editingActivity, setEditingActivity] = useState<ActivityDTO | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<ActivityDTO | null>(null);
  const [validationResult, setValidationResult] = useState<ActivityValidationResult | null>(null);
  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [activityForm, setActivityForm] = useState<ActivityFormData>({
    name: '',
    fn: '',
    taskQueue: 'SKILL_TASK_QUEUE',
    startToCloseTimeout: '60s',
    scheduleToStartTimeout: '30s',
    scheduleToCloseTimeout: '120s',
    heartbeatTimeout: '10s',
    handler: 'api',
    retryPolicy: { maxRetries: 3, backoffMs: 1000 },
    idempotencyKey: '{{workflowId}}-{{activityName}}-{{inputHash}}',
    inputSchema: '{"type": "object", "properties": {"id": {"type": "string"}}}',
    steps: [],
    config: {},
  });

  const activitiesQuery = useQuery(['activities', searchText], () => activityApi.list());

  const createMutation = useMutation(activityApi.create, {
    onSuccess: () => {
      message.success(t('common:success'));
      queryClient.invalidateQueries(['activities']);
      setEditModalVisible(false);
      form.resetFields();
      resetForm();
    },
    onError: () => message.error(t('common:error')),
  });

  const updateMutation = useMutation(
    ({ id, data }: { id: string; data: Partial<CreateActivityDto> }) => activityApi.update(id, data),
    {
      onSuccess: () => {
        message.success(t('common:success'));
        queryClient.invalidateQueries(['activities']);
        setEditModalVisible(false);
      },
      onError: () => message.error(t('common:error')),
    }
  );

  const deleteMutation = useMutation(activityApi.delete, {
    onSuccess: () => {
      message.success(t('common:success'));
      queryClient.invalidateQueries(['activities']);
    },
    onError: () => message.error(t('common:error')),
  });

  const validateMutation = useMutation(activityApi.validate, {
    onSuccess: (result) => {
      setValidationResult(result);
      message.success('验证完成');
    },
    onError: () => message.error('验证失败'),
  });

  const resetForm = () => {
    setActivityForm({
      name: '', fn: '', taskQueue: 'SKILL_TASK_QUEUE',
      startToCloseTimeout: '60s', scheduleToStartTimeout: '30s',
      scheduleToCloseTimeout: '120s', heartbeatTimeout: '10s',
      handler: 'api', retryPolicy: { maxRetries: 3, backoffMs: 1000 },
      idempotencyKey: '{{workflowId}}-{{activityName}}-{{inputHash}}',
      inputSchema: '{"type": "object", "properties": {"id": {"type": "string"}}}',
      steps: [], config: {},
    });
  };

  const handleCreate = () => {
    setEditingActivity(null);
    resetForm();
    setEditModalVisible(true);
  };

  const handleEdit = (activity: ActivityDTO) => {
    setEditingActivity(activity);
    setActivityForm({
      name: activity.name,
      fn: activity.fn,
      taskQueue: 'SKILL_TASK_QUEUE',
      startToCloseTimeout: '60s',
      scheduleToStartTimeout: '30s',
      scheduleToCloseTimeout: '120s',
      heartbeatTimeout: '10s',
      handler: activity.handler as 'api' | 'carbone' | 'browser' | 'script',
      retryPolicy: activity.retryPolicy || undefined,
      config: activity.config || {},
    });
    setEditModalVisible(true);
  };

  const handleViewDetail = (activity: ActivityDTO) => {
    setSelectedActivity(activity);
    setDetailModalVisible(true);
  };

  const handleValidate = () => {
    setValidationResult(null);
    setValidateModalVisible(true);
    validateMutation.mutate(activityForm as CreateActivityDto);
  };

  const handleSave = () => {
    const data: CreateActivityDto = {
      name: activityForm.name,
      fn: activityForm.fn,
      timeout: activityForm.startToCloseTimeout,
      handler: activityForm.handler,
      retryPolicy: activityForm.retryPolicy,
      config: { ...activityForm.config, taskQueue: activityForm.taskQueue },
    };

    if (editingActivity) {
      updateMutation.mutate({ id: editingActivity.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleDelete = (id: string) => {
    Modal.confirm({
      title: t('common:confirmDelete'),
      content: '删除后无法恢复，是否继续？',
      onOk: () => deleteMutation.mutate(id),
    });
  };

  const handleSimulate = (type: 'success' | 'failure' | 'timeout' | 'heartbeat') => {
    setSimulationResult({
      type,
      timestamp: new Date().toISOString(),
      message: type === 'success' ? 'Activity 执行成功' :
        type === 'failure' ? 'Activity 执行失败' :
        type === 'timeout' ? 'Activity 执行超时' : '心跳已发送',
      heartbeatEvents: type === 'heartbeat' ? [
        { time: '00:00:01', stage: 'initializing' },
        { time: '00:00:05', stage: 'executing_step_1' },
        { time: '00:00:10', stage: 'completed' },
      ] : [],
    });
  };

  const updateActivityForm = (field: string, value: any) => {
    setActivityForm((prev) => ({ ...prev, [field]: value }));
  };

  const addStep = () => {
    const newStep: ActivityStep = {
      id: `step_${Date.now()}`,
      name: `Step ${activityForm.steps.length + 1}`,
      type: 'api',
      timeout: '30s',
      config: { endpoint: '', method: 'POST' },
    };
    setActivityForm((prev) => ({ ...prev, steps: [...prev.steps, newStep] }));
  };

  const removeStep = (id: string) => {
    setActivityForm((prev) => ({ ...prev, steps: prev.steps.filter(s => s.id !== id) }));
  };

  const updateStep = (id: string, field: string, value: any) => {
    setActivityForm((prev) => ({
      ...prev,
      steps: prev.steps.map(s => s.id === id ? { ...s, [field]: value } : s)
    }));
  };

  const copyCode = () => {
    navigator.clipboard.writeText(generatePythonCode(activityForm));
    message.success('代码已复制到剪贴板');
  };

  const generatedCode = generatePythonCode(activityForm);

  const columns: ColumnsType<ActivityDTO> = [
    { title: '活动名称', dataIndex: 'name', key: 'name', width: 200, render: (name, r) => <a onClick={() => handleViewDetail(r)}><Text strong>{name}</Text></a> },
    { title: '函数名', dataIndex: 'fn', key: 'fn', width: 180, render: fn => <Tag color="cyan">{fn}</Tag> },
    { title: '处理器', dataIndex: 'handler', key: 'handler', width: 120, render: handler => <Tag color={HANDLER_CONFIG[handler]?.color}>{HANDLER_CONFIG[handler]?.label}</Tag> },
    { title: '超时', dataIndex: 'timeout', key: 'timeout', width: 80 },
    { title: '重试策略', key: 'retryPolicy', width: 100, render: (_, r) => r.retryPolicy ? <Tag color="orange">已配置</Tag> : <Tag color="default">无</Tag> },
    { title: '状态', key: 'status', width: 80, render: (_, r) => <Tag color={r.isActive ? 'green' : 'default'}>{r.isActive ? '已启用' : '已禁用'}</Tag> },
    { title: t('common:actions'), key: 'actions', width: 180, render: (_, r) => (
      <Space size="small">
        <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(r)}>编辑</Button>
        <Popconfirm title="确认删除" onConfirm={() => handleDelete(r.id)} okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
          <Button type="link" size="small" icon={<DeleteOutlined />} danger />
        </Popconfirm>
      </Space>
    )},
  ];

  const filteredActivities = (activitiesQuery.data || []).filter(a =>
    a.name.toLowerCase().includes(searchText.toLowerCase()) || a.fn.toLowerCase().includes(searchText.toLowerCase())
  );

  const stats = {
    total: activitiesQuery.data?.length || 0,
    api: activitiesQuery.data?.filter(a => a.handler === 'api').length || 0,
    script: activitiesQuery.data?.filter(a => a.handler === 'script').length || 0,
    active: activitiesQuery.data?.filter(a => a.isActive).length || 0,
  };

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}><Card><Statistic title="总 Activity 数" value={stats.total} prefix={<ThunderboltOutlined />} /></Card></Col>
        <Col span={6}><Card><Statistic title="API 类型" value={stats.api} prefix={<ApiOutlined />} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col span={6}><Card><Statistic title="脚本类型" value={stats.script} prefix={<CodeOutlined />} valueStyle={{ color: '#fa8c16' }} /></Card></Col>
        <Col span={6}><Card><Statistic title="已启用" value={stats.active} prefix={<CheckCircleOutlined />} valueStyle={{ color: '#1890ff' }} /></Card></Col>
      </Row>

      <Card style={{ marginBottom: 16 }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Input placeholder="搜索活动..." prefix={<SearchOutlined />} value={searchText} onChange={e => setSearchText(e.target.value)} style={{ width: 200 }} allowClear />
          <Space>
            <Button icon={<PlusOutlined />} type="primary" onClick={handleCreate}>创建 Activity</Button>
            <Button icon={<ReloadOutlined />} onClick={() => activitiesQuery.refetch()}>{t('common:refresh')}</Button>
          </Space>
        </Space>
      </Card>

      <Card>
        <Table columns={columns} dataSource={filteredActivities} rowKey="id" loading={activitiesQuery.isLoading} pagination={{ showSizeChanger: true, showTotal: total => `共 ${total} 条` }} />
      </Card>

      {/* Edit Modal - Single Page Form */}
      <Modal
        title={editingActivity ? '编辑 Activity' : '创建 Activity'}
        open={editModalVisible}
        onCancel={() => setEditModalVisible(false)}
        footer={null}
        width={1000}
        destroyOnClose
      >
        <div style={{ display: 'flex', gap: 24 }}>
          {/* Left Panel - Form Fields */}
          <div style={{ flex: 1, overflow: 'auto', maxHeight: 600 }}>
            <Form layout="vertical" form={form}>
              {/* Basic Info Section */}
              <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
                <Title level={5} style={{ marginBottom: 12 }}><ThunderboltOutlined /> 必填项</Title>
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item label="Activity 名称" required>
                      <Input value={activityForm.name} onChange={e => updateActivityForm('name', e.target.value)} placeholder="例如：生成合同参数" />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item label="函数名" required>
                      <Input value={activityForm.fn} onChange={e => updateActivityForm('fn', e.target.value)} placeholder="例如：generateContractParams" />
                    </Form.Item>
                  </Col>
                </Row>
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item label="Task Queue" required>
                      <Input value={activityForm.taskQueue} onChange={e => updateActivityForm('taskQueue', e.target.value)} placeholder="SKILL_TASK_QUEUE" />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item label="StartToClose 超时" required>
                      <Select value={activityForm.startToCloseTimeout} onChange={v => updateActivityForm('startToCloseTimeout', v)}>
                        <Option value="30s">30s</Option>
                        <Option value="60s">60s</Option>
                        <Option value="120s">120s</Option>
                        <Option value="300s">300s</Option>
                      </Select>
                    </Form.Item>
                  </Col>
                </Row>
              </Card>

              {/* Input Schema */}
              <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
                <Title level={5} style={{ marginBottom: 12 }}><KeyOutlined /> 输入 Schema 与幂等键</Title>
                <Form.Item label="输入 Schema (JSON)">
                  <TextArea
                    value={activityForm.inputSchema}
                    onChange={e => updateActivityForm('inputSchema', e.target.value)}
                    placeholder='{"type": "object", "properties": {"id": {"type": "string"}}}'
                    rows={3}
                    style={{ fontFamily: 'monospace' }}
                  />
                </Form.Item>
                <Form.Item label="幂等键策略">
                  <Input
                    value={activityForm.idempotencyKey}
                    onChange={e => updateActivityForm('idempotencyKey', e.target.value)}
                    placeholder="{{workflowId}}-{{activityName}}-{{inputHash}}"
                  />
                </Form.Item>
              </Card>

              {/* Heartbeat & Retry Section */}
              <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
                <Title level={5} style={{ marginBottom: 12 }}><HeartOutlined /> 心跳与重试配置</Title>
                <Row gutter={16}>
                  <Col span={8}>
                    <Form.Item label="心跳超时">
                      <Select value={activityForm.heartbeatTimeout} onChange={v => updateActivityForm('heartbeatTimeout', v)}>
                        <Option value="5s">5s</Option>
                        <Option value="10s">10s</Option>
                        <Option value="30s">30s</Option>
                        <Option value="60s">60s</Option>
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item label="ScheduleToStart">
                      <Select value={activityForm.scheduleToStartTimeout} onChange={v => updateActivityForm('scheduleToStartTimeout', v)}>
                        <Option value="10s">10s</Option>
                        <Option value="30s">30s</Option>
                        <Option value="60s">60s</Option>
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item label="ScheduleToClose">
                      <Select value={activityForm.scheduleToCloseTimeout} onChange={v => updateActivityForm('scheduleToCloseTimeout', v)}>
                        <Option value="60s">60s</Option>
                        <Option value="120s">120s</Option>
                        <Option value="300s">300s</Option>
                      </Select>
                    </Form.Item>
                  </Col>
                </Row>
                <Row gutter={16} align="middle">
                  <Col span={8}>
                    <Form.Item label="启用重试">
                      <Switch checked={!!activityForm.retryPolicy} onChange={checked => updateActivityForm('retryPolicy', checked ? { maxRetries: 3, backoffMs: 1000 } : undefined)} />
                    </Form.Item>
                  </Col>
                  {activityForm.retryPolicy && (
                    <>
                      <Col span={8}>
                        <Form.Item label="最大重试次数">
                          <InputNumber value={activityForm.retryPolicy.maxRetries} onChange={v => updateActivityForm('retryPolicy', { ...activityForm.retryPolicy!, maxRetries: v || 0 })} min={1} max={10} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item label="退避间隔 (ms)">
                          <InputNumber value={activityForm.retryPolicy.backoffMs || 1000} onChange={v => updateActivityForm('retryPolicy', { ...activityForm.retryPolicy!, backoffMs: v || 1000 })} min={100} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                    </>
                  )}
                </Row>
              </Card>

              {/* Handler Config */}
              <Card size="small" style={{ marginBottom: 16 }}>
                <Title level={5} style={{ marginBottom: 12 }}><SettingOutlined /> 处理器配置</Title>
                <Row gutter={16}>
                  <Col span={8}>
                    <Form.Item label="处理器类型">
                      <Select value={activityForm.handler} onChange={v => updateActivityForm('handler', v)}>
                        <Option value="api">API 调用</Option>
                        <Option value="carbone">Carbone 渲染</Option>
                        <Option value="browser">浏览器操作</Option>
                        <Option value="script">脚本执行</Option>
                      </Select>
                    </Form.Item>
                  </Col>
                </Row>
                {activityForm.handler === 'api' && (
                  <Row gutter={16}>
                    <Col span={16}>
                      <Form.Item label="API 端点">
                        <Input value={activityForm.config.endpoint || ''} onChange={e => updateActivityForm('config', { ...activityForm.config, endpoint: e.target.value })} placeholder="https://api.example.com/v1/resource" />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item label="HTTP 方法">
                        <Select value={activityForm.config.method || 'POST'} onChange={v => updateActivityForm('config', { ...activityForm.config, method: v })}>
                          <Option value="GET">GET</Option>
                          <Option value="POST">POST</Option>
                          <Option value="PUT">PUT</Option>
                          <Option value="DELETE">DELETE</Option>
                        </Select>
                      </Form.Item>
                    </Col>
                  </Row>
                )}
                {activityForm.handler === 'script' && (
                  <Form.Item label="脚本内容">
                    <TextArea
                      rows={4}
                      value={activityForm.config.script || ''}
                      onChange={e => updateActivityForm('config', { ...activityForm.config, script: e.target.value })}
                      placeholder="async function execute(params, context) { return { status: 'success' }; }"
                      style={{ fontFamily: 'monospace' }}
                    />
                  </Form.Item>
                )}
              </Card>

              {/* Steps Section */}
              <Card size="small" style={{ marginBottom: 16 }}>
                <Title level={5} style={{ marginBottom: 12 }}><OrderedListOutlined /> 内部步骤</Title>
                <Button type="dashed" icon={<PlusOutlined />} onClick={addStep} block style={{ marginBottom: 12 }}>
                  添加步骤
                </Button>
                {activityForm.steps.length === 0 ? (
                  <Text type="secondary">暂无步骤，添加步骤以创建多步骤 Activity</Text>
                ) : (
                  activityForm.steps.map((step, idx) => (
                    <Card key={step.id} size="small" style={{ marginBottom: 8, border: '1px solid #d9d9d9' }}>
                      <Row gutter={12} align="middle">
                        <Col><Badge count={idx + 1} style={{ backgroundColor: '#1890ff' }} /></Col>
                        <Col flex={1}>
                          <Input value={step.name} onChange={e => updateStep(step.id, 'name', e.target.value)} placeholder="步骤名称" style={{ marginBottom: 8 }} />
                          <Space>
                            <Select value={step.type} onChange={v => updateStep(step.id, 'type', v)} style={{ width: 100 }}>
                              <Option value="api">API</Option>
                              <Option value="script">脚本</Option>
                              <Option value="carbone">Carbone</Option>
                              <Option value="browser">浏览器</Option>
                            </Select>
                            <Input value={step.timeout} onChange={e => updateStep(step.id, 'timeout', e.target.value)} placeholder="超时" style={{ width: 80 }} />
                          </Space>
                        </Col>
                        <Col>
                          <Button type="text" danger icon={<DeleteOutlined />} onClick={() => removeStep(step.id)} />
                        </Col>
                      </Row>
                      {step.type === 'api' && (
                        <div style={{ marginTop: 8, padding: 8, background: '#f6ffed', borderRadius: 4 }}>
                          <Input value={step.config.endpoint || ''} onChange={e => updateStep(step.id, 'config', { ...step.config, endpoint: e.target.value })} placeholder="API 端点" prefix={<ApiOutlined />} />
                        </div>
                      )}
                      {step.type === 'script' && (
                        <div style={{ marginTop: 8, padding: 8, background: '#fff7e6', borderRadius: 4 }}>
                          <TextArea value={step.config.script || ''} onChange={e => updateStep(step.id, 'config', { ...step.config, script: e.target.value })} placeholder="// 脚本代码..." rows={2} style={{ fontFamily: 'monospace' }} />
                        </div>
                      )}
                    </Card>
                  ))
                )}
              </Card>

              {/* Action Buttons */}
              <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                <Button icon={<PlayCircleOutlined />} onClick={handleValidate}>验证</Button>
                <Button icon={<ExperimentOutlined />} onClick={() => setSimulationModalVisible(true)}>模拟测试</Button>
                <Button onClick={() => setEditModalVisible(false)}>取消</Button>
                <Button type="primary" icon={<SaveOutlined />} loading={createMutation.isLoading || updateMutation.isLoading} onClick={handleSave}>保存</Button>
              </Space>
            </Form>
          </div>
        </div>
      </Modal>

      {/* Simulation Modal */}
      <Modal
        title="模拟测试"
        open={simulationModalVisible}
        onCancel={() => setSimulationModalVisible(false)}
        footer={null}
        width={600}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text>选择模拟场景：</Text>
          <Space wrap>
            <Button icon={<CheckCircleOutlined />} onClick={() => handleSimulate('success')} type="primary">模拟成功</Button>
            <Button icon={<WarningOutlined />} danger onClick={() => handleSimulate('failure')}>模拟失败</Button>
            <Button icon={<ClockCircleOutlined />} onClick={() => handleSimulate('timeout')}>模拟超时</Button>
            <Button icon={<HeartOutlined />} onClick={() => handleSimulate('heartbeat')}>模拟心跳</Button>
          </Space>
          {simulationResult && (
            <Card size="small" style={{ marginTop: 16, background: '#f5f5f5' }}>
              <p><strong>类型：</strong>{simulationResult.type}</p>
              <p><strong>时间：</strong>{simulationResult.timestamp}</p>
              <p><strong>消息：</strong>{simulationResult.message}</p>
              {simulationResult.heartbeatEvents?.length > 0 && (
                <>
                  <p><strong>心跳事件：</strong></p>
                  <Timeline items={simulationResult.heartbeatEvents.map(e => ({ children: `${e.time} - ${e.stage}` }))} />
                </>
              )}
            </Card>
          )}
        </Space>
      </Modal>

      {/* Detail Modal with Monitoring */}
      <Modal
        title="Activity 详情与监控"
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={null}
        width={800}
      >
        {selectedActivity && (
          <Collapse defaultActiveKey={['basic', 'monitoring', 'config']}>
            <Panel header={<Text><ThunderboltOutlined /> 基本信息</Text>} key="basic">
              <Row gutter={16}>
                <Col span={12}><Text><strong>名称:</strong> {selectedActivity.name}</Text></Col>
                <Col span={12}><Text><strong>函数名:</strong> <Tag color="cyan">{selectedActivity.fn}</Tag></Text></Col>
                <Col span={12}><Text><strong>处理器:</strong> <Tag color={HANDLER_CONFIG[selectedActivity.handler]?.color}>{HANDLER_CONFIG[selectedActivity.handler]?.label}</Tag></Text></Col>
                <Col span={12}><Text><strong>超时:</strong> {selectedActivity.timeout}</Text></Col>
              </Row>
            </Panel>
            <Panel header={<Text><LineChartOutlined /> 监控面板</Text>} key="monitoring">
              <Row gutter={16}>
                <Col span={8}><Card size="small"><Statistic title="平均耗时" value="1.2s" prefix={<ClockCircleOutlined />} /></Card></Col>
                <Col span={8}><Card size="small"><Statistic title="失败率" value="0.5%" prefix={<WarningOutlined />} valueStyle={{ color: '#52c41a' }} /></Card></Col>
                <Col span={8}><Card size="small"><Statistic title="Task Queue Backlog" value="12" prefix={<ThunderboltOutlined />} /></Card></Col>
              </Row>
              <Divider />
              <Text strong>心跳时间线</Text>
              <Timeline items={[
                { children: '00:00:00 - Activity 启动' },
                { children: '00:00:01 - 心跳: initializing' },
                { children: '00:00:03 - 心跳: step_1_completed' },
                { children: '00:00:05 - Activity 完成' },
              ]} style={{ marginTop: 12 }} />
              <Divider />
              <Text strong>重试轨迹</Text>
              <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>暂无重试记录</Text>
            </Panel>
            <Panel header={<Text><SettingOutlined /> 配置详情</Text>} key="config">
              <pre style={{ background: '#f5f5f5', padding: 16, borderRadius: 8, maxHeight: 300, overflow: 'auto', fontSize: 12 }}>
                {JSON.stringify(selectedActivity.config, null, 2)}
              </pre>
            </Panel>
          </Collapse>
        )}
      </Modal>

      {/* Validation Modal */}
      <Modal title="验证结果" open={validateModalVisible} onCancel={() => setValidateModalVisible(false)} footer={[<Button onClick={() => setValidateModalVisible(false)}>关闭</Button>]} width={500}>
        {validationResult ? (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Alert type={validationResult.isValid ? 'success' : 'error'} message={validationResult.isValid ? '验证通过' : '验证失败'} showIcon />
            <Card><Text><strong>评分:</strong> {validationResult.score}/100</Text></Card>
            {validationResult.errors.length > 0 && <Alert type="error" message="错误" description={<ul>{validationResult.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>} />}
            {validationResult.warnings?.length > 0 && <Alert type="warning" message="警告" description={<ul>{validationResult.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>} />}
          </Space>
        ) : <Alert type="info" message="点击验证按钮开始验证" />}
      </Modal>
    </div>
  );
};

export default ActivityPage;