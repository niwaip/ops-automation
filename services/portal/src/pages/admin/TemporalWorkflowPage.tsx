import React, { useState } from 'react';
import {
  Table, Card, Button, Input, Space, Tag, Typography, Modal, message, Form, Select,
  Divider, Alert, Collapse, Badge, Popconfirm, Row, Col, Statistic, Timeline
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
import type { ColumnsType } from 'antd/es/table';

const { Text } = Typography;
const { Option } = Select;
const { Panel } = Collapse;
const { TextArea } = Input;

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
  const [sandboxResult, setSandboxResult] = useState<SandBoxValidationResult | null>(null);
  const [sandboxModalVisible, setSandboxModalVisible] = useState(false);
  const [sandboxLogs, setSandboxLogs] = useState<string[]>([]);
  const [isSandboxStreaming, setIsSandboxStreaming] = useState(false);

  const workflowsQuery = useQuery(['temporal-workflows', searchText], () => temporalWorkflowApi.list());
  const activitiesQuery = useQuery('activities', () => activityApi.list());

  const createMutation = useMutation(temporalWorkflowApi.create, {
    onSuccess: () => { message.success(t('common:success')); queryClient.invalidateQueries(['temporal-workflows']); setEditModalVisible(false); form.resetFields(); },
    onError: () => message.error(t('common:error')),
  });

  const updateMutation = useMutation(
    ({ id, data }: { id: string; data: Partial<CreateTemporalWorkflowDTO> }) => temporalWorkflowApi.update(id, data),
    { onSuccess: () => { message.success(t('common:success')); queryClient.invalidateQueries(['temporal-workflows']); setEditModalVisible(false); }, onError: () => message.error(t('common:error')) }
  );

  const deleteMutation = useMutation(temporalWorkflowApi.delete, {
    onSuccess: () => { message.success(t('common:success')); queryClient.invalidateQueries(['temporal-workflows']); },
    onError: () => message.error(t('common:error')),
  });

  const deployMutation = useMutation(temporalWorkflowApi.deploy, {
    onSuccess: () => { message.success('部署成功'); queryClient.invalidateQueries(['temporal-workflows']); },
    onError: () => message.error('部署失败'),
  });

  const validateMutation = useMutation(
    ({ workflowDsl: wfd, activityDsl: ad }: { workflowDsl: WorkflowDsl; activityDsl: ActivityDsl }) =>
      temporalWorkflowApi.validate(wfd, ad),
    { onSuccess: (result) => { setValidationResult(result); message.success('验证完成'); }, onError: () => message.error('验证失败') }
  );

  const generateCodeMutation = useMutation(
    ({ workflowDsl: wfd, activityDsl: ad }: { workflowDsl: WorkflowDsl; activityDsl: ActivityDsl }) =>
      temporalWorkflowApi.generateWorkflowCode(wfd, ad),
    { onSuccess: (result: WorkflowCodeResult) => {
      if (result.success && result.code) {
        setGeneratedCode(result.code);
        setCodeModalVisible(true);
        message.success('代码生成成功');
      } else {
        message.error(result.error || '代码生成失败');
      }
    }, onError: (error: any) => message.error('代码生成失败: ' + (error.message || 'Unknown error')) }
  );

  const handleCreate = () => {
    setEditingWorkflow(null);
    form.resetFields();
    setWorkflowDsl(DEFAULT_WORKFLOW_DSL);
    setActivityDsl(DEFAULT_ACTIVITY_DSL);
    setEditModalVisible(true);
  };

  const handleEdit = (workflow: TemporalWorkflowDTO) => {
    setEditingWorkflow(workflow);
    form.setFieldsValue({ name: workflow.name, description: workflow.description, taskQueue: workflow.taskQueue });
    setWorkflowDsl(workflow.workflowDsl || DEFAULT_WORKFLOW_DSL);
    setActivityDsl(workflow.activityDsl || DEFAULT_ACTIVITY_DSL);
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

  const handleGenerateCode = () => {
    const formValues = form.getFieldsValue();
    const workflowName = formValues.name || workflowDsl.name;
    if (!workflowName) { message.warning('请先填写工作流名称'); return; }
    if (workflowDsl.steps.length === 0) { message.warning('请先添加至少一个步骤'); return; }
    generateCodeMutation.mutate({ workflowDsl: { ...workflowDsl, name: workflowName }, activityDsl });
  };

  const handleSandboxValidate = async () => {
    if (!generatedCode) { message.warning('请先生成代码'); return; }
    const fn = workflowDsl.name.replace(/\s+/g, '') + 'Workflow';
    setSandboxLogs([]);
    setSandboxResult(null);
    setSandboxModalVisible(true);
    setIsSandboxStreaming(true);

    try {
      await temporalWorkflowApi.validateInSandboxStream(
        generatedCode,
        fn,
        { test: 'workflow-validation' },
        (event) => {
          if (event.type === 'log' && event.content) {
            setSandboxLogs(prev => [...prev, event.content!]);
          } else if (event.type === 'done') {
            setSandboxResult({
              success: event.success ?? false,
              logs: sandboxLogs,
              result: event.result,
              error: event.error,
              score: event.score ?? 0,
            });
            setIsSandboxStreaming(false);
          } else if (event.type === 'error') {
            setSandboxResult({
              success: false,
              logs: sandboxLogs,
              error: event.content || 'Unknown error',
              score: 0,
            });
            setIsSandboxStreaming(false);
          }
        }
      );
    } catch (error: any) {
      setSandboxLogs(prev => [...prev, `错误: ${error.message}`]);
      setSandboxResult({
        success: false,
        logs: sandboxLogs,
        error: error.message,
        score: 0,
      });
      setIsSandboxStreaming(false);
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

  const handleAddActivity = () => setActivityDsl({ ...activityDsl, activities: [...activityDsl.activities, { name: `Activity${activityDsl.activities.length + 1}`, fn: '', timeout: '30s', handler: 'api', config: {} }] });
  const handleRemoveActivity = (index: number) => setActivityDsl({ ...activityDsl, activities: activityDsl.activities.filter((_, i) => i !== index) });
  const handleUpdateActivity = (index: number, field: string, value: any) => { const updated = [...activityDsl.activities]; updated[index] = { ...updated[index], [field]: value }; setActivityDsl({ ...activityDsl, activities: updated }); };

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
        <Table columns={columns} dataSource={workflowsQuery.data || []} rowKey="id" loading={workflowsQuery.isLoading} pagination={{ showSizeChanger: true, showTotal: total => `共 ${total} 条` }} />
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
          <Button key="generate" icon={<RobotOutlined />} onClick={handleGenerateCode} loading={generateCodeMutation.isLoading}>AI生成代码</Button>,
          <Button key="sandbox" icon={<ExperimentOutlined />} onClick={handleSandboxValidate} loading={isSandboxStreaming} disabled={!generatedCode}>沙箱验证</Button>,
          <Button key="viewCode" icon={<CodeOutlined />} onClick={() => setCodeModalVisible(true)} disabled={!generatedCode}>查看代码</Button>,
          <Button key="cancel" onClick={() => setEditModalVisible(false)}>取消</Button>,
          <Button key="save" type="primary" loading={createMutation.isLoading || updateMutation.isLoading} onClick={handleSave}>保存</Button>
        ]}
        width={1200} style={{ top: 20 }}>
        <Form form={form} layout="vertical">
          <Row gutter={16}><Col span={12}><Form.Item name="name" label="工作流名称" rules={[{ required: true, message: '请输入工作流名称' }]}><Input placeholder="例如：合同生成流程" /></Form.Item></Col><Col span={12}><Form.Item name="taskQueue" label="Task Queue" rules={[{ required: true, message: '请输入Task Queue' }]} extra="Temporal Worker 监听的队列名称"><Input placeholder="例如：SKILL_TASK_QUEUE" /></Form.Item></Col></Row>
          <Form.Item name="description" label="描述"><Input.TextArea rows={2} placeholder="工作流描述" /></Form.Item>
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
                            <Button icon={<SearchOutlined />} rotate={90} size="small" onClick={(e) => { e.stopPropagation(); const newSteps = [...workflowDsl.steps]; [newSteps[index], newSteps[index + 1]] = [newSteps[index + 1], newSteps[index]]; setWorkflowDsl({ ...workflowDsl, steps: newSteps }); if (selectedStepIndexForConfig === index) setSelectedStepIndexForConfig(index + 1); else if (selectedStepIndexForConfig === index + 1) setSelectedStepIndexForConfig(index); }} />
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

                      <Form.Item label="重试策略">
                        <Input
                          type="number"
                          value={workflowDsl.steps[selectedStepIndexForConfig].retryPolicy?.maxRetries || 3}
                          onChange={e => handleUpdateStep(selectedStepIndexForConfig, 'retryPolicy', { maxRetries: parseInt(e.target.value) || 3 })}
                          placeholder="最大重试次数"
                        />
                      </Form.Item>

                      <Form.Item label="超时时间">
                        <Input
                          value={workflowDsl.steps[selectedStepIndexForConfig].input?.timeout || '60s'}
                          onChange={e => handleUpdateStep(selectedStepIndexForConfig, 'input', { ...workflowDsl.steps[selectedStepIndexForConfig].input, timeout: e.target.value })}
                          placeholder="例如: 30s, 60s"
                        />
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

      <Modal title="沙箱验证结果" open={sandboxModalVisible} onCancel={() => { setSandboxModalVisible(false); setIsSandboxStreaming(false); }} footer={[<Button onClick={() => { setSandboxModalVisible(false); setIsSandboxStreaming(false); }}>关闭</Button>]} width={800}>
        <Space direction="vertical" style={{ width: '100%' }}>
          {isSandboxStreaming && <Alert type="info" message="验证进行中..." showIcon />}
          {sandboxResult && (
            <>
              <Alert type={sandboxResult.success ? 'success' : 'error'} message={sandboxResult.success ? '验证通过' : '验证失败'} showIcon />
              <Card><Text><strong>评分:</strong> {sandboxResult.score}/100</Text></Card>
              {sandboxResult.error && <Alert type="error" message="错误" description={sandboxResult.error} showIcon />}
              {sandboxResult.result?.error && <Alert type="error" message="执行错误" description={String(sandboxResult.result.error).substring(0, 500)} showIcon />}
            </>
          )}
          <Card title="执行日志" size="small">
            <div style={{ maxHeight: 300, overflow: 'auto', fontFamily: 'monospace', fontSize: 11 }}>
              {sandboxLogs.map((log, i) => <div key={i} style={{ marginBottom: 4 }}>{log}</div>)}
              {sandboxLogs.length === 0 && !isSandboxStreaming && <Text type="secondary">暂无日志</Text>}
              {isSandboxStreaming && <Text type="secondary">等待更多日志...</Text>}
            </div>
          </Card>
        </Space>
      </Modal>
    </div>
  );
};

export default TemporalWorkflowPage;