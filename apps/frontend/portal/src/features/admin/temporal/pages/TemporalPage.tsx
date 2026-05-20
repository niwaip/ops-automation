import React, { useMemo, useState } from 'react';
import {
  Table, Card, Button, Input, Space, Tag, Typography, Modal, message, Tooltip, Badge, Form
} from 'antd';
import {
  SearchOutlined, PlusOutlined, EditOutlined, DeleteOutlined, PlayCircleOutlined,
  ReloadOutlined, RobotOutlined, InfoCircleOutlined, CodeOutlined, FolderOpenOutlined, CheckCircleOutlined
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useNavigate } from 'react-router-dom';
import {
  temporalWorkflowApi, TemporalWorkflowDTO, CreateTemporalWorkflowDTO, WorkflowDsl
} from '@/api/temporal';
import { executionApi } from '@/api/execution';
import { ListSectionHeader } from '@/components/page/PageScaffold';
import type { ColumnsType } from 'antd/es/table';
import { AiDraftDrawer } from '../components/AiDraftDrawer';
import { WorkflowEditModal } from '../components/WorkflowEditModal';

const { Text } = Typography;

const SECTION_CARD_STYLE = {
  background: 'var(--bg-card)',
  borderRadius: 12,
  border: '1px solid var(--border-color)',
  boxShadow: 'var(--shadow-sm)',
  height: '100%',
};

const centerTitle = (title: string) => <div style={{ textAlign: 'center' }}>{title}</div>;
const shorten = (str: string, len = 20) => str && str.length > len ? str.substring(0, len) + '...' : str;

