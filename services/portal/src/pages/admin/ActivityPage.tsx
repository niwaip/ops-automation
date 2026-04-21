import React, { useState } from 'react';
import {
  Table, Card, Button, Input, Space, Tag, Typography, Modal, message, Form, Select,
  Divider, Alert, Collapse, Badge, Popconfirm, Statistic, Row, Col, Switch, InputNumber
} from 'antd';
import {
  SearchOutlined, PlusOutlined, EditOutlined, DeleteOutlined, PlayCircleOutlined,
  ReloadOutlined, ApiOutlined, CodeOutlined, FileTextOutlined, ChromeOutlined,
  CheckCircleOutlined, ThunderboltOutlined, SettingOutlined,
  ExperimentOutlined, HeartOutlined, ClockCircleOutlined, RetweetOutlined,
  LineChartOutlined, WarningOutlined, OrderedListOutlined, CopyOutlined,
  SaveOutlined
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { activityApi, ActivityDTO, CreateActivityDto, ActivityValidationResult } from '../../api/activity';
import type { ColumnsType } from 'antd/es/table';

const { Text, Title } = Typography;
const { Option } = Select;
const { Panel } = Collapse;
const { TextArea } = Input;

const HANDLER_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  api: { label: 'API', color: 'green', icon: <ApiOutlined /> },
  carbone: { label: 'Carbone', color: 'blue', icon: <FileTextOutlined /> },
  browser: { label: '浏览器', color: 'purple', icon: <ChromeOutlined /> },
  script: { label: '脚本', color: 'orange', icon: <CodeOutlined /> },
};

interface ActivityStep {
  id: string;
  name: string;
  type: 'api' | 'carbone' | 'browser' | 'script';
  timeout: string;
  retryPolicy?: { maxRetries: number };
  config: Record<string, any>;
}

interface ActivityFormData {
  name: string;
  fn: string;
  taskQueue: string;
  startToCloseTimeout: string;
  heartbeatTimeout: string;
  scheduleToStartTimeout: string;
  scheduleToCloseTimeout: string;
  retryPolicy?: { maxRetries: number; backoffMs?: number };
  steps: ActivityStep[];
}

