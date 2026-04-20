import React, { useState } from 'react';
import {
  Table, Card, Button, Input, Space, Tag, Typography, Modal, message, Form, Select,
  Divider, Alert, Empty, Collapse, Badge, Timeline
} from 'antd';
import {
  SearchOutlined, PlusOutlined, EditOutlined, DeleteOutlined, PlayCircleOutlined,
  EyeOutlined, ReloadOutlined, CloudUploadOutlined, CodeOutlined, ApiOutlined,
  ArrowUpOutlined, ArrowDownOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  temporalWorkflowApi,
  TemporalWorkflowDTO,
  CreateTemporalWorkflowDTO,
  WorkflowDsl,
  ActivityDsl,
  TemporalValidationResult,
  DEFAULT_WORKFLOW_DSL,
  DEFAULT_ACTIVITY_DSL,
} from '../../api/temporal-workflow';
import type { ColumnsType } from 'antd/es/table';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { Panel } = Collapse;
const { TextArea } = Input;

const TemporalWorkflowPage: React.FC = () => {
  const { t } = useTranslation(['common', 'admin']);
  const queryClient = useQueryClient();

  const [searchText, setSearchText] = useState('');
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [validateModalVisible, setValidateModalVisible] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<TemporalWorkflowDTO | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<TemporalWorkflowDTO | null>(null);
  const [validationResult, setValidationResult] = useState<TemporalValidationResult | null>(null);
  const [form] = Form.useForm();

  const [workflowDsl, setWorkflowDsl] = useState<WorkflowDsl>(DEFAULT_WORKFLOW_DSL);
  const [activityDsl, setActivityDsl] = useState<ActivityDsl>(DEFAULT_ACTIVITY_DSL);

  const workflowsQuery = useQuery(
    ['temporal-workflows', searchText],
    () => temporalWorkflowApi.list()
  );

  const createMutation = useMutation(temporalWorkflowApi.create, {
    onSuccess: () => {
      message.success(t('common:success'));
      queryClient.invalidateQueries(['temporal-workflows']);
      setEditModalVisible(false);
      form.resetFields();
    },
    onError: () => message.error(t('common:error')),
  });

  const updateMutation = useMutation(
    ({ id, data }: { id: string; data: Partial<CreateTemporalWorkflowDTO> }) =>
      temporalWorkflowApi.update(id, data),
    {
      onSuccess: () => {
        message.success(t('common:success'));
        queryClient.invalidateQueries(['temporal-workflows']);
        setEditModalVisible(false);
      },
      onError: () => message.error(t('common:error')),
    }
  );

  const deleteMutation = useMutation(temporalWorkflowApi.delete, {
    onSuccess: () => {
      message.success(t('common:success'));
      queryClient.invalidateQueries(['temporal-workflows']);
    },
    onError: () => message.error(t('common:error')),
  });

  const deployMutation = useMutation(temporalWorkflowApi.deploy, {
    onSuccess: () => {
      message.success('部署成功');
      queryClient.invalidateQueries(['temporal-workflows']);
    },
    onError: () => message.error('部署失败'),
  });

  const validateMutation = useMutation(temporalWorkflowApi.validate, {
    onSuccess: (result) => {
      setValidationResult(result);
      message.success('验证完成');
    },
    onError: () => message.error('验证失败'),
  });

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
    setWorkflowDsl(workflow.workflowDsl);
    setActivityDsl(workflow.activityDsl);
    setEditModalVisible(true);
  };

  const handleViewDetail = (workflow: TemporalWorkflowDTO) => {
    setSelectedWorkflow(workflow);
    setDetailModalVisible(true);
  };

  const handleValidate = () => {
    setValidationResult(null);
    setValidateModalVisible(true);
    validateMutation.mutate({ workflowDsl, activityDsl });
  };

  const handleDeploy = (id: string) => {
    Modal.confirm({
      title: '确认部署',
      content: '确定要部署此工作流到 Temporal Worker 吗？',
      onOk: () => deployMutation.mutate(id),
    });
  };

  const handleSave = () => {
    form.validateFields().then((values) => {
      const data: CreateTemporalWorkflowDTO = {
        name: values.name,
        description: values.description,
        taskQueue: values.taskQueue,
        workflowDsl,
        activityDsl,
      };
      if (editingWorkflow) {
        updateMutation.mutate({ id: editingWorkflow.id, data });
      } else {
        createMutation.mutate(data);
      }
    });
  };

  const handleDelete = (id: string) => {
    Modal.confirm({
      title: t('common:confirmDelete'),
      content: '删除后无法恢复，是否继续？',
      onOk: () => deleteMutation.mutate(id),
    });
  };

  const handleAddStep = () => {
    setWorkflowDsl({
      ...workflowDsl,
      steps: [...workflowDsl.steps, { id: `step_${Date.now()}`, name: `步骤 ${workflowDsl.steps.length + 1}`, type: 'activity' }],
    });
  };

  const handleRemoveStep = (index: number) => {
    setWorkflowDsl({ ...workflowDsl, steps: workflowDsl.steps.filter((_, i) => i !== index) });
  };

  const handleUpdateStep = (index: number, field: string, value: any) => {
    const updated = [...workflowDsl.steps];
    updated[index] = { ...updated[index], [field]: value };
    setWorkflowDsl({ ...workflowDsl, steps: updated });
  };

  const handleAddActivity = () => {
    setActivityDsl({
      ...activityDsl,
      activities: [...activityDsl.activities, { name: `Activity${activityDsl.activities.length + 1}`, fn: '', timeout: '30s', handler: 'api', config: {} }],
    });
  };

  const handleRemoveActivity = (index: number) => {
    setActivityDsl({ ...activityDsl, activities: activityDsl.activities.filter((_, i) => i !== index) });
  };

  const handleUpdateActivity = (index: number, field: string, value: any) => {
    const updated = [...activityDsl.activities];
    updated[index] = { ...updated[index], [field]: value };
    setActivityDsl({ ...activityDsl, activities: updated });
  };

  const columns: ColumnsType<TemporalWorkflowDTO> = [
    { title: '工作流名称', dataIndex: 'name', key: 'name', render: (name, r) => <a onClick={() => handleViewDetail(r)}>{name}</a> },
    { title: 'Task Queue', dataIndex: 'taskQueue', key: 'taskQueue', render: q => <Tag color="blue">{q}</Tag> },
    { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true },
    { title: '步骤数', key: 'stepCount', render: (_, r) => <Badge count={r.workflowDsl?.steps?.length || 0} showZero color="blue" /> },
    { title: 'Activity数', key: 'activityCount', render: (_, r) => <Badge count={r.activityDsl?.activities?.length || 0} showZero color="green" /> },
    {
      title: '状态', key: 'status', render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Tag color={r.isActive ? 'green' : 'default'}>{r.isActive ? '已启用' : '已禁用'}</Tag>
          {r.deployedAt && <Tag color="cyan" style={{ fontSize: 10 }}>已部署</Tag>}
        </Space>
      ),
    },
    {
      title: t('common:actions'), key: 'actions', render: (_, r) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(r)}>编辑</Button>
          <Button type="link" size="small" icon={<CloudUploadOutlined />} onClick={() => handleDeploy(r.id)}>部署</Button>
          <Button type="link" size="small" icon={<DeleteOutlined />} danger onClick={() => handleDelete(r.id)} />
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Title level={4}>Temporal 工作流管理</Title>

      <Card style={{ marginTop: 8, marginBottom: 16 }}>
        <Space direction="vertical" size="small">
          <Text strong>Temporal 工作流说明：</Text>
          <Text>• <strong>Workflow DSL</strong>：定义确定性编排逻辑（先做A，再做B，失败重试）</Text>
          <Text>• <strong>Activity DSL</strong>：定义非确定性副作用操作（API调用、文档渲染等）</Text>
        </Space>
      </Card>

      <Card>
        <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
          <Input placeholder={t('common:search')} prefix={<SearchOutlined />} value={searchText} onChange={e => setSearchText(e.target.value)} style={{ width: 200 }} allowClear />
          <Space>
            <Button icon={<PlusOutlined />} type="primary" onClick={handleCreate}>创建工作流</Button>
            <Button icon={<ReloadOutlined />} onClick={() => workflowsQuery.refetch()}>{t('common:refresh')}</Button>
          </Space>
        </Space>

        <Table columns={columns} dataSource={workflowsQuery.data || []} rowKey="id" loading={workflowsQuery.isLoading} scroll={{ x: 1000 }} pagination={{ showSizeChanger: true, showTotal: total => t('common:pagination.total', { total }) }} />
      </Card>

      <Modal title="工作流详情" open={detailModalVisible} onCancel={() => setDetailModalVisible(false)} footer={null} width={900}>
        {selectedWorkflow && (
          <Collapse defaultActiveKey={['basic', 'workflow', 'activities']}>
            <Panel header="基本信息" key="basic">
              <Space direction="vertical">
                <Text><strong>ID:</strong> {selectedWorkflow.id}</Text>
                <Text><strong>描述:</strong> {selectedWorkflow.description || '无'}</Text>
                <Text><strong>Task Queue:</strong> <Tag color="blue">{selectedWorkflow.taskQueue}</Tag></Text>
                {selectedWorkflow.deployedAt && <Text><strong>部署时间:</strong> {new Date(selectedWorkflow.deployedAt).toLocaleString()}</Text>}
              </Space>
            </Panel>
            <Panel header="Workflow DSL" key="workflow">
              <pre style={{ background: '#f5f5f5', padding: 16, borderRadius: 4, maxHeight: 300, overflow: 'auto' }}>{JSON.stringify(selectedWorkflow.workflowDsl, null, 2)}</pre>
            </Panel>
            <Panel header="Activity DSL" key="activities">
              <pre style={{ background: '#f5f5f5', padding: 16, borderRadius: 4, maxHeight: 300, overflow: 'auto' }}>{JSON.stringify(selectedWorkflow.activityDsl, null, 2)}</pre>
            </Panel>
          </Collapse>
        )}
      </Modal>

      <Modal title={editingWorkflow ? '编辑工作流' : '创建工作流'} open={editModalVisible} onOk={handleSave} onCancel={() => setEditModalVisible(false)}
        footer={[<Button key="validate" icon={<PlayCircleOutlined />} onClick={handleValidate}>验证</Button>, <Button key="cancel" onClick={() => setEditModalVisible(false)}>取消</Button>, <Button key="save" type="primary" loading={createMutation.isLoading || updateMutation.isLoading} onClick={handleSave}>保存</Button>]}
        confirmLoading={createMutation.isLoading || updateMutation.isLoading} width={900} style={{ top: 20 }}>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="工作流名称" rules={[{ required: true, message: '请输入工作流名称' }]}><Input placeholder="例如：合同生成流程" /></Form.Item>
          <Form.Item name="description" label="描述"><Input.TextArea rows={2} placeholder="工作流描述" /></Form.Item>
          <Form.Item name="taskQueue" label="Task Queue" rules={[{ required: true, message: '请输入Task Queue' }]} extra="Temporal Worker 监听的队列名称"><Input placeholder="例如：SKILL_TASK_QUEUE" /></Form.Item>
        </Form>

        <Divider><Space><CodeOutlined /><Text strong>Workflow DSL</Text><Tag color="blue">确定性编排</Tag></Space></Divider>
        <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
          <Paragraph type="secondary">Workflow DSL 定义了编排逻辑，是确定性的。Temporal 会 replay 这个逻辑来恢复状态。</Paragraph>
          <Form.Item label="工作流名称"><Input value={workflowDsl.name} onChange={e => setWorkflowDsl({ ...workflowDsl, name: e.target.value })} placeholder="工作流名称" /></Form.Item>
        </Card>
        <Button icon={<PlusOutlined />} onClick={handleAddStep}>添加步骤</Button>
        {workflowDsl.steps.length === 0 ? <Empty description="暂无步骤，请添加" /> : (
          <Timeline>{workflowDsl.steps.map((step, index) => (
            <Timeline.Item key={step.id} color="blue">
              <Card size="small">
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Input value={step.name} onChange={e => handleUpdateStep(index, 'name', e.target.value)} placeholder="步骤名称" style={{ width: 200 }} />
                    <Space>
                      <Select value={step.type} onChange={v => handleUpdateStep(index, 'type', v)} style={{ width: 120 }}>
                        <Option value="activity">Activity</Option>
                        <Option value="signal">Signal</Option>
                        <Option value="query">Query</Option>
                      </Select>
                      <Button icon={<DeleteOutlined />} danger onClick={() => handleRemoveStep(index)} size="small" />
                    </Space>
                  </Space>
                  {step.type === 'activity' && (
                    <Input value={step.activityName} onChange={e => handleUpdateStep(index, 'activityName', e.target.value)} placeholder="Activity 名称" style={{ width: '100%' }} />
                  )}
                </Space>
              </Card>
            </Timeline.Item>
          ))}</Timeline>
        )}

        <Divider><Space><ApiOutlined /><Text strong>Activity DSL</Text><Tag color="green">非确定性副作用</Tag></Space></Divider>
        <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
          <Paragraph type="secondary">Activity DSL 定义了副作用操作，是非确定性的。每个 Activity 可以调用 API、执行脚本或渲染文档。</Paragraph>
        </Card>
        <Button icon={<PlusOutlined />} onClick={handleAddActivity}>添加 Activity</Button>
        {activityDsl.activities.length === 0 ? <Empty description="暂无 Activity，请添加" /> : (
          <Space direction="vertical" style={{ width: '100%' }}>{activityDsl.activities.map((activity, index) => (
            <Card key={index} size="small">
              <Space direction="vertical" style={{ width: '100%' }}>
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Input value={activity.name} onChange={e => handleUpdateActivity(index, 'name', e.target.value)} placeholder="Activity 名称" style={{ width: 200 }} />
                  <Space>
                    <Select value={activity.handler} onChange={v => handleUpdateActivity(index, 'handler', v)} style={{ width: 120 }}>
                      <Option value="api">API调用</Option>
                      <Option value="carbone">Carbone渲染</Option>
                      <Option value="browser">浏览器操作</Option>
                      <Option value="script">脚本执行</Option>
                    </Select>
                    <Button icon={<DeleteOutlined />} danger onClick={() => handleRemoveActivity(index)} size="small" />
                  </Space>
                </Space>
                <Input value={activity.fn} onChange={e => handleUpdateActivity(index, 'fn', e.target.value)} placeholder="函数名" style={{ width: 150 }} />
                <TextArea value={JSON.stringify(activity.config, null, 2)} onChange={e => { try { handleUpdateActivity(index, 'config', JSON.parse(e.target.value)); } catch {} }} rows={2} style={{ fontFamily: 'monospace' }} />
              </Space>
            </Card>
          ))}</Space>
        )}
      </Modal>

      <Modal title="验证工作流 DSL" open={validateModalVisible} onCancel={() => setValidateModalVisible(false)} footer={[<Button key="close" onClick={() => setValidateModalVisible(false)}>关闭</Button>]} width={700}>
        {validationResult ? (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Alert type={validationResult.isValid ? 'success' : 'error'} message={validationResult.isValid ? '验证通过' : '验证失败'} showIcon />
            <Card size="small"><Text><strong>评分:</strong> {validationResult.score}/100</Text></Card>
            {validationResult.errors.length > 0 && <Alert type="error" message="错误" description={<ul>{validationResult.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>} />}
            {validationResult.warnings.length > 0 && <Alert type="warning" message="警告" description={<ul>{validationResult.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>} />}
          </Space>
        ) : <Alert type="info" message="点击验证按钮开始验证" />}
      </Modal>
    </div>
  );
};

export default TemporalWorkflowPage;