const TemporalPage: React.FC = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [searchText, setSearchText] = useState('');
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<TemporalWorkflowDTO | null>(null);
  const [draftWorkflowDsl, setDraftWorkflowDsl] = useState<WorkflowDsl | null>(null);
  
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState<TemporalWorkflowDTO | null>(null);
  
  const [executionModalVisible, setExecutionModalVisible] = useState(false);
  const [executingWorkflow, setExecutingWorkflow] = useState<TemporalWorkflowDTO | null>(null);
  const [executionParams, setExecutionParams] = useState<any>({});

  const [aiDraftDrawerVisible, setAiDraftDrawerVisible] = useState(false);

  const workflowsQuery = useQuery(['temporal'], () => temporalWorkflowApi.list());
  const executionsQuery = useQuery(['executions'], () => executionApi.list());

  const deleteMutation = useMutation(temporalWorkflowApi.delete, {
    onSuccess: () => { message.success(t('common:success')); queryClient.invalidateQueries(['temporal']); },
    onError: () => { message.error(t('common:error')); },
  });

  const createMutation = useMutation(temporalWorkflowApi.create, {
    onSuccess: () => { message.success(t('common:success')); queryClient.invalidateQueries(['temporal']); setEditModalVisible(false); },
    onError: () => { message.error(t('common:error')); },
  });

  const updateMutation = useMutation(
    ({ id, data }: { id: string; data: Partial<CreateTemporalWorkflowDTO> }) => temporalWorkflowApi.update(id, data),
    { onSuccess: () => { message.success(t('common:success')); queryClient.invalidateQueries(['temporal']); setEditModalVisible(false); }, onError: () => { message.error(t('common:error')); } }
  );

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

  const workflowOverviewStats = [
    {
      key: 'total',
      label: '工作流总数',
      value: workflowsQuery.data?.length || 0,
      icon: <CodeOutlined style={{ color: 'var(--primary-color)' }} />,
      color: 'var(--primary-color)',
    },
    {
      key: 'active',
      label: '已启用',
      value: workflowsQuery.data?.filter(w => w.isActive).length || 0,
      icon: <CheckCircleOutlined style={{ color: 'var(--success-color)' }} />,
      color: 'var(--success-color)',
    },
    {
      key: 'queues',
      label: '任务队列',
      value: new Set((workflowsQuery.data || []).map(w => w.taskQueue).filter(Boolean)).size,
      icon: <FolderOpenOutlined style={{ color: 'var(--info-color)' }} />,
      color: 'var(--info-color)',
    },
    {
      key: 'executions',
      label: '执行记录',
      value: executionsQuery.data?.total || 0,
      icon: <SearchOutlined style={{ color: 'var(--warning-color)' }} />,
      color: 'var(--warning-color)',
    },
  ];

  const handleCreate = () => {
    setEditingWorkflow(null);
    setDraftWorkflowDsl(null);
    setEditModalVisible(true);
  };

  const handleEdit = async (workflow: TemporalWorkflowDTO) => {
    setEditingWorkflow(workflow);
    setDraftWorkflowDsl(null);
    setEditModalVisible(true);
  };

  const handleViewDetail = (workflow: TemporalWorkflowDTO) => {
    setSelectedWorkflow(workflow);
    setDetailModalVisible(true);
  };

  const handleDelete = (id: string) => Modal.confirm({
    title: t('common:confirmDelete'),
    content: '删除后无法恢复，是否继续？',
    onOk: () => deleteMutation.mutate(id)
  });

  const handleSaveWorkflow = (data: { workflowDsl: any; activityDsl: any; name: string; description: string; taskQueue?: string }) => {
    const payload = {
      name: data.name,
      description: data.description,
      taskQueue: data.taskQueue || 'SKILL_TASK_QUEUE',
      workflowDsl: {
        ...data.workflowDsl,
        name: data.name,
      },
      activityDsl: data.activityDsl,
    };
    if (editingWorkflow) {
      updateMutation.mutate({ id: editingWorkflow.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleCreateExecutionFromWorkflow = async () => {
    if (!executingWorkflow) return;
    const skillId = (executingWorkflow.workflowDsl as any)?.skillId || executingWorkflow.id;
    try {
      const execution = await executionApi.create({
        skillId,
        runtimeType: 'browser',
        input: {},
      });
      message.success('已创建执行记录，正在跳转执行详情');
      setExecutionModalVisible(false);
      navigate(`/executions/${execution.id}`);
    } catch (error: any) {
      message.error('触发执行失败');
    }
  };

  const openAiDraftModal = () => {
    setAiDraftDrawerVisible(true);
  };

  const columns: ColumnsType<TemporalWorkflowDTO> = [
    {
      title: centerTitle('工作流名称'),
      dataIndex: 'name',
      key: 'name',
      width: 220,
      render: (name, r) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Space size={6}>
            <Text strong style={{ color: 'var(--primary-color)', fontSize: 14 }}>{name}</Text>
          </Space>
          {r.workflowDsl?.workflowClassName && <Text type="secondary" style={{ fontSize: 12, fontFamily: 'monospace' }}>{r.workflowDsl.workflowClassName}</Text>}
          <Text type="secondary" style={{ fontSize: 12 }}>{r.taskQueue}</Text>
        </div>
      ),
    },
    { title: centerTitle('描述'), dataIndex: 'description', key: 'description', width: 360, align: 'center', render: (desc: string) => <Tooltip title={desc || '-'}>{shorten(desc, 40)}</Tooltip> },
    { title: centerTitle('步骤数'), key: 'stepCount', width: 60, align: 'center', render: (_, r) => <Badge count={r.workflowDsl?.steps?.length || 0} showZero color="blue" /> },
    { title: centerTitle('工作单元数'), key: 'activityCount', width: 72, align: 'center', render: (_, r) => <Badge count={r.activityDsl?.activities?.length || 0} showZero color="green" /> },
    { title: centerTitle('状态'), key: 'status', width: 72, align: 'center', render: (_, r) => <Tag color={r.isActive ? 'green' : 'default'}>{r.isActive ? '启用' : '禁用'}</Tag> },
    {
      title: centerTitle(t('common:actions')),
      key: 'actions',
      width: 200,
      align: 'center',
      render: (_, r) => (
        <Space size="small">
          <Button type="text" size="small" icon={<PlayCircleOutlined />} onClick={() => { setExecutingWorkflow(r); setExecutionParams({}); setExecutionModalVisible(true); }} title="触发执行" />
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(r)} title={t('common:edit')} />
          <Button type="text" size="small" icon={<CodeOutlined />} onClick={() => handleViewDetail(r)} title="查看详情" />
          <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => handleDelete(r.id)} title={t('common:delete')} />
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '8px 4px 12px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 16 }}>
        {workflowOverviewStats.map((item) => (
          <Card key={item.key} size="small" style={{ ...SECTION_CARD_STYLE, borderRadius: 14 }} styles={{ body: { padding: '10px 14px' } }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <Space size={8} align="center">
                <span style={{ display: 'inline-flex', fontSize: 14 }}>{item.icon}</span>
                <Text type="secondary" style={{ fontSize: 12 }}>{item.label}</Text>
              </Space>
              <Text style={{ fontSize: 20, fontWeight: 700, color: item.color, lineHeight: 1 }}>{item.value}</Text>
            </div>
          </Card>
        ))}
      </div>

      <Card style={SECTION_CARD_STYLE} styles={{ body: { padding: '12px 16px' } }}>
        <ListSectionHeader
          title={(
            <Space size={16}>
              <Text strong style={{ fontSize: 16 }}>工作流记录列表</Text>
              <Input size="small" placeholder="搜索工作流名称、描述或任务队列" prefix={<SearchOutlined />} value={searchText} onChange={e => setSearchText(e.target.value)} style={{ width: 300, background: 'var(--bg-secondary)', borderRadius: 6, fontSize: 12 }} variant="borderless" allowClear />
            </Space>
          )}
          tip={(
            <Tooltip title="Workflow DSL 定义确定性编排逻辑，Temporal 会 replay 这部分逻辑恢复状态；工作单元 DSL 定义 API 调用、文档渲染、浏览器操作、脚本执行等非确定性副作用操作。">
              <InfoCircleOutlined style={{ color: 'var(--text-secondary)' }} />
            </Tooltip>
          )}
          extra={(
            <Space wrap size={8}>
              <Text type="secondary" style={{ fontSize: 13 }}>共 {filteredWorkflows.length} 条</Text>
              <Button size="middle" icon={<ReloadOutlined />} onClick={() => workflowsQuery.refetch()} className="btn-pill">刷新</Button>
              <Button size="middle" icon={<RobotOutlined />} onClick={openAiDraftModal} className="btn-pill">AI 创建</Button>
              <Button size="middle" icon={<PlusOutlined />} type="primary" onClick={handleCreate} className="btn-pill">创建工作流</Button>
            </Space>
          )}
        />

        <Table columns={columns} dataSource={filteredWorkflows} rowKey="id" loading={workflowsQuery.isLoading} size="middle" pagination={{ showSizeChanger: true, showTotal: total => `共 ${total} 条` }} />
      </Card>

      <Modal title="触发执行" open={executionModalVisible} onOk={handleCreateExecutionFromWorkflow} onCancel={() => setExecutionModalVisible(false)}>
        <Form layout="vertical">
          <Form.Item label="执行参数 (JSON)">
            <Input.TextArea value={JSON.stringify(executionParams, null, 2)} onChange={e => { try { setExecutionParams(JSON.parse(e.target.value)); } catch (err) {} }} autoSize={{ minRows: 4, maxRows: 10 }} style={{ fontFamily: 'monospace', fontSize: 12 }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="工作流详情" open={detailModalVisible} onCancel={() => setDetailModalVisible(false)} footer={null} width={800}>
        {selectedWorkflow && (
          <pre style={{ background: 'var(--bg-secondary)', padding: 12, borderRadius: 8, overflow: 'auto', maxHeight: 600, fontSize: 12, fontFamily: 'monospace' }}>
            {JSON.stringify(selectedWorkflow, null, 2)}
          </pre>
        )}
      </Modal>

      <AiDraftDrawer
        visible={aiDraftDrawerVisible}
        onClose={() => setAiDraftDrawerVisible(false)}
        onApplyDraft={(dsl) => {
          setAiDraftDrawerVisible(false);
          setEditingWorkflow(null);
          setDraftWorkflowDsl(dsl.workflowDsl as WorkflowDsl);
          setEditModalVisible(true);
        }}
      />
      
      <WorkflowEditModal
        visible={editModalVisible}
        onCancel={() => setEditModalVisible(false)}
        onSave={handleSaveWorkflow}
        initialWorkflow={editingWorkflow}
        initialDraftDsl={draftWorkflowDsl}
      />
    </div>
  );
};

export default TemporalPage;
