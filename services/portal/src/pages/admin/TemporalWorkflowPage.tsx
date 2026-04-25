import React, { useEffect, useMemo, useReducer, useState } from 'react';
import {
  Table, Card, Button, Input, Space, Tag, Typography, Modal, message, Form, Select,
  Divider, Alert, Collapse, Badge, Popconfirm, Row, Col, Statistic, Timeline, Switch
} from 'antd';
import {
  SearchOutlined, PlusOutlined, EditOutlined, DeleteOutlined, PlayCircleOutlined,
  ReloadOutlined, CloudUploadOutlined, CodeOutlined, ApiOutlined, ThunderboltOutlined,
  RocketOutlined, CheckCircleOutlined, RobotOutlined, ExperimentOutlined
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  temporalWorkflowApi, TemporalWorkflowDTO, CreateTemporalWorkflowDTO,
  WorkflowDsl, ActivityDsl, TemporalValidationResult, DEFAULT_WORKFLOW_DSL, DEFAULT_ACTIVITY_DSL,
  WorkflowCodeResult, SandBoxValidationResult
} from '../../api/temporal-workflow';
import { activityApi, ActivityDTO } from '../../api/activity';
import { normalizeExecutionResult } from '../../api/execution-normalizer';
import type { ColumnsType } from 'antd/es/table';

const { Text } = Typography;
const { Option } = Select;
const { Panel } = Collapse;
const MAX_LOG_LINES = 1000;

interface SandboxState {
  visible: boolean;
  isStreaming: boolean;
  logs: string[];
  result: SandBoxValidationResult | null;
  inputParams: Record<string, string>; // 用户输入的参数值
}

type SandboxAction =
  | { type: 'START' }
  | { type: 'OPEN'; payload?: Record<string, string> }
  | { type: 'APPEND_LOG'; payload: string }
  | { type: 'SET_RESULT'; payload: SandBoxValidationResult }
  | { type: 'SET_INPUT_PARAMS'; payload: Record<string, string> }
  | { type: 'CLOSE' };

const initialSandboxState: SandboxState = {
  visible: false,
  isStreaming: false,
  logs: [],
  result: null,
  inputParams: {},
};

const sandboxReducer = (state: SandboxState, action: SandboxAction): SandboxState => {
  switch (action.type) {
    case 'START':
      return {
        visible: true,
        isStreaming: true,
        logs: [],
        result: null,
      };
    case 'OPEN':
      return {
        ...state,
        visible: true,
        inputParams: action.payload || {},
      };
    case 'APPEND_LOG':
      return {
        ...state,
        logs: [...state.logs.slice(-(MAX_LOG_LINES - 1)), action.payload],
      };
    case 'SET_RESULT':
      return {
        ...state,
        isStreaming: false,
        result: action.payload,
      };
    case 'SET_INPUT_PARAMS':
      return {
        ...state,
        inputParams: action.payload,
      };
    case 'CLOSE':
      return {
        ...initialSandboxState,
      };
    default:
      return state;
  }
};

