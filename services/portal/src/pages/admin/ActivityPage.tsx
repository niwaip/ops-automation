import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Card, Button, Input, Space, Tag, Typography, Modal, message, Form, Select,
  Divider, Alert, Collapse, Badge, Popconfirm, Tooltip, Statistic, Row, Col, Switch,
  Tabs, Steps, Timeline, Progress, Empty, Drawer, List, Avatar, Slider, InputNumber,
  Radio, Checkbox, Modal as ConfirmModal
} from 'antd';
import {
  SearchOutlined, PlusOutlined, EditOutlined, DeleteOutlined, PlayCircleOutlined,
  ReloadOutlined, ApiOutlined, CodeOutlined, FileTextOutlined, ChromeOutlined,
  CheckCircleOutlined, ThunderboltOutlined, SettingOutlined, SyncOutlined,
  RobotOutlined, EyeOutlined, SaveOutlined, CloseOutlined, DragOutlined,
  UpOutlined, DownOutlined, CopyOutlined, ClearOutlined, ExperimentOutlined,
  HeartOutlined, ClockCircleOutlined, RetweetOutlined, SafetyOutlined,
  ThunderboltOutlined as LightningBold, CaretUpOutlined, CaretDownOutlined,
  BugOutlined, FieldTimeOutlined, KeyOutlined, LoadingOutlined
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { activityApi, ActivityDTO, CreateActivityDto, ActivityValidationResult } from '../../api/activity';
import type { ColumnsType } from 'antd/es/table';

const { Text, Paragraph, Title } = Typography;
const { Option } = Select;
const { Panel } = Collapse;
const { TextArea } = Input;
const { TabPane } = Tabs;

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
  retryPolicy?: { maxRetries: number; backoffMs?: number };
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
  timeout: string;
  handler: 'api' | 'carbone' | 'browser' | 'script';
  retryPolicy?: { maxRetries: number; backoffMs?: number };
  heartbeatTimeout?: string;
  startToCloseTimeout?: string;
  scheduleToStartTimeout?: string;
  scheduleToCloseTimeout?: string;
  idempotencyKey?: string;
  inputSchema?: string;
  outputSchema?: string;
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
  lines.push('    """Auto-generated activity with heartbeat support."""');
  lines.push('    activity.logger.info(f"Starting activity ${form.name}")');
  lines.push('');
  lines.push('    # Send heartbeat to indicate progress');
  lines.push('    activity.heartbeat("initializing")');
  lines.push('');

  if (form.steps.length > 0) {
    form.steps.forEach((step, idx) => {
      lines.push(`    # Step ${idx + 1}: ${step.name}`);
      lines.push(`    activity.heartbeat("executing_step_${idx + 1}")`);

      if (step.type === 'api') {
        lines.push(`    result_${idx + 1} = yield execute_api_request(`);
        lines.push(`        endpoint="${step.config.endpoint || 'https://api.example.com'}",`);
        lines.push(`        method="${step.config.method || 'POST'}",`);
        if (step.config.headers) {
          lines.push(`        headers=${JSON.stringify(step.config.headers, null, 8).replace(/\n/g, '\n        ')}`);
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
      lines.push('');
      lines.push('    # Check for cancellation');
      lines.push('    if activity.is_cancelled():');
      lines.push('        activity.logger.warning("Activity cancelled")');
      lines.push('        return {"status": "cancelled", "step": ' + (idx + 1) + '}');
      lines.push('');
    });
  } else {
    lines.push('    # Main activity logic');
    if (form.handler === 'api' && form.config.endpoint) {
      lines.push('    result = yield execute_api_request(');
      lines.push(`        endpoint="${form.config.endpoint}",`);
      lines.push(`        method="${form.config.method || 'POST'}"`);
      lines.push('    )');
    } else if (form.handler === 'script' && form.config.script) {
      lines.push('    result = yield execute_script(');
      lines.push('        """');
      lines.push(form.config.script.split('\n').map(l => `        ${l}`).join('\n'));
      lines.push('        """');
      lines.push('    )');
    }
  }

  lines.push('    # Final heartbeat');
  lines.push('    activity.heartbeat("completed")');
  lines.push('');
  lines.push('    return {');
  lines.push('        "status": "success",');
  lines.push(`        "activity": "${form.name}",`);
  lines.push('        "result": result if "result" in dir() else {}');
  lines.push('    }');
  lines.push('');
  lines.push('@activity.defn');
  lines.push('def get_${form.fn}_heartbeat_details() -> Optional[Dict[str, Any]]:');
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
  const [aiGenerating, setAiGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState('schema');
  const [editingActivity, setEditingActivity] = useState<ActivityDTO | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<ActivityDTO | null>(null);
  const [validationResult, setValidationResult] = useState<ActivityValidationResult | null>(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [showCodePreview, setShowCodePreview] = useState(true);
  const [activityForm, setActivityForm] = useState<ActivityFormData>({
    name: '',
    fn: '',
    timeout: '30s',
    handler: 'api',
    heartbeatTimeout: '10s',
    startToCloseTimeout: '60s',
    scheduleToStartTimeout: '30s',
    scheduleToCloseTimeout: '120s',
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
      name: '', fn: '', timeout: '30s', handler: 'api',
      heartbeatTimeout: '10s', startToCloseTimeout: '60s',
      scheduleToStartTimeout: '30s', scheduleToCloseTimeout: '120s',
      steps: [], config: {},
    });
    setGeneratedCode('');
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
      timeout: activity.timeout,
      handler: activity.handler as 'api' | 'carbone' | 'browser' | 'script',
      retryPolicy: activity.retryPolicy || undefined,
      config: activity.config || {},
    });
    form.setFieldsValue({ name: activity.name, fn: activity.fn, timeout: activity.timeout, handler: activity.handler });
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
      timeout: activityForm.timeout,
      handler: activityForm.handler,
      retryPolicy: activityForm.retryPolicy,
      config: activityForm.config,
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

  const handleAiGenerate = useCallback(() => {
    if (!aiPrompt.trim()) {
      message.warning('请输入 Activity 描述');
      return;
    }
    setAiGenerating(true);
    setTimeout(() => {
      const code = generatePythonCode(activityForm);
      setGeneratedCode(code);
      setAiGenerating(false);
      message.success('AI 代码已生成');
    }, 1500);
  }, [aiPrompt, activityForm]);

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

  const moveStep = (id: string, direction: 'up' | 'down') => {
    const idx = activityForm.steps.findIndex(s => s.id === id);
    if (idx === -1) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === activityForm.steps.length - 1) return;

    const newSteps = [...activityForm.steps];
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    [newSteps[idx], newSteps[targetIdx]] = [newSteps[targetIdx], newSteps[idx]];
    setActivityForm((prev) => ({ ...prev, steps: newSteps }));
  };

  const copyCode = () => {
    navigator.clipboard.writeText(generatedCode);
    message.success('代码已复制到剪贴板');
  };

  useEffect(() => {
    if (editModalVisible) {
      const code = generatePythonCode(activityForm);
      setGeneratedCode(code);
    }
  }, [activityForm, editModalVisible]);

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

  const StepCard: React.FC<{ step: ActivityStep; index: number }> = ({ step, index }) => (
    <Card size="small" style={{ marginBottom: 12, border: '1px solid #d9d9d9', borderRadius: 8 }}>
      <Row gutter={12} align="middle">
        <Col>
          <Badge count={index + 1} style={{ backgroundColor: '#1890ff' }} />
        </Col>
        <Col flex={1}>
          <Input
            value={step.name}
            onChange={e => updateStep(step.id, 'name', e.target.value)}
            placeholder="步骤名称"
            style={{ marginBottom: 8 }}
          />
          <Space>
            <Select value={step.type} onChange={v => updateStep(step.id, 'type', v)} style={{ width: 120 }}>
              <Option value="api">API 调用</Option>
              <Option value="script">脚本执行</Option>
              <Option value="carbone">Carbone</Option>
              <Option value="browser">浏览器</Option>
            </Select>
            <Input
              value={step.timeout}
              onChange={e => updateStep(step.id, 'timeout', e.target.value)}
              placeholder="超时"
              style={{ width: 80 }}
            />
          </Space>
        </Col>
        <Col>
          <Space direction="vertical">
            <Button type="text" size="small" icon={<UpOutlined />} onClick={() => moveStep(step.id, 'up')} disabled={index === 0} />
            <Button type="text" size="small" icon={<DownOutlined />} onClick={() => moveStep(step.id, 'down')} disabled={index === activityForm.steps.length - 1} />
          </Space>
        </Col>
        <Col>
          <Button type="text" danger icon={<DeleteOutlined />} onClick={() => removeStep(step.id)} />
        </Col>
      </Row>

      {step.type === 'api' && (
        <div style={{ marginTop: 12, padding: 12, background: '#f6ffed', borderRadius: 6 }}>
          <Row gutter={16}>
            <Col span={16}>
              <Input
                value={step.config.endpoint || ''}
                onChange={e => updateStep(step.id, 'config', { ...step.config, endpoint: e.target.value })}
                placeholder="API 端点 URL"
                prefix={<ApiOutlined />}
              />
            </Col>
            <Col span={8}>
              <Select value={step.config.method || 'POST'} onChange={v => updateStep(step.id, 'config', { ...step.config, method: v })} style={{ width: '100%' }}>
                <Option value="GET">GET</Option>
                <Option value="POST">POST</Option>
                <Option value="PUT">PUT</Option>
                <Option value="DELETE">DELETE</Option>
              </Select>
            </Col>
          </Row>
        </div>
      )}

      {step.type === 'script' && (
        <div style={{ marginTop: 12, padding: 12, background: '#fff7e6', borderRadius: 6 }}>
          <TextArea
            value={step.config.script || ''}
            onChange={e => updateStep(step.id, 'config', { ...step.config, script: e.target.value })}
            placeholder="// 输入脚本代码..."
            rows={4}
            style={{ fontFamily: 'monospace', fontSize: 12 }}
          />
        </div>
      )}

      <Row gutter={16} style={{ marginTop: 12 }}>
        <Col span={8}>
          <Text type="secondary" style={{ fontSize: 12 }}>重试次数</Text>
          <InputNumber
            value={step.retryPolicy?.maxRetries ?? 0}
            onChange={v => updateStep(step.id, 'retryPolicy', { maxRetries: v || 0 })}
            min={0} max={10}
            style={{ width: '100%' }}
          />
        </Col>
        <Col span={8}>
          <Text type="secondary" style={{ fontSize: 12 }}>Idempotency Key</Text>
          <Input
            value={step.idempotencyKey || ''}
            onChange={e => updateStep(step.id, 'idempotencyKey', e.target.value)}
            placeholder="{{input.id}}"
          />
        </Col>
        <Col span={8}>
          <Text type="secondary" style={{ fontSize: 12 }}>心跳超时</Text>
          <Input
            value={step.heartbeatTimeout || '10s'}
            onChange={e => updateStep(step.id, 'heartbeatTimeout', e.target.value)}
          />
        </Col>
      </Row>
    </Card>
  );

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

      <Modal
        title={null}
        open={editModalVisible}
        onCancel={() => setEditModalVisible(false)}
        footer={null}
        width={1200}
        destroyOnClose
        className="activity-edit-modal"
        style={{ top: 20 }}
      >
        <div style={{ display: 'flex', gap: 24, height: 600 }}>
          {/* Left Panel - Configuration */}
          <div style={{ width: 600, overflow: 'auto', paddingRight: 24, borderRight: '1px solid #f0f0f0' }}>
            <div style={{ marginBottom: 16 }}>
              <Title level={4} style={{ marginBottom: 16 }}>
                {editingActivity ? '编辑 Activity' : '创建 Activity'}
              </Title>
              <Space style={{ marginBottom: 16 }}>
                <Button icon={<RobotOutlined />} onClick={() => setShowCodePreview(!showCodePreview)} type={showCodePreview ? 'primary' : 'default'}>
                  {showCodePreview ? '隐藏代码预览' : '显示代码预览'}
                </Button>
              </Space>
            </div>

            <Tabs activeKey={activeTab} onChange={setActiveTab}>
              <TabPane tab="输入/输出 Schema" key="schema">
                <Form layout="vertical">
                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item label="Activity 名称" required>
                        <Input
                          value={activityForm.name}
                          onChange={e => updateActivityForm('name', e.target.value)}
                          placeholder="例如：生成合同参数"
                        />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item label="函数名" required>
                        <Input
                          value={activityForm.fn}
                          onChange={e => updateActivityForm('fn', e.target.value)}
                          placeholder="例如：generateContractParams"
                        />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Form.Item label="输入 Schema (JSON)">
                    <TextArea
                      value={activityForm.inputSchema || ''}
                      onChange={e => updateActivityForm('inputSchema', e.target.value)}
                      placeholder='{"type": "object", "properties": {"templateId": {"type": "string"}}}'
                      rows={3}
                      style={{ fontFamily: 'monospace' }}
                    />
                  </Form.Item>

                  <Form.Item label="输出 Schema (JSON)">
                    <TextArea
                      value={activityForm.outputSchema || ''}
                      onChange={e => updateActivityForm('outputSchema', e.target.value)}
                      placeholder='{"type": "object", "properties": {"status": {"type": "string"}}}'
                      rows={3}
                      style={{ fontFamily: 'monospace' }}
                    />
                  </Form.Item>
                </Form>
              </TabPane>

              <TabPane tab={
                <span>内部步骤 <Badge count={activityForm.steps.length} /></span>
              } key="steps">
                <div style={{ marginBottom: 16 }}>
                  <Button type="dashed" icon={<PlusOutlined />} onClick={addStep} block>
                    添加步骤
                  </Button>
                </div>

                {activityForm.steps.length === 0 ? (
                  <Empty description="暂无步骤，添加步骤以创建多步骤 Activity" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                ) : (
                  activityForm.steps.map((step, idx) => (
                    <StepCard key={step.id} step={step} index={idx} />
                  ))
                )}

                {activityForm.steps.length > 0 && (
                  <Alert
                    message="多步骤 Activity"
                    description="每个步骤将按顺序执行，支持心跳和故障恢复。编辑步骤后代码预览将自动更新。"
                    type="info"
                    showIcon
                    style={{ marginTop: 16 }}
                  />
                )}
              </TabPane>

              <TabPane tab="运行时设置" key="runtime">
                <Form layout="vertical">
                  <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
                    <Title level={5} style={{ marginBottom: 12 }}><ClockCircleOutlined /> 超时配置</Title>
                    <Row gutter={16}>
                      <Col span={12}>
                        <Form.Item label="Start-To-Close 超时">
                          <Input
                            value={activityForm.startToCloseTimeout || '60s'}
                            onChange={e => updateActivityForm('startToCloseTimeout', e.target.value)}
                            placeholder="60s"
                          />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item label="Schedule-To-Start 超时">
                          <Input
                            value={activityForm.scheduleToStartTimeout || '30s'}
                            onChange={e => updateActivityForm('scheduleToStartTimeout', e.target.value)}
                            placeholder="30s"
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={16}>
                      <Col span={12}>
                        <Form.Item label="Schedule-To-Close 超时">
                          <Input
                            value={activityForm.scheduleToCloseTimeout || '120s'}
                            onChange={e => updateActivityForm('scheduleToCloseTimeout', e.target.value)}
                            placeholder="120s"
                          />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item label="心跳超时">
                          <Input
                            value={activityForm.heartbeatTimeout || '10s'}
                            onChange={e => updateActivityForm('heartbeatTimeout', e.target.value)}
                            placeholder="10s"
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                  </Card>

                  <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
                    <Title level={5} style={{ marginBottom: 12 }}><RetweetOutlined /> 重试策略</Title>
                    <Row gutter={16} align="middle">
                      <Col span={8}>
                        <Form.Item label="启用重试">
                          <Switch
                            checked={!!activityForm.retryPolicy}
                            onChange={checked => updateActivityForm('retryPolicy', checked ? { maxRetries: 3 } : undefined)}
                          />
                        </Form.Item>
                      </Col>
                      {activityForm.retryPolicy && (
                        <>
                          <Col span={8}>
                            <Form.Item label="最大重试次数">
                              <InputNumber
                                value={activityForm.retryPolicy.maxRetries}
                                onChange={v => updateActivityForm('retryPolicy', { ...activityForm.retryPolicy!, maxRetries: v || 0 })}
                                min={1} max={10}
                                style={{ width: '100%' }}
                              />
                            </Form.Item>
                          </Col>
                          <Col span={8}>
                            <Form.Item label="退避间隔 (ms)">
                              <InputNumber
                                value={activityForm.retryPolicy.backoffMs || 1000}
                                onChange={v => updateActivityForm('retryPolicy', { ...activityForm.retryPolicy!, backoffMs: v || 1000 })}
                                min={100}
                                style={{ width: '100%' }}
                              />
                            </Form.Item>
                          </Col>
                        </>
                      )}
                    </Row>
                  </Card>

                  <Card size="small" style={{ background: '#fafafa' }}>
                    <Title level={5} style={{ marginBottom: 12 }}><KeyOutlined /> 幂等性配置</Title>
                    <Form.Item label="Idempotency Key 表达式">
                      <Input
                        value={activityForm.idempotencyKey || ''}
                        onChange={e => updateActivityForm('idempotencyKey', e.target.value)}
                        placeholder="{{workflowId}}-{{activityName}}-{{inputHash}}"
                      />
                    </Form.Item>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      用于确保 Activity 的幂等性执行。Temporal 会根据此 Key 缓存结果。
                    </Text>
                  </Card>
                </Form>
              </TabPane>

              <TabPane tab="处理器配置" key="handler">
                <Form layout="vertical">
                  <Row gutter={16}>
                    <Col span={8}>
                      <Form.Item label="超时时间">
                        <Select value={activityForm.timeout} onChange={v => updateActivityForm('timeout', v)}>
                          <Option value="10s">10s</Option>
                          <Option value="30s">30s</Option>
                          <Option value="60s">60s</Option>
                          <Option value="120s">120s</Option>
                        </Select>
                      </Form.Item>
                    </Col>
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
                    <Col span={8}>
                      <Form.Item label="启用重试">
                        <Switch
                          checked={!!activityForm.retryPolicy}
                          onChange={checked => updateActivityForm('retryPolicy', checked ? { maxRetries: 3 } : undefined)}
                        />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Divider>配置详情</Divider>
                  <Card size="small" style={{
                    background: activityForm.handler === 'api' ? 'linear-gradient(135deg, #f6ffed 0%, #fff 100%)' :
                      activityForm.handler === 'script' ? 'linear-gradient(135deg, #fff7e6 0%, #fff 100%)' :
                        'linear-gradient(135deg, #e6f7ff 0%, #fff 100%)',
                    border: `1px solid ${activityForm.handler === 'api' ? '#b7eb8f' : activityForm.handler === 'script' ? '#ffd591' : '#91d5ff'}`
                  }}>
                    <Space align="start">
                      {HANDLER_CONFIG[activityForm.handler]?.icon}
                      <div>
                        <Text strong>{HANDLER_CONFIG[activityForm.handler]?.label}</Text>
                        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                          {HANDLER_CONFIG[activityForm.handler]?.description}
                        </Paragraph>
                      </div>
                    </Space>
                  </Card>

                  {activityForm.handler === 'api' && (
                    <Card size="small" style={{ marginTop: 16 }}>
                      <Form.Item label="API 端点">
                        <Input
                          placeholder="https://api.example.com/v1/resource"
                          value={activityForm.config.endpoint || ''}
                          onChange={e => updateActivityForm('config', { ...activityForm.config, endpoint: e.target.value })}
                        />
                      </Form.Item>
                      <Row gutter={16}>
                        <Col span={12}>
                          <Form.Item label="HTTP 方法">
                            <Select value={activityForm.config.method || 'POST'} onChange={v => updateActivityForm('config', { ...activityForm.config, method: v })}>
                              <Option value="GET">GET</Option>
                              <Option value="POST">POST</Option>
                              <Option value="PUT">PUT</Option>
                              <Option value="DELETE">DELETE</Option>
                            </Select>
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item label="超时 (ms)">
                            <Input type="number" value={activityForm.config.timeout || 30000} onChange={e => updateActivityForm('config', { ...activityForm.config, timeout: parseInt(e.target.value) || 30000 })} />
                          </Form.Item>
                        </Col>
                      </Row>
                    </Card>
                  )}

                  {activityForm.handler === 'script' && (
                    <Card size="small" style={{ marginTop: 16 }}>
                      <Alert message="脚本说明" description="编写自定义 JavaScript/TypeScript 脚本，脚本应返回 Promise" type="info" showIcon style={{ marginBottom: 16 }} />
                      <Form.Item label="脚本内容">
                        <TextArea
                          rows={8}
                          placeholder="async function execute(params, context) { return { status: 'success' }; }"
                          value={activityForm.config.script || ''}
                          onChange={e => updateActivityForm('config', { ...activityForm.config, script: e.target.value })}
                          style={{ fontFamily: 'monospace' }}
                        />
                      </Form.Item>
                    </Card>
                  )}
                </Form>
              </TabPane>

              <TabPane tab="AI 生成" key="ai">
                <div style={{ marginBottom: 16 }}>
                  <Text type="secondary">描述你想要的 Activity 行为，AI 将自动生成代码预览</Text>
                </div>
                <Input.TextArea
                  value={aiPrompt}
                  onChange={e => setAiPrompt(e.target.value)}
                  placeholder="例如：创建一个 Activity，用于从 API 获取合同模板，然后用 Carbone 渲染生成 PDF..."
                  rows={4}
                  style={{ marginBottom: 16 }}
                />
                <Button
                  type="primary"
                  icon={aiGenerating ? <LoadingOutlined /> : <RobotOutlined />}
                  onClick={handleAiGenerate}
                  loading={aiGenerating}
                  block
                >
                  {aiGenerating ? 'AI 正在生成...' : '生成代码预览'}
                </Button>
              </TabPane>
            </Tabs>

            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button icon={<PlayCircleOutlined />} onClick={handleValidate}>验证</Button>
              <Button onClick={() => setEditModalVisible(false)}>取消</Button>
              <Button type="primary" icon={<SaveOutlined />} loading={createMutation.isLoading || updateMutation.isLoading} onClick={handleSave}>
                保存
              </Button>
            </div>
          </div>

          {/* Right Panel - AI Code Preview */}
          {showCodePreview && (
            <div style={{ flex: 1, overflow: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Title level={4} style={{ margin: 0 }}><EyeOutlined /> Python 代码预览</Title>
                <Button icon={<CopyOutlined />} onClick={copyCode}>复制</Button>
              </div>

              <Card
                size="small"
                style={{
                  background: '#1e1e1e',
                  borderRadius: 8,
                  maxHeight: 500,
                  overflow: 'auto'
                }}
                bodyStyle={{ padding: 0 }}
              >
                <pre style={{
                  color: '#d4d4d4',
                  padding: 16,
                  margin: 0,
                  fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
                  fontSize: 13,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all'
                }}>
                  {generatedCode || '# 配置 Activity 后，代码预览将显示在这里\n# 或使用 AI 生成功能自动创建代码'}
                </pre>
              </Card>

              <div style={{ marginTop: 16 }}>
                <Alert
                  message="心跳支持"
                  description={
                    <div>
                      <p style={{ margin: '8px 0' }}><HeartOutlined /> 自动在代码中插入 <code>activity.heartbeat()</code> 调用</p>
                      <p style={{ margin: '8px 0' }}><ReloadOutlined /> 支持从 <code>activity.info().heartbeat_details</code> 恢复执行</p>
                      <p style={{ margin: '8px 0' }}><CheckCircleOutlined /> 多步骤 Activity 会在每个步骤后发送心跳</p>
                    </div>
                  }
                  type="info"
                  showIcon
                />
              </div>
            </div>
          )}
        </div>
      </Modal>

      <Modal title="Activity 详情" open={detailModalVisible} onCancel={() => setDetailModalVisible(false)} footer={null} width={600}>
        {selectedActivity && (
          <Collapse defaultActiveKey={['basic', 'config']}>
            <Panel header={<Text><ThunderboltOutlined /> 基本信息</Text>} key="basic">
              <Row gutter={16}>
                <Col span={12}><Text><strong>名称:</strong> {selectedActivity.name}</Text></Col>
                <Col span={12}><Text><strong>函数名:</strong> <Tag color="cyan">{selectedActivity.fn}</Tag></Text></Col>
                <Col span={12}><Text><strong>处理器:</strong> <Tag color={HANDLER_CONFIG[selectedActivity.handler]?.color}>{HANDLER_CONFIG[selectedActivity.handler]?.label}</Tag></Text></Col>
                <Col span={12}><Text><strong>超时:</strong> {selectedActivity.timeout}</Text></Col>
              </Row>
            </Panel>
            <Panel header={<Text><SettingOutlined /> 配置详情</Text>} key="config"><pre style={{ background: '#f5f5f5', padding: 16, borderRadius: 8, maxHeight: 300, overflow: 'auto', fontSize: 12 }}>{JSON.stringify(selectedActivity.config, null, 2)}</pre></Panel>
          </Collapse>
        )}
      </Modal>

      <Modal title="验证 Activity" open={validateModalVisible} onCancel={() => setValidateModalVisible(false)} footer={[<Button onClick={() => setValidateModalVisible(false)}>关闭</Button>]} width={500}>
        {validationResult ? (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Alert type={validationResult.isValid ? 'success' : 'error'} message={validationResult.isValid ? '验证通过' : '验证失败'} showIcon />
            <Card><Text><strong>评分:</strong> {validationResult.score}/100</Text></Card>
            {validationResult.errors.length > 0 && <Alert type="error" message="错误" description={<ul>{validationResult.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>} />}
          </Space>
        ) : <Alert type="info" message="点击验证按钮开始验证" />}
      </Modal>
    </div>
  );
};

export default ActivityPage;