const generatePythonCode = (form: ActivityFormData): string => {
  const lines: string[] = [];
  lines.push('from datetime import timedelta');
  lines.push('from temporalio import activity');
  lines.push('from typing import Optional, Dict, Any');
  lines.push('');
  lines.push('@activity.defn');
  lines.push(`def ${form.fn}(input_data: Dict[str, Any]) -> Dict[str, Any]:`);
  lines.push(`    """Auto-generated activity: ${form.name}""".replace('"', '\\"')`);
  lines.push('    activity.logger.info("Activity started")');
  lines.push('    activity.heartbeat("initializing")');

  if (form.steps.length > 0) {
    form.steps.forEach((step, idx) => {
      lines.push('');
      lines.push(`    # Step ${idx + 1}: ${step.name}`);
      lines.push(`    activity.heartbeat("executing_step_${idx + 1}")`);
      lines.push('    info = activity.info()');
      lines.push('    if info.is_cancelled:');
      lines.push('        activity.logger.warning("Activity cancelled")');
      lines.push('        return {"status": "cancelled", "step": ' + (idx + 1) + '}');

      if (step.type === 'api') {
        lines.push(`    result_${idx + 1} = yield execute_api_request(`);
        lines.push(`        endpoint="${step.config.endpoint || 'https://api.example.com'}",`);
        lines.push(`        method="${step.config.method || 'GET'}"`);
        lines.push('    )');
      } else if (step.type === 'script') {
        lines.push(`    result_${idx + 1} = yield execute_script(`);
        lines.push('        """');
        lines.push((step.config.script || '# your code here').split('\n').map(l => `        ${l}`).join('\n'));
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
  }

  lines.push('');
  lines.push('    activity.heartbeat("completed")');
  lines.push('    return {');
  lines.push('        "status": "success",');
  lines.push(`        "activity": "${form.name}",`);
  lines.push('    }');

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
    heartbeatTimeout: '10s',
    scheduleToStartTimeout: '30s',
    scheduleToCloseTimeout: '120s',
    retryPolicy: { maxRetries: 3, backoffMs: 1000 },
    steps: [],
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
      startToCloseTimeout: '60s', heartbeatTimeout: '10s',
      scheduleToStartTimeout: '30s', scheduleToCloseTimeout: '120s',
      retryPolicy: { maxRetries: 3, backoffMs: 1000 },
      steps: [],
    });
  };

  const handleCreate = () => {
    setEditingActivity(null);
    resetForm();
    setEditModalVisible(true);
  };

  const handleEdit = (activity: ActivityDTO) => {
    setEditingActivity(activity);
    const steps: ActivityStep[] = [];
    setActivityForm({
      name: activity.name,
      fn: activity.fn,
      taskQueue: activity.config?.taskQueue || 'SKILL_TASK_QUEUE',
      startToCloseTimeout: '60s',
      heartbeatTimeout: '10s',
      scheduleToStartTimeout: '30s',
      scheduleToCloseTimeout: '120s',
      retryPolicy: activity.retryPolicy || undefined,
      steps,
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
    const handler = activityForm.steps.length > 0 ? activityForm.steps[0].type : 'api';
    validateMutation.mutate({
      name: activityForm.name,
      fn: activityForm.fn,
      timeout: activityForm.startToCloseTimeout,
      handler: handler as any,
      retryPolicy: activityForm.retryPolicy,
      config: { taskQueue: activityForm.taskQueue, steps: activityForm.steps },
    } as any);
  };

  const handleSave = () => {
    const handler = activityForm.steps.length > 0 ? activityForm.steps[0].type : 'api';
    const data: CreateActivityDto = {
      name: activityForm.name,
      fn: activityForm.fn,
      timeout: activityForm.startToCloseTimeout,
      handler: handler as any,
      retryPolicy: activityForm.retryPolicy,
      config: { taskQueue: activityForm.taskQueue, steps: activityForm.steps },
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
      name: `步骤 ${activityForm.steps.length + 1}`,
      type: 'api',
      timeout: '30s',
      config: { endpoint: '', method: 'GET' },
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
    message.success('代码已复制');
  };

  const generatedCode = generatePythonCode(activityForm);

  const columns: ColumnsType<ActivityDTO> = [
    { title: '名称', dataIndex: 'name', key: 'name', width: 200, render: (name, r) => <a onClick={() => handleViewDetail(r)}><Text strong>{name}</Text></a> },
    { title: '函数名', dataIndex: 'fn', key: 'fn', width: 180, render: fn => <Tag color="cyan">{fn}</Tag> },
    { title: '处理器', key: 'handler', width: 100, render: (_, r) => <Tag color={HANDLER_CONFIG[r.handler]?.color}>{HANDLER_CONFIG[r.handler]?.label}</Tag> },
    { title: '超时', dataIndex: 'timeout', key: 'timeout', width: 80 },
    { title: '重试', key: 'retryPolicy', width: 80, render: (_, r) => r.retryPolicy ? <Tag color="orange">有</Tag> : <Tag>无</Tag> },
    { title: '状态', key: 'status', width: 80, render: (_, r) => <Tag color={r.isActive ? 'green' : 'default'}>{r.isActive ? '启用' : '禁用'}</Tag> },
    { title: t('common:actions'), key: 'actions', width: 120, render: (_, r) => (
      <Space size="small">
        <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(r)} />
        <Popconfirm title="确认删除" onConfirm={() => handleDelete(r.id)} okText="删除" okButtonProps={{ danger: true }}>
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
        <Col span={6}><Card><Statistic title="总数" value={stats.total} prefix={<ThunderboltOutlined />} /></Card></Col>
        <Col span={6}><Card><Statistic title="API" value={stats.api} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col span={6}><Card><Statistic title="脚本" value={stats.script} valueStyle={{ color: '#fa8c16' }} /></Card></Col>
        <Col span={6}><Card><Statistic title="已启用" value={stats.active} valueStyle={{ color: '#1890ff' }} /></Card></Col>
      </Row>

      <Card style={{ marginBottom: 16 }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Input placeholder="搜索..." prefix={<SearchOutlined />} value={searchText} onChange={e => setSearchText(e.target.value)} style={{ width: 200 }} allowClear />
          <Space>
            <Button icon={<PlusOutlined />} type="primary" onClick={handleCreate}>创建</Button>
            <Button icon={<ReloadOutlined />} onClick={() => activitiesQuery.refetch()} />
          </Space>
        </Space>
      </Card>

      <Card>
        <Table columns={columns} dataSource={filteredActivities} rowKey="id" loading={activitiesQuery.isLoading} pagination={{ showSizeChanger: true, showTotal: total => `共 ${total} 条` }} />
      </Card>

      {/* Edit Modal */}
      <Modal
        title={editingActivity ? '编辑 Activity' : '创建 Activity'}
        open={editModalVisible}
        onCancel={() => setEditModalVisible(false)}
        footer={null}
        width={900}
        destroyOnClose
      >
        <Form layout="vertical">
          {/* Basic Info */}
          <Card size="small" style={{ marginBottom: 16 }}>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label="名称" required>
                  <Input value={activityForm.name} onChange={e => updateActivityForm('name', e.target.value)} placeholder="天气查询" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="函数名" required>
                  <Input value={activityForm.fn} onChange={e => updateActivityForm('fn', e.target.value)} placeholder="weatherQuery" />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label="Task Queue">
                  <Input value={activityForm.taskQueue} onChange={e => updateActivityForm('taskQueue', e.target.value)} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="StartToClose 超时">
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

          {/* Timeout Settings */}
          <Card size="small" style={{ marginBottom: 16 }}>
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item label="心跳超时">
                  <Select value={activityForm.heartbeatTimeout} onChange={v => updateActivityForm('heartbeatTimeout', v)}>
                    <Option value="5s">5s</Option>
                    <Option value="10s">10s</Option>
                    <Option value="30s">30s</Option>
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
          </Card>

          {/* Retry Policy */}
          <Card size="small" style={{ marginBottom: 16 }}>
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

          {/* Steps */}
          <Card size="small" style={{ marginBottom: 16 }}>
            <Title level={5} style={{ marginBottom: 12 }}><OrderedListOutlined /> 步骤列表</Title>
            <Button type="dashed" icon={<PlusOutlined />} onClick={addStep} block style={{ marginBottom: 12 }}>
              添加步骤
            </Button>
            {activityForm.steps.length === 0 ? (
              <Text type="secondary">添加步骤来定义 Activity 的执行流程</Text>
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
                        <Input value={step.timeout} onChange={e => updateStep(step.id, 'timeout', e.target.value)} placeholder="超时" style={{ width: 70 }} />
                      </Space>
                    </Col>
                    <Col>
                      <Button type="text" danger icon={<DeleteOutlined />} onClick={() => removeStep(step.id)} />
                    </Col>
                  </Row>
                  {step.type === 'api' && (
                    <div style={{ marginTop: 8, padding: 8, background: '#f6ffed', borderRadius: 4 }}>
                      <Input value={step.config.endpoint || ''} onChange={e => updateStep(step.id, 'config', { ...step.config, endpoint: e.target.value })} placeholder="https://uapis.cn/api/v1/misc/weather?city=北京" prefix={<ApiOutlined />} />
                    </div>
                  )}
                  {step.type === 'script' && (
                    <div style={{ marginTop: 8, padding: 8, background: '#fff7e6', borderRadius: 4 }}>
                      <TextArea value={step.config.script || ''} onChange={e => updateStep(step.id, 'config', { ...step.config, script: e.target.value })} placeholder="// 代码..." rows={2} style={{ fontFamily: 'monospace' }} />
                    </div>
                  )}
                </Card>
              ))
            )}
          </Card>

          {/* Actions */}
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button icon={<PlayCircleOutlined />} onClick={handleValidate}>验证</Button>
            <Button icon={<ExperimentOutlined />} onClick={() => setSimulationModalVisible(true)}>模拟</Button>
            <Button onClick={() => setEditModalVisible(false)}>取消</Button>
            <Button type="primary" icon={<SaveOutlined />} loading={createMutation.isLoading || updateMutation.isLoading} onClick={handleSave}>保存</Button>
          </Space>
        </Form>
      </Modal>

      {/* Simulation Modal */}
      <Modal title="模拟测试" open={simulationModalVisible} onCancel={() => setSimulationModalVisible(false)} footer={null} width={500}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text>选择场景：</Text>
          <Space wrap>
            <Button icon={<CheckCircleOutlined />} onClick={() => handleSimulate('success')} type="primary">成功</Button>
            <Button icon={<WarningOutlined />} danger onClick={() => handleSimulate('failure')}>失败</Button>
            <Button icon={<ClockCircleOutlined />} onClick={() => handleSimulate('timeout')}>超时</Button>
            <Button icon={<HeartOutlined />} onClick={() => handleSimulate('heartbeat')}>心跳</Button>
          </Space>
          {simulationResult && (
            <Card size="small" style={{ marginTop: 16, background: '#f5f5f5' }}>
              <p><strong>类型：</strong>{simulationResult.type}</p>
              <p><strong>消息：</strong>{simulationResult.message}</p>
              {simulationResult.heartbeatEvents?.length > 0 && (
                <>
                  <p><strong>心跳事件：</strong></p>
                  <ul>{simulationResult.heartbeatEvents.map((e: any, i: number) => <li key={i}>{e.time} - {e.stage}</li>)}</ul>
                </>
              )}
            </Card>
          )}
        </Space>
      </Modal>

      {/* Detail Modal */}
      <Modal title="详情" open={detailModalVisible} onCancel={() => setDetailModalVisible(false)} footer={null} width={700}>
        {selectedActivity && (
          <Collapse defaultActiveKey={['basic', 'monitoring']}>
            <Panel header={<Text><ThunderboltOutlined /> 基本信息</Text>} key="basic">
              <Row gutter={16}>
                <Col span={12}><Text><strong>名称:</strong> {selectedActivity.name}</Text></Col>
                <Col span={12}><Text><strong>函数名:</strong> <Tag color="cyan">{selectedActivity.fn}</Tag></Text></Col>
                <Col span={12}><Text><strong>超时:</strong> {selectedActivity.timeout}</Text></Col>
              </Row>
            </Panel>
            <Panel header={<Text><LineChartOutlined /> 监控</Text>} key="monitoring">
              <Row gutter={16}>
                <Col span={8}><Card size="small"><Statistic title="平均耗时" value="1.2s" /></Card></Col>
                <Col span={8}><Card size="small"><Statistic title="失败率" value="0.5%" valueStyle={{ color: '#52c41a' }} /></Card></Col>
                <Col span={8}><Card size="small"><Statistic title="Backlog" value="12" /></Card></Col>
              </Row>
            </Panel>
          </Collapse>
        )}
      </Modal>

      {/* Validation Modal */}
      <Modal title="验证结果" open={validateModalVisible} onCancel={() => setValidateModalVisible(false)} footer={[<Button onClick={() => setValidateModalVisible(false)}>关闭</Button>]}>
        {validationResult ? (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Alert type={validationResult.isValid ? 'success' : 'error'} message={validationResult.isValid ? '验证通过' : '验证失败'} showIcon />
            <Text>评分: {validationResult.score}/100</Text>
            {validationResult.errors?.length > 0 && <Alert type="error" message="错误" description={<ul>{validationResult.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>} />}
          </Space>
        ) : <Alert type="info" message="点击验证按钮开始验证" />}
      </Modal>
    </div>
  );
};

export default ActivityPage;