const TemporalWorkflowPage: React.FC = () => {
  const { t } = useTranslation(['common', 'admin']);
  const queryClient = useQueryClient();
  const [form] = Form.useForm();

  const [searchText, setSearchText] = useState('');
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [validateModalVisible, setValidateModalVisible] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<TemporalWorkflowDTO | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<TemporalWorkflowDTO | null>(null);
  const [validationResult, setValidationResult] = useState<TemporalValidationResult | null>(null);
  const [workflowDsl, setWorkflowDsl] = useState<WorkflowDsl>(DEFAULT_WORKFLOW_DSL);
  const [activityDsl, setActivityDsl] = useState<ActivityDsl>(DEFAULT_ACTIVITY_DSL);
  const [selectActivityModalVisible, setSelectActivityModalVisible] = useState(false);
  const [selectingStepIndex, setSelectingStepIndex] = useState<number | null>(null);
  const [selectedStepIndexForConfig, setSelectedStepIndexForConfig] = useState<number | null>(null);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [codeModalVisible, setCodeModalVisible] = useState(false);
  const [sandboxState, dispatchSandbox] = useReducer(sandboxReducer, initialSandboxState);
  const [sandboxInputParams, setSandboxInputParams] = useState<Record<string, string>>({}); // 沙箱验证时的输入参数

  // 当沙箱弹窗打开时，同步输入参数到本地状态
  useEffect(() => {
    if (sandboxState.visible && Object.keys(sandboxState.inputParams).length > 0) {
      setSandboxInputParams({ ...sandboxState.inputParams });
    }
  }, [sandboxState.visible]);

  // 从Activity的config中提取inputParams (存储在config.steps[].inputParams中)
  const getActivityInputParams = (activity: ActivityDTO): Record<string, string> => {
    try {
      const config = activity.config as Record<string, any>;
      if (config?.steps && Array.isArray(config.steps) && config.steps.length > 0) {
        const firstStep = config.steps[0];
        if (firstStep?.inputParams && typeof firstStep.inputParams === 'object') {
          return firstStep.inputParams as Record<string, string>;
        }
      }
    } catch (e) {
      // ignore
    }
    return {};
  };

  // 当选择步骤时，自动从Activity加载输入参数（如果步骤还没有参数）
  useEffect(() => {
    if (selectedStepIndexForConfig !== null && workflowDsl.steps[selectedStepIndexForConfig]) {
      const step = workflowDsl.steps[selectedStepIndexForConfig];
      if (step.activityName && (!step.input || Object.keys(step.input).filter(k => k !== 'timeout').length === 0)) {
        const activity = activitiesQuery.data?.find(a => a.name === step.activityName);
        const inputParams = getActivityInputParams(activity);
        if (Object.keys(inputParams).length > 0) {
          handleUpdateStep(selectedStepIndexForConfig, 'input', {
            ...inputParams,
            timeout: step.input?.timeout || '60s',
          });
        }
      }
    }
  }, [selectedStepIndexForConfig]);

  const workflowsQuery = useQuery(['temporal-workflows'], () => temporalWorkflowApi.list());
  const activitiesQuery = useQuery('activities', () => activityApi.list());
  const filteredWorkflows = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    if (!keyword) return workflowsQuery.data || [];

    return (workflowsQuery.data || []).filter((workflow) => {
      const name = workflow.name?.toLowerCase() || '';
      const description = workflow.description?.toLowerCase() || '';
      const taskQueue = workflow.taskQueue?.toLowerCase() || '';
      return (
        name.includes(keyword) ||
        description.includes(keyword) ||
        taskQueue.includes(keyword)
      );
    });
  }, [searchText, workflowsQuery.data]);

  const appendSandboxLog = (content: string) => dispatchSandbox({ type: 'APPEND_LOG', payload: content });

  const createMutation = useMutation(temporalWorkflowApi.create, {
    onSuccess: () => { message.success(t('common:success')); queryClient.invalidateQueries(['temporal-workflows']); setEditModalVisible(false); form.resetFields(); },
    onError: () => { message.error(t('common:error')); },
  });

  const updateMutation = useMutation(
    ({ id, data }: { id: string; data: Partial<CreateTemporalWorkflowDTO> }) => temporalWorkflowApi.update(id, data),
    { onSuccess: () => { message.success(t('common:success')); queryClient.invalidateQueries(['temporal-workflows']); setEditModalVisible(false); }, onError: () => { message.error(t('common:error')); } }
  );

  const deleteMutation = useMutation(temporalWorkflowApi.delete, {
    onSuccess: () => { message.success(t('common:success')); queryClient.invalidateQueries(['temporal-workflows']); },
    onError: () => { message.error(t('common:error')); },
  });

  const deployMutation = useMutation(temporalWorkflowApi.deploy, {
    onSuccess: () => { message.success('部署成功'); queryClient.invalidateQueries(['temporal-workflows']); },
    onError: () => { message.error('部署失败'); },
  });

  const validateMutation = useMutation(
    ({ workflowDsl: wfd, activityDsl: ad }: { workflowDsl: WorkflowDsl; activityDsl: ActivityDsl }) =>
      temporalWorkflowApi.validate(wfd, ad),
    { onSuccess: (result) => { setValidationResult(result); message.success('验证完成'); }, onError: () => { message.error('验证失败'); } }
  );

  const generateCodeMutation = useMutation(
    ({ workflowDsl: wfd, activityDsl: ad, errorContext }: { workflowDsl: WorkflowDsl; activityDsl: ActivityDsl; errorContext?: string }) =>
      temporalWorkflowApi.generateWorkflowCode(wfd, ad, errorContext),
    { onSuccess: (result: WorkflowCodeResult) => {
      if (result.success && result.code) {
        setGeneratedCode(result.code);
        setCodeModalVisible(true);
        message.success('代码生成成功');
      } else {
        message.error(result.error || '代码生成失败');
      }
    }, onError: (error: any) => { message.error('代码生成失败: ' + (error.message || 'Unknown error')); } }
  );

  const handleCreate = () => {
    setEditingWorkflow(null);
    form.resetFields();
    setWorkflowDsl(DEFAULT_WORKFLOW_DSL);
    setActivityDsl(DEFAULT_ACTIVITY_DSL);
    setGeneratedCode(null);
    setEditModalVisible(true);
  };

  const handleEdit = (workflow: TemporalWorkflowDTO) => {
    setEditingWorkflow(workflow);
    form.setFieldsValue({ name: workflow.name, description: workflow.description, taskQueue: workflow.taskQueue });
    setWorkflowDsl(workflow.workflowDsl || DEFAULT_WORKFLOW_DSL);
    setActivityDsl(workflow.activityDsl || DEFAULT_ACTIVITY_DSL);
    setGeneratedCode(workflow.generatedCode || null);
    setEditModalVisible(true);
  };

  const handleViewDetail = (workflow: TemporalWorkflowDTO) => { setSelectedWorkflow(workflow); setDetailModalVisible(true); };

  const handleValidate = () => {
    const formValues = form.getFieldsValue();
    const workflowName = formValues.name || workflowDsl.name;
    setValidationResult(null);
    setValidateModalVisible(true);
    validateMutation.mutate({ workflowDsl: { ...workflowDsl, name: workflowName }, activityDsl });
  };

  const handleGenerateCode = (errorContext?: string) => {
    const formValues = form.getFieldsValue();
    const workflowName = formValues.name || workflowDsl.name;
    if (!workflowName) { message.warning('请先填写工作流名称'); return; }
    if (workflowDsl.steps.length === 0) { message.warning('请先添加至少一个步骤'); return; }
    generateCodeMutation.mutate({ workflowDsl: { ...workflowDsl, name: workflowName }, activityDsl, errorContext });
  };

  // 收集工作流步骤的输入参数
  const collectWorkflowInputParams = (): Record<string, string> => {
    const params: Record<string, string> = {};
    workflowDsl.steps.forEach((step, idx) => {
      if (step.input) {
        Object.entries(step.input).forEach(([key, value]) => {
          if (!params[key]) {
            params[key] = typeof value === 'string' ? value : JSON.stringify(value);
          }
        });
      }
    });
    return params;
  };

  const handleOpenSandbox = () => {
    if (!generatedCode) { message.warning('请先生成代码'); return; }
    const inputParams = collectWorkflowInputParams();
    dispatchSandbox({ type: 'OPEN', payload: inputParams });
  };

  const handleSandboxValidate = async () => {
    if (!generatedCode) { message.warning('请先生成代码'); return; }
    const fn = workflowDsl.name.replace(/\s+/g, '') + 'Workflow';
    dispatchSandbox({ type: 'START' });

    // 构建输入参数
    const inputParams: Record<string, string> = {};
    Object.entries(sandboxInputParams).forEach(([key, value]) => {
      if (value && value.trim()) {
        inputParams[key] = value;
      }
    });

    try {
      await temporalWorkflowApi.validateInSandboxStream(
        generatedCode,
        fn,
        inputParams,
        (event) => {
          if (event.type === 'log' && event.content) {
            appendSandboxLog(event.content);
          } else if (event.type === 'done') {
            const normalized = normalizeExecutionResult(event, {
              defaultSuccessScore: 100,
              defaultFailureScore: 0,
            });
            dispatchSandbox({
              type: 'SET_RESULT',
              payload: {
              success: normalized.success,
              logs: [],
              result: event.result,
              error: normalized.error,
              score: normalized.score,
              },
            });
          } else if (event.type === 'error') {
            dispatchSandbox({
              type: 'SET_RESULT',
              payload: {
                success: false,
                logs: [],
                error: event.content || 'Unknown error',
                score: 0,
              },
            });
          }
        }
      );
    } catch (error: any) {
      appendSandboxLog(`错误: ${error.message}`);
      dispatchSandbox({
        type: 'SET_RESULT',
        payload: {
          success: false,
          logs: [],
          error: error.message,
          score: 0,
        },
      });
    }
  };

  const handleDeploy = (id: string) => Modal.confirm({ title: '确认部署', content: '确定要部署此工作流到 Temporal Worker 吗？', onOk: () => deployMutation.mutate(id) });

  const handleSave = () => {
    form.validateFields().then((values) => {
      const workflowName = values.name || workflowDsl.name;
      const data: CreateTemporalWorkflowDTO = {
        name: workflowName,
        description: values.description,
        taskQueue: values.taskQueue,
        workflowDsl: { ...workflowDsl, name: workflowName },
        activityDsl,
        generatedCode: generatedCode || undefined,
      };
      if (editingWorkflow) updateMutation.mutate({ id: editingWorkflow.id, data });
      else createMutation.mutate(data);
    });
  };

  const handleDelete = (id: string) => Modal.confirm({ title: t('common:confirmDelete'), content: '删除后无法恢复，是否继续？', onOk: () => deleteMutation.mutate(id) });

  const handleAddStep = () => setWorkflowDsl({ ...workflowDsl, steps: [...workflowDsl.steps, { id: `step_${Date.now()}`, name: `步骤 ${workflowDsl.steps.length + 1}`, type: 'activity' }] });
  const handleRemoveStep = (index: number) => setWorkflowDsl({ ...workflowDsl, steps: workflowDsl.steps.filter((_, i) => i !== index) });
  const handleUpdateStep = (index: number, field: string, value: any) => { const updated = [...workflowDsl.steps]; updated[index] = { ...updated[index], [field]: value }; setWorkflowDsl({ ...workflowDsl, steps: updated }); };

  const handleOpenActivitySelector = (stepIndex: number) => { setSelectingStepIndex(stepIndex); setSelectActivityModalVisible(true); };

  // Add activity from pool to workflow steps and activityDsl
  const handleAddActivityFromPool = (activity: ActivityDTO) => {
    const stepId = `step_${Date.now()}`;
    const newStep = { id: stepId, name: activity.name, type: 'activity' as const, activityName: activity.name };
    // Add step to workflowDsl
    setWorkflowDsl({ ...workflowDsl, steps: [...workflowDsl.steps, newStep] });
    // Add activity to activityDsl if not exists
    const exists = activityDsl.activities.some(a => a.name === activity.name);
    if (!exists) {
      setActivityDsl({
        ...activityDsl,
        activities: [...activityDsl.activities, {
          name: activity.name,
          fn: activity.fn,
          timeout: activity.timeout,
          handler: activity.handler,
          config: activity.config || {},
        }],
      });
    }
    // Select the newly added step for config
    setSelectedStepIndexForConfig(workflowDsl.steps.length);
  };

  const handleSelectActivity = (activity: ActivityDTO) => {
    if (selectingStepIndex !== null) {
      handleUpdateStep(selectingStepIndex, 'activityName', activity.name);
      const exists = activityDsl.activities.some(a => a.name === activity.name);
      if (!exists) {
        setActivityDsl({ ...activityDsl, activities: [...activityDsl.activities, { name: activity.name, fn: activity.fn, timeout: activity.timeout, handler: activity.handler, config: activity.config }] });
      }
    }
    setSelectActivityModalVisible(false);
    setSelectingStepIndex(null);
  };

  const handleRegenerateCode = () => {
    dispatchSandbox({ type: 'CLOSE' });
    setGeneratedCode(null);
    // Build error context from sandbox result
    let errorContext: string | undefined;
    if (sandboxState.result) {
      const errors: string[] = [];
      if (sandboxState.result.error) errors.push(`验证错误: ${sandboxState.result.error}`);
      if (sandboxState.result.result?.error) errors.push(`执行错误: ${sandboxState.result.result.error}`);
      if (sandboxState.result.result?.traceback) errors.push(`堆栈: ${sandboxState.result.result.traceback}`);
      if (sandboxState.logs.length > 0) errors.push(`日志:\n${sandboxState.logs.join('\n')}`);
      if (errors.length > 0) {
        errorContext = `上次代码验证失败，请修复以下问题:\n\n${errors.join('\n\n')}`;
      }
    }
    handleGenerateCode(errorContext);
  };

  const sandboxModalFooter = sandboxState.result && !sandboxState.result.success ? [
    <Button key="close" onClick={() => dispatchSandbox({ type: 'CLOSE' })}>关闭</Button>,
    <Button key="regenerate" type="primary" onClick={handleRegenerateCode}>重新生成代码</Button>,
  ] : [<Button key="close" onClick={() => dispatchSandbox({ type: 'CLOSE' })}>关闭</Button>];

  const columns: ColumnsType<TemporalWorkflowDTO> = [
    { title: '工作流名称', dataIndex: 'name', key: 'name', width: 200, render: (name, r) => <a onClick={() => handleViewDetail(r)}><Text strong>{name}</Text></a> },
    { title: 'Task Queue', dataIndex: 'taskQueue', key: 'taskQueue', width: 150, render: q => <Tag color="blue">{q}</Tag> },
    { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true },
    { title: '步骤数', key: 'stepCount', width: 80, render: (_, r) => <Badge count={r.workflowDsl?.steps?.length || 0} showZero color="blue" /> },
    { title: 'Activity数', key: 'activityCount', width: 100, render: (_, r) => <Badge count={r.activityDsl?.activities?.length || 0} showZero color="green" /> },
    { title: '状态', key: 'status', width: 120, render: (_, r) => (<Space direction="vertical" size={0}><Tag color={r.isActive ? 'green' : 'default'}>{r.isActive ? '已启用' : '已禁用'}</Tag>{r.deployedAt && <Tag color="cyan" style={{ fontSize: 10 }}>已部署</Tag>}</Space>) },
    { title: t('common:actions'), key: 'actions', width: 220, render: (_, r) => (<Space size="small"><Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(r)}>编辑</Button><Button type="link" size="small" icon={<CloudUploadOutlined />} onClick={() => handleDeploy(r.id)}>部署</Button><Popconfirm title="确认删除" onConfirm={() => handleDelete(r.id)} okText="删除" cancelText="取消" okButtonProps={{ danger: true }}><Button type="link" size="small" icon={<DeleteOutlined />} danger /></Popconfirm></Space>) },
  ];

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}><Card><Statistic title="工作流总数" value={workflowsQuery.data?.length || 0} prefix={<ThunderboltOutlined />} /></Card></Col>
        <Col span={6}><Card><Statistic title="已部署" value={workflowsQuery.data?.filter(w => w.deployedAt).length || 0} prefix={<RocketOutlined />} valueStyle={{ color: '#1890ff' }} /></Card></Col>
        <Col span={6}><Card><Statistic title="步骤总数" value={workflowsQuery.data?.reduce((sum, w) => sum + (w.workflowDsl?.steps?.length || 0), 0) || 0} prefix={<ApiOutlined />} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col span={6}><Card><Statistic title="已启用" value={workflowsQuery.data?.filter(w => w.isActive).length || 0} prefix={<CheckCircleOutlined />} valueStyle={{ color: '#fa8c16' }} /></Card></Col>
      </Row>

      <Card style={{ marginBottom: 16 }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Input placeholder="搜索工作流..." prefix={<SearchOutlined />} value={searchText} onChange={e => setSearchText(e.target.value)} style={{ width: 200 }} allowClear />
          <Space><Button icon={<PlusOutlined />} type="primary" onClick={handleCreate}>创建工作流</Button><Button icon={<ReloadOutlined />} onClick={() => workflowsQuery.refetch()}>{t('common:refresh')}</Button></Space>
        </Space>
      </Card>

      <Card>
        <Alert message="Temporal 工作流说明" description={<Space direction="vertical" size="small"><Text><strong>Workflow DSL</strong>：定义确定性编排逻辑。Temporal 会 replay 这个逻辑来恢复状态。</Text><Text><strong>Activity DSL</strong>：定义非确定性副作用操作（API调用、文档渲染、浏览器操作、脚本执行）。</Text></Space>} type="info" showIcon style={{ marginBottom: 16 }} />
        <Table columns={columns} dataSource={filteredWorkflows} rowKey="id" loading={workflowsQuery.isLoading} pagination={{ showSizeChanger: true, showTotal: total => `共 ${total} 条` }} />
      </Card>

      <Modal title="选择 Activity" open={selectActivityModalVisible} onCancel={() => { setSelectActivityModalVisible(false); setSelectingStepIndex(null); }} footer={null} width={600}>
        <Alert message="选择一个 Activity 关联到工作流步骤" type="info" showIcon style={{ marginBottom: 16 }} />
        <div style={{ maxHeight: 400, overflow: 'auto' }}>
          {(activitiesQuery.data || []).map(activity => (
            <Card key={activity.id} size="small" style={{ marginBottom: 8, cursor: 'pointer' }} onClick={() => handleSelectActivity(activity)}>
              <Space><Tag color={activity.handler === 'api' ? 'green' : activity.handler === 'script' ? 'orange' : 'blue'}>{activity.handler.toUpperCase()}</Tag><Text strong>{activity.name}</Text><Text type="secondary">({activity.fn})</Text></Space>
            </Card>
          ))}
          {(!activitiesQuery.data || activitiesQuery.data.length === 0) && <Alert message="暂无 Activity，请先创建" type="warning" showIcon />}
        </div>
      </Modal>

      <Modal title="工作流详情" open={detailModalVisible} onCancel={() => setDetailModalVisible(false)} footer={null} width={900}>
        {selectedWorkflow && (
          <Collapse defaultActiveKey={['basic', 'workflow', 'activities']}>
            <Panel header={<Text><ThunderboltOutlined /> 基本信息</Text>} key="basic">
              <Row gutter={16}><Col span={12}><Text><strong>名称:</strong> {selectedWorkflow.name}</Text></Col><Col span={12}><Text><strong>Task Queue:</strong> <Tag color="blue">{selectedWorkflow.taskQueue}</Tag></Text></Col><Col span={12}><Text><strong>描述:</strong> {selectedWorkflow.description || '无'}</Text></Col><Col span={12}><Text><strong>状态:</strong> <Tag color={selectedWorkflow.isActive ? 'green' : 'default'}>{selectedWorkflow.isActive ? '已启用' : '已禁用'}</Tag></Text></Col></Row>
            </Panel>
            <Panel header={<Text><CodeOutlined /> Workflow DSL</Text>} key="workflow"><pre style={{ background: '#f6ffed', padding: 16, borderRadius: 8, maxHeight: 350, overflow: 'auto', fontSize: 12 }}>{JSON.stringify(selectedWorkflow.workflowDsl, null, 2)}</pre></Panel>
            <Panel header={<Text><ApiOutlined /> Activity DSL</Text>} key="activities"><pre style={{ background: '#e6f7ff', padding: 16, borderRadius: 8, maxHeight: 350, overflow: 'auto', fontSize: 12 }}>{JSON.stringify(selectedWorkflow.activityDsl, null, 2)}</pre></Panel>
          </Collapse>
        )}
      </Modal>

      <Modal title={editingWorkflow ? '编辑工作流' : '创建工作流'} open={editModalVisible} onOk={handleSave} onCancel={() => setEditModalVisible(false)}
        footer={[
          <Button key="validate" icon={<PlayCircleOutlined />} onClick={handleValidate}>验证DSL</Button>,
          <Button key="generate" icon={<RobotOutlined />} onClick={() => handleGenerateCode()} loading={generateCodeMutation.isLoading}>AI生成代码</Button>,
          <Button key="sandbox" icon={<ExperimentOutlined />} onClick={handleOpenSandbox} loading={sandboxState.isStreaming} disabled={!generatedCode}>沙箱验证</Button>,
          <Button key="viewCode" icon={<CodeOutlined />} onClick={() => setCodeModalVisible(true)} disabled={!generatedCode}>查看代码</Button>,
          <Button key="cancel" onClick={() => setEditModalVisible(false)}>取消</Button>,
          <Button key="save" type="primary" loading={createMutation.isLoading || updateMutation.isLoading} onClick={handleSave}>保存</Button>
        ]}
        width={1200} style={{ top: 20 }}>
        <Form form={form} layout="vertical">
          <Row gutter={16}><Col span={12}><Form.Item name="name" label="工作流名称" rules={[{ required: true, message: '请输入工作流名称' }]}><Input placeholder="例如：合同生成流程" /></Form.Item></Col><Col span={12}><Form.Item name="taskQueue" label="Task Queue" rules={[{ required: true, message: '请输入Task Queue' }]} extra="Temporal Worker 监听的队列名称"><Input placeholder="例如：SKILL_TASK_QUEUE" /></Form.Item></Col></Row>
          <Form.Item name="description" label="描述"><Input.TextArea rows={2} placeholder="工作流描述" /></Form.Item>
          {/* 输入参数区域 - 第一个步骤的参数是整个workflow的入口参数 */}
          <Divider plain><Text type="secondary">输入参数（Workflow 入口参数）</Text></Divider>
          <Alert message="第一个步骤的参数自动成为整个工作流的入口参数，可设置默认值和描述" type="info" showIcon style={{ marginBottom: 12 }} />
          <div style={{ border: '1px solid #d9d9d9', padding: 12, borderRadius: 8, marginBottom: 12 }}>
            {Object.entries(workflowDsl.inputParams || {}).map(([key, param]) => (
              <Row key={key} gutter={8} style={{ marginBottom: 8, alignItems: 'center' }}>
                <Col span={4}>
                  <Input
                    value={key}
                    disabled
                    size="small"
                    suffix={<Button size="small" danger type="text" onClick={() => {
                      const newParams = { ...workflowDsl.inputParams };
                      delete newParams[key];
                      setWorkflowDsl({ ...workflowDsl, inputParams: newParams });
                    }}>×</Button>}
                  />
                </Col>
                <Col span={4}>
                  <Select
                    value={param.required ? 'required' : 'optional'}
                    onChange={v => setWorkflowDsl({ ...workflowDsl, inputParams: { ...workflowDsl.inputParams, [key]: { ...param, required: v === 'required' } } })}
                    size="small"
                    style={{ width: '100%' }}
                  >
                    <Option value="required">必填</Option>
                    <Option value="optional">可选</Option>
                  </Select>
                </Col>
                <Col span={4}>
                  <Input
                    value={param.defaultValue || ''}
                    onChange={e => setWorkflowDsl({ ...workflowDsl, inputParams: { ...workflowDsl.inputParams, [key]: { ...param, defaultValue: e.target.value } } })}
                    placeholder="默认值"
                    size="small"
                  />
                </Col>
                <Col span={8}>
                  <Input
                    value={param.description || ''}
                    onChange={e => setWorkflowDsl({ ...workflowDsl, inputParams: { ...workflowDsl.inputParams, [key]: { ...param, description: e.target.value } } })}
                    placeholder="参数描述"
                    size="small"
                  />
                </Col>
              </Row>
            ))}
            <Button
              size="small"
              type="dashed"
              onClick={() => {
                const key = prompt('请输入参数名:');
                if (key && key.trim()) {
                  setWorkflowDsl({
                    ...workflowDsl,
                    inputParams: { ...workflowDsl.inputParams, [key.trim()]: { description: '', required: false, defaultValue: '' } }
                  });
                }
              }}
              style={{ width: '100%' }}
            >
              + 添加输入参数
            </Button>
          </div>
        </Form>

        <Divider><Text strong>工作流配置</Text></Divider>

        <Row gutter={16}>
          {/* Left Column - Activity Pool */}
          <Col span={6} style={{ borderRight: '1px solid #f0f0f0', paddingRight: 16 }}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>Activity 资源池</Text>
            <Input placeholder="搜索 Activity..." prefix={<SearchOutlined />} style={{ marginBottom: 8 }} allowClear />
            <div style={{ maxHeight: 400, overflow: 'auto' }}>
              {(activitiesQuery.data || []).filter(a => a.isActive).map(activity => {
                const isAdded = workflowDsl.steps.some(s => s.activityName === activity.name);
                return (
                  <Card
                    key={activity.id}
                    size="small"
                    style={{
                      marginBottom: 8,
                      cursor: 'pointer',
                      background: isAdded ? '#f6ffed' : '#fff',
                      border: isAdded ? '1px solid #b7eb8f' : '1px solid #d9d9d9',
                    }}
                    onClick={() => !isAdded && handleAddActivityFromPool(activity)}
                  >
                    <Space>
                      <Tag color={activity.handler === 'api' ? 'green' : activity.handler === 'script' ? 'orange' : 'blue'}>{activity.handler.toUpperCase()}</Tag>
                      <Text strong={!isAdded} type={isAdded ? 'secondary' : undefined}>{activity.name}</Text>
                      {isAdded && <Tag color="green">已添加</Tag>}
                    </Space>
                    <br />
                    <Text type="secondary" style={{ fontSize: 11 }}>{activity.fn}</Text>
                  </Card>
                );
              })}
              {(!activitiesQuery.data || activitiesQuery.data.filter(a => a.isActive).length === 0) && (
                <Alert message="暂无已验证的 Activity" type="warning" showIcon />
              )}
            </div>
          </Col>

          {/* Middle Column - Step Canvas */}
          <Col span={10} style={{ borderRight: '1px solid #f0f0f0', paddingRight: 16 }}>
            <Space style={{ marginBottom: 8, width: '100%', justifyContent: 'space-between' }}>
              <Text strong>流程步骤</Text>
              <Button icon={<PlusOutlined />} size="small" onClick={handleAddStep}>添加步骤</Button>
            </Space>
            {workflowDsl.steps.length === 0 ? (
              <Alert message="从左侧勾选 Activity 或点击添加步骤" type="info" showIcon />
            ) : (
              <Timeline>{workflowDsl.steps.map((step, index) => (
                <Timeline.Item
                  key={step.id}
                  color={selectedStepIndexForConfig === index ? 'green' : 'blue'}
                  dot={selectedStepIndexForConfig === index ? <CheckCircleOutlined /> : undefined}
                >
                  <Card
                    size="small"
                    style={{
                      marginBottom: 8,
                      cursor: 'pointer',
                      background: selectedStepIndexForConfig === index ? '#f6ffed' : '#fff',
                      border: selectedStepIndexForConfig === index ? '2px solid #52c41a' : '1px solid #d9d9d9',
                    }}
                    onClick={() => setSelectedStepIndexForConfig(index)}
                  >
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                        <Input
                          value={step.name}
                          onChange={e => handleUpdateStep(index, 'name', e.target.value)}
                          placeholder="步骤名称"
                          style={{ width: 120 }}
                          size="small"
                          onClick={e => e.stopPropagation()}
                        />
                        <Space size="small">
                          <Button
                            icon={<DeleteOutlined />}
                            danger
                            size="small"
                            onClick={(e) => { e.stopPropagation(); handleRemoveStep(index); }}
                          />
                          {index > 0 && (
                            <Button icon={<SearchOutlined />} size="small" onClick={(e) => { e.stopPropagation(); const newSteps = [...workflowDsl.steps]; [newSteps[index - 1], newSteps[index]] = [newSteps[index], newSteps[index - 1]]; setWorkflowDsl({ ...workflowDsl, steps: newSteps }); if (selectedStepIndexForConfig === index) setSelectedStepIndexForConfig(index - 1); else if (selectedStepIndexForConfig === index - 1) setSelectedStepIndexForConfig(index); }} />
                          )}
                          {index < workflowDsl.steps.length - 1 && (
                            <Button icon={<SearchOutlined />} size="small" onClick={(e) => { e.stopPropagation(); const newSteps = [...workflowDsl.steps]; [newSteps[index], newSteps[index + 1]] = [newSteps[index + 1], newSteps[index]]; setWorkflowDsl({ ...workflowDsl, steps: newSteps }); if (selectedStepIndexForConfig === index) setSelectedStepIndexForConfig(index + 1); else if (selectedStepIndexForConfig === index + 1) setSelectedStepIndexForConfig(index); }} />
                          )}
                        </Space>
                      </Space>
                      {step.type === 'activity' && (
                        <Space>
                          <Tag color="green">{step.activityName || '未选择'}</Tag>
                          <Button size="small" onClick={(e) => { e.stopPropagation(); handleOpenActivitySelector(index); }}>更换</Button>
                        </Space>
                      )}
                    </Space>
                  </Card>
                </Timeline.Item>
              ))}</Timeline>
            )}
          </Col>

          {/* Right Column - Step Config Panel */}
          <Col span={8}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>步骤配置</Text>
            {selectedStepIndexForConfig !== null && workflowDsl.steps[selectedStepIndexForConfig] ? (
              <Card size="small" style={{ background: '#fafafa' }}>
                <Form layout="vertical" size="small">
                  <Form.Item label="步骤类型">
                    <Select
                      value={workflowDsl.steps[selectedStepIndexForConfig].type}
                      onChange={v => handleUpdateStep(selectedStepIndexForConfig, 'type', v)}
                      style={{ width: '100%' }}
                    >
                      <Option value="activity">Activity</Option>
                      <Option value="signal">Signal</Option>
                      <Option value="query">Query</Option>
                    </Select>
                  </Form.Item>

                  {workflowDsl.steps[selectedStepIndexForConfig].type === 'activity' && (
                    <>
                      <Form.Item label="Activity 名称">
                        <Select
                          value={workflowDsl.steps[selectedStepIndexForConfig].activityName}
                          onChange={v => {
                            handleUpdateStep(selectedStepIndexForConfig, 'activityName', v);
                            // Auto-add to activityDsl if not exists
                            const activity = activitiesQuery.data?.find(a => a.name === v);
                            if (activity) {
                              const exists = activityDsl.activities.some(a => a.name === v);
                              if (!exists) {
                                setActivityDsl({
                                  ...activityDsl,
                                  activities: [...activityDsl.activities, {
                                    name: activity.name,
                                    fn: activity.fn,
                                    timeout: activity.timeout,
                                    handler: activity.handler,
                                    config: activity.config || {},
                                  }],
                                });
                              }
                              // Auto-populate step input params from Activity's config.steps[].inputParams
                              const inputParams = getActivityInputParams(activity);
                              if (Object.keys(inputParams).length > 0) {
                                handleUpdateStep(selectedStepIndexForConfig, 'input', {
                                  ...inputParams,
                                  timeout: workflowDsl.steps[selectedStepIndexForConfig].input?.timeout || '60s',
                                });
                              }
                            }
                          }}
                          style={{ width: '100%' }}
                          placeholder="选择 Activity"
                        >
                          {(activitiesQuery.data || []).filter(a => a.isActive).map(a => (
                            <Option key={a.id} value={a.name}>{a.name}</Option>
                          ))}
                        </Select>
                      </Form.Item>

                      <Form.Item label="执行超时">
                        <Input
                          value={workflowDsl.steps[selectedStepIndexForConfig].startToCloseTimeout || '60s'}
                          onChange={e => handleUpdateStep(selectedStepIndexForConfig, 'startToCloseTimeout', e.target.value || '60s')}
                          placeholder="例如: 30s, 1m"
                        />
                      </Form.Item>

                      <Form.Item label="重试次数">
                        <Input
                          type="number"
                          value={workflowDsl.steps[selectedStepIndexForConfig].retryPolicy?.maxRetries || 3}
                          onChange={e => handleUpdateStep(selectedStepIndexForConfig, 'retryPolicy', {
                            ...workflowDsl.steps[selectedStepIndexForConfig].retryPolicy,
                            maxRetries: parseInt(e.target.value) || 3
                          })}
                          placeholder="最大重试次数"
                        />
                      </Form.Item>

                      <Form.Item label="重试间隔 (ms)" extra="首次重试等待时间">
                        <Input
                          type="number"
                          value={workflowDsl.steps[selectedStepIndexForConfig].retryPolicy?.initialIntervalMs || 1000}
                          onChange={e => handleUpdateStep(selectedStepIndexForConfig, 'retryPolicy', {
                            ...workflowDsl.steps[selectedStepIndexForConfig].retryPolicy,
                            initialIntervalMs: parseInt(e.target.value) || 1000
                          })}
                          placeholder="首次重试间隔 (ms)"
                        />
                      </Form.Item>

                      <Form.Item label="输入参数">
                        <div style={{ border: '1px dashed #d9d9d9', padding: 8, borderRadius: 4 }}>
                          {Object.entries(workflowDsl.steps[selectedStepIndexForConfig].input || {}).filter(([k]) => k !== 'timeout').map(([key, value]) => (
                            <div key={key} style={{ display: 'flex', gap: 4, marginBottom: 4, alignItems: 'center' }}>
                              <Tag color="blue">{key}</Tag>
                              <Input
                                size="small"
                                value={typeof value === 'string' ? value : JSON.stringify(value)}
                                onChange={e => handleUpdateStep(selectedStepIndexForConfig, 'input', { ...workflowDsl.steps[selectedStepIndexForConfig].input, [key]: e.target.value })}
                                style={{ flex: 1 }}
                              />
                              <Button size="small" danger onClick={() => {
                                const newInput = { ...workflowDsl.steps[selectedStepIndexForConfig].input };
                                delete newInput[key];
                                handleUpdateStep(selectedStepIndexForConfig, 'input', newInput);
                              }}>×</Button>
                            </div>
                          ))}
                          <Button
                            size="small"
                            type="dashed"
                            onClick={() => {
                              const key = prompt('请输入参数名:');
                              if (key && key.trim()) {
                                handleUpdateStep(selectedStepIndexForConfig, 'input', { ...workflowDsl.steps[selectedStepIndexForConfig].input, [key.trim()]: '' });
                              }
                            }}
                            style={{ width: '100%' }}
                          >
                            + 添加参数
                          </Button>
                        </div>
                      </Form.Item>
                    </>
                  )}
                </Form>
              </Card>
            ) : (
              <Alert message="点击中间步骤选择配置" type="info" showIcon />
            )}

            {/* Activity DSL Summary */}
            <Divider style={{ margin: '16px 0' }}><Text type="secondary" style={{ fontSize: 12 }}>Activity DSL 摘要</Text></Divider>
            {activityDsl.activities.length === 0 ? (
              <Alert message="从左侧添加 Activity" type="info" showIcon />
            ) : (
              <div style={{ maxHeight: 200, overflow: 'auto' }}>
                {activityDsl.activities.map((activity, index) => (
                  <Tag key={index} color="blue" style={{ margin: 2 }}>{activity.name}</Tag>
                ))}
              </div>
            )}
          </Col>
        </Row>

        {/* 输出参数区域 - 默认是最后一个步骤的输出 */}
        <Divider plain><Text type="secondary">输出参数（Workflow 返回值）</Text></Divider>
        <Alert message="默认使用最后一个步骤的输出，可自定义来源步骤" type="info" showIcon style={{ marginBottom: 12 }} />
        <div style={{ border: '1px solid #d9d9d9', padding: 12, borderRadius: 8, marginBottom: 12 }}>
          {Object.entries(workflowDsl.outputParams || {}).map(([key, param]) => (
            <Row key={key} gutter={8} style={{ marginBottom: 8, alignItems: 'center' }}>
              <Col span={4}>
                <Input value={key} disabled size="small" suffix={<Button size="small" danger type="text" onClick={() => { const newParams = { ...workflowDsl.outputParams }; delete newParams[key]; setWorkflowDsl({ ...workflowDsl, outputParams: newParams }); }}>×</Button>} />
              </Col>
              <Col span={6}>
                <Select value={param.sourceStep || '_last'} onChange={v => setWorkflowDsl({ ...workflowDsl, outputParams: { ...workflowDsl.outputParams, [key]: { ...param, sourceStep: v === '_last' ? undefined : v } } })} size="small" style={{ width: '100%' }}>
                  <Option value="_last">最后一个步骤</Option>
                  {workflowDsl.steps.map((step, idx) => (<Option key={step.id} value={step.id}>{step.name || `步骤 ${idx + 1}`}</Option>))}
                </Select>
              </Col>
              <Col span={8}>
                <Input value={param.description || ''} onChange={e => setWorkflowDsl({ ...workflowDsl, outputParams: { ...workflowDsl.outputParams, [key]: { ...param, description: e.target.value } } })} placeholder="参数描述" size="small" />
              </Col>
            </Row>
          ))}
          <Button size="small" type="dashed" onClick={() => { const key = prompt('请输入输出参数名:'); if (key && key.trim()) { setWorkflowDsl({ ...workflowDsl, outputParams: { ...workflowDsl.outputParams, [key.trim()]: { description: '', sourceStep: undefined } } }); } }} style={{ width: '100%' }}>+ 添加输出参数</Button>
        </div>

        {/* 执行配置 - 使用开关控制 */}
        <Divider plain><Text type="secondary">执行配置</Text></Divider>
        <Alert message="启用开关后可以自定义超时和重试配置，关闭则使用系统默认值" type="info" showIcon style={{ marginBottom: 12 }} />
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label="执行超时" extra="整个workflow执行期限">
              <Space>
                <Switch checked={!!workflowDsl.workflowExecutionTimeout} onChange={checked => setWorkflowDsl({ ...workflowDsl, workflowExecutionTimeout: checked ? '10m' : undefined })} />
                <Input disabled={!workflowDsl.workflowExecutionTimeout} placeholder="例如: 10m, 1h" value={workflowDsl.workflowExecutionTimeout || ''} onChange={e => setWorkflowDsl({ ...workflowDsl, workflowExecutionTimeout: e.target.value || undefined })} style={{ width: 120 }} />
              </Space>
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="运行超时" extra="单次运行期限">
              <Space>
                <Switch checked={!!workflowDsl.workflowRunTimeout} onChange={checked => setWorkflowDsl({ ...workflowDsl, workflowRunTimeout: checked ? '5m' : undefined })} />
                <Input disabled={!workflowDsl.workflowRunTimeout} placeholder="例如: 5m, 30s" value={workflowDsl.workflowRunTimeout || ''} onChange={e => setWorkflowDsl({ ...workflowDsl, workflowRunTimeout: e.target.value || undefined })} style={{ width: 120 }} />
              </Space>
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="任务超时" extra="工作流任务处理期限">
              <Space>
                <Switch checked={!!workflowDsl.workflowTaskTimeout} onChange={checked => setWorkflowDsl({ ...workflowDsl, workflowTaskTimeout: checked ? '10s' : undefined })} />
                <Input disabled={!workflowDsl.workflowTaskTimeout} placeholder="例如: 10s, 30s" value={workflowDsl.workflowTaskTimeout || ''} onChange={e => setWorkflowDsl({ ...workflowDsl, workflowTaskTimeout: e.target.value || undefined })} style={{ width: 120 }} />
              </Space>
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label="默认Activity重试次数">
              <Space>
                <Switch checked={workflowDsl.defaultActivityRetryPolicy?.maxRetries !== undefined && workflowDsl.defaultActivityRetryPolicy?.maxRetries !== null} onChange={checked => setWorkflowDsl({ ...workflowDsl, defaultActivityRetryPolicy: { ...workflowDsl.defaultActivityRetryPolicy, maxRetries: checked ? 3 : undefined } })} />
                <Input disabled={workflowDsl.defaultActivityRetryPolicy?.maxRetries === undefined || workflowDsl.defaultActivityRetryPolicy?.maxRetries === null} type="number" placeholder="3" value={workflowDsl.defaultActivityRetryPolicy?.maxRetries ?? 3} onChange={e => setWorkflowDsl({ ...workflowDsl, defaultActivityRetryPolicy: { ...workflowDsl.defaultActivityRetryPolicy, maxRetries: parseInt(e.target.value) || 3 } })} style={{ width: 80 }} />
              </Space>
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="重试间隔衰减系数" extra="指数退避系数 (默认 2.0)">
              <Space>
                <Switch checked={workflowDsl.defaultActivityRetryPolicy?.backoffCoefficient !== undefined} onChange={checked => setWorkflowDsl({ ...workflowDsl, defaultActivityRetryPolicy: { ...workflowDsl.defaultActivityRetryPolicy, backoffCoefficient: checked ? 2.0 : undefined } })} />
                <Input disabled={workflowDsl.defaultActivityRetryPolicy?.backoffCoefficient === undefined} type="number" placeholder="2.0" step="0.1" value={workflowDsl.defaultActivityRetryPolicy?.backoffCoefficient ?? 2.0} onChange={e => setWorkflowDsl({ ...workflowDsl, defaultActivityRetryPolicy: { ...workflowDsl.defaultActivityRetryPolicy, backoffCoefficient: parseFloat(e.target.value) || 2.0 } })} style={{ width: 80 }} />
              </Space>
            </Form.Item>
          </Col>
        </Row>

        {/* 补足情报 - AI代码生成指导 */}
        <Divider plain><Text type="secondary">补足情报（指导 AI 代码生成）</Text></Divider>
        <Form.Item label="额外提示词" extra="为 AI 代码生成器提供额外的上下文信息，帮助生成更准确的代码">
          <Input.TextArea rows={3} placeholder="例如：&#10;- 该工作流需要处理中文内容，请使用 utf-8 编码&#10;- 返回结果需要包含完整的错误处理逻辑&#10;- 第三方 API 调用需要添加重试机制" value={workflowDsl.extraPrompt || ''} onChange={e => setWorkflowDsl({ ...workflowDsl, extraPrompt: e.target.value || undefined })} />
        </Form.Item>
      </Modal>

      <Modal title="验证工作流 DSL" open={validateModalVisible} onCancel={() => setValidateModalVisible(false)} footer={[<Button onClick={() => setValidateModalVisible(false)}>关闭</Button>]} width={700}>
        {validationResult ? (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Alert type={validationResult.isValid ? 'success' : 'error'} message={validationResult.isValid ? '验证通过' : '验证失败'} showIcon />
            <Card><Text><strong>评分:</strong> {validationResult.score}/100</Text></Card>
            {validationResult.errors.length > 0 && <Alert type="error" message="错误" description={<ul>{validationResult.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>} />}
            {validationResult.warnings.length > 0 && <Alert type="warning" message="警告" description={<ul>{validationResult.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>} />}
          </Space>
        ) : <Alert type="info" message="点击验证按钮开始验证" />}
      </Modal>

      <Modal title="AI 生成的 Workflow 代码" open={codeModalVisible} onCancel={() => setCodeModalVisible(false)}
        footer={[
          <Button key="copy" icon={<CodeOutlined />} onClick={() => { navigator.clipboard.writeText(generatedCode || ''); message.success('已复制到剪贴板'); }}>复制代码</Button>,
          <Button key="close" onClick={() => setCodeModalVisible(false)}>关闭</Button>
        ]} width={900}>
        {generatedCode && (
          <pre style={{ background: '#1e1e1e', color: '#d4d4d4', padding: 16, borderRadius: 8, maxHeight: 500, overflow: 'auto', fontSize: 12, fontFamily: 'Monaco, Menlo, monospace' }}>
            {generatedCode}
          </pre>
        )}
      </Modal>

      <Modal title="沙箱验证结果" open={sandboxState.visible} onCancel={() => dispatchSandbox({ type: 'CLOSE' })} footer={sandboxModalFooter} width={800}>
        <Space direction="vertical" style={{ width: '100%' }}>
          {sandboxState.isStreaming && <Alert type="info" message="验证进行中..." showIcon />}

          {/* 输入参数区域 - 仅在未运行时显示 */}
          {!sandboxState.isStreaming && Object.keys(sandboxInputParams).length > 0 && (
            <Card size="small" style={{ marginBottom: 12 }}>
              <Text strong>输入参数（请填写参数值）：</Text>
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {Object.entries(sandboxInputParams).map(([key, value]) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Tag color="blue">{key}</Tag>
                    <Input
                      placeholder={`请输入 ${key}`}
                      value={value}
                      onChange={(e) => setSandboxInputParams(prev => ({ ...prev, [key]: e.target.value }))}
                      style={{ width: 160 }}
                      size="small"
                    />
                  </div>
                ))}
              </div>
              <Button
                type="primary"
                icon={<ExperimentOutlined />}
                onClick={handleSandboxValidate}
                style={{ marginTop: 12 }}
              >
                开始验证
              </Button>
            </Card>
          )}

          {sandboxState.result && (
            <>
              <Alert type={sandboxState.result.success ? 'success' : 'error'} message={sandboxState.result.success ? '验证通过' : '验证失败'} showIcon />
              <Card><Text><strong>评分:</strong> {sandboxState.result.score}/100</Text></Card>
              {sandboxState.result.error && <Alert type="error" message="错误" description={sandboxState.result.error} showIcon />}
              {sandboxState.result.result?.error && <Alert type="error" message="执行错误" description={String(sandboxState.result.result.error).substring(0, 500)} showIcon />}
              {sandboxState.result.result?.result && (
                <Card title="执行结果" size="small">
                  <pre style={{ maxHeight: 300, overflow: 'auto', fontSize: 11, margin: 0 }}>
                    {JSON.stringify(sandboxState.result.result.result, null, 2)}
                  </pre>
                </Card>
              )}
            </>
          )}
          <Card title="执行日志" size="small">
            <div style={{ maxHeight: 300, overflow: 'auto', fontFamily: 'monospace', fontSize: 11 }}>
              {sandboxState.logs.map((log, i) => <div key={i} style={{ marginBottom: 4 }}>{log}</div>)}
              {sandboxState.logs.length === 0 && !sandboxState.isStreaming && <Text type="secondary">暂无日志</Text>}
              {sandboxState.isStreaming && <Text type="secondary">等待更多日志...</Text>}
            </div>
          </Card>
        </Space>
      </Modal>
    </div>
  );
};

export default TemporalWorkflowPage;
