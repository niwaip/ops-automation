import React, { useMemo, useState } from 'react';
import {
  Table,
  Card,
  Button,
  Input,
  Space,
  Tag,
  Typography,
  Modal,
  message,
  Tooltip,
  Badge,
  Upload,
} from 'antd';
import {
  SearchOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  RobotOutlined,
  InfoCircleOutlined,
  CodeOutlined,
  FolderOpenOutlined,
  CheckCircleOutlined,
  DownloadOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import type { UploadProps } from 'antd';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  temporalWorkflowApi,
  TemporalWorkflowDTO,
  CreateTemporalWorkflowDTO,
  TemplateWorkflowDraft,
} from '@/api/temporal';
import { executionApi } from '@/api/execution';
import { ListSectionHeader } from '@/components/page/PageScaffold';
import type { ColumnsType } from 'antd/es/table';
import { AiDraftDrawer } from '../components/AiDraftDrawer';
import { WorkflowEditModal } from '../components/WorkflowEditModal';
import { WorkflowDetailModal } from '../components/WorkflowEdit/components/WorkflowDetailModal';

const { Text } = Typography;

const SECTION_CARD_STYLE = {
  background: 'var(--bg-card)',
  borderRadius: 12,
  border: '1px solid var(--border-color)',
  boxShadow: 'var(--shadow-sm)',
  height: '100%',
};

const centerTitle = (title: string) => <div style={{ textAlign: 'center' }}>{title}</div>;
const shorten = (str: string, len = 20) =>
  str && str.length > len ? str.substring(0, len) + '...' : str;

const getLogicalStepSummary = (workflow: TemporalWorkflowDTO) => {
  const plan = workflow.workflowDsl?.sourceContext?.browserLogicalPlan;
  return {
    total: plan?.totalStepCount || workflow.workflowDsl?.steps?.length || 0,
    browser: plan?.browserStepCount || workflow.workflowDsl?.steps?.length || 0,
    postProcessing: plan?.postProcessingStepCount || 0,
  };
};

const getArtifactStatusMeta = (status?: string) => {
  switch (status) {
    case 'validated':
      return { color: 'green', label: '已验证' };
    case 'generated':
      return { color: 'blue', label: '已生成' };
    case 'failed':
      return { color: 'red', label: '验证失败' };
    default:
      return { color: 'default', label: '草稿' };
  }
};

const TemporalPage: React.FC = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [searchText, setSearchText] = useState('');
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<TemporalWorkflowDTO | null>(null);
  const [draftWorkflowDsl, setDraftWorkflowDsl] = useState<Pick<
    TemplateWorkflowDraft,
    'name' | 'description' | 'taskQueue' | 'workflowDsl' | 'activityDsl'
  > | null>(null);
  const [openTemplatePickerOnEditOpen, setOpenTemplatePickerOnEditOpen] = useState(false);

  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState<TemporalWorkflowDTO | null>(null);

  const [aiDraftDrawerVisible, setAiDraftDrawerVisible] = useState(false);

  const workflowsQuery = useQuery(['temporal'], () => temporalWorkflowApi.list());
  const executionsQuery = useQuery(['executions'], () => executionApi.list());

  const deleteMutation = useMutation(temporalWorkflowApi.delete, {
    onSuccess: () => {
      message.success(t('common:success'));
      queryClient.invalidateQueries(['temporal']);
      queryClient.invalidateQueries(['temporal-options']);
    },
    onError: () => {
      message.error(t('common:error'));
    },
  });

  const createMutation = useMutation(temporalWorkflowApi.create, {
    onSuccess: () => {
      message.success(t('common:success'));
      queryClient.invalidateQueries(['temporal']);
      queryClient.invalidateQueries(['temporal-options']);
      setEditModalVisible(false);
    },
    onError: () => {
      message.error(t('common:error'));
    },
  });

  const updateMutation = useMutation(
    ({ id, data }: { id: string; data: Partial<CreateTemporalWorkflowDTO> }) =>
      temporalWorkflowApi.update(id, data),
    {
      onSuccess: () => {
        message.success(t('common:success'));
        queryClient.invalidateQueries(['temporal']);
        queryClient.invalidateQueries(['temporal-options']);
        setEditModalVisible(false);
      },
      onError: () => {
        message.error(t('common:error'));
      },
    }
  );

  const importMutation = useMutation((file: File) => temporalWorkflowApi.importBundle(file), {
    onSuccess: (result) => {
      message.success(`已导入“${result.workflow.name}”，请完成真实验证后再发布`);
      queryClient.invalidateQueries(['temporal']);
      queryClient.invalidateQueries(['temporal-options']);
    },
    onError: (error: Error) => {
      message.error(error.message || '工作流包导入失败');
    },
  });

  const filteredWorkflows = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    if (!keyword) return workflowsQuery.data || [];

    return (workflowsQuery.data || []).filter((workflow) => {
      const name = workflow.name?.toLowerCase() || '';
      const description = workflow.description?.toLowerCase() || '';
      const taskQueue = workflow.taskQueue?.toLowerCase() || '';
      return name.includes(keyword) || description.includes(keyword) || taskQueue.includes(keyword);
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
      label: '已发布',
      value: workflowsQuery.data?.filter((w) => Boolean(w.deployedAt)).length || 0,
      icon: <CheckCircleOutlined style={{ color: 'var(--success-color)' }} />,
      color: 'var(--success-color)',
    },
    {
      key: 'queues',
      label: '任务队列',
      value: new Set((workflowsQuery.data || []).map((w) => w.taskQueue).filter(Boolean)).size,
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
    setOpenTemplatePickerOnEditOpen(false);
    setEditModalVisible(true);
  };

  const handleCreateFromTemplate = () => {
    setEditingWorkflow(null);
    setDraftWorkflowDsl(null);
    setOpenTemplatePickerOnEditOpen(true);
    setEditModalVisible(true);
  };

  const handleEdit = async (workflow: TemporalWorkflowDTO) => {
    setEditingWorkflow(workflow);
    setDraftWorkflowDsl(null);
    setOpenTemplatePickerOnEditOpen(false);
    setEditModalVisible(true);
  };

  const handleViewDetail = (workflow: TemporalWorkflowDTO) => {
    setSelectedWorkflow(workflow);
    setDetailModalVisible(true);
  };

  const handleDelete = (id: string) =>
    Modal.confirm({
      title: t('common:confirmDelete'),
      content: '删除后无法恢复，是否继续？',
      onOk: () => deleteMutation.mutate(id),
    });

  const handleExport = async (workflow: TemporalWorkflowDTO) => {
    try {
      const bundle = await temporalWorkflowApi.exportBundle(workflow.id);
      const safeName = workflow.name.replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]+/g, '-');
      const url = URL.createObjectURL(bundle);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${safeName || 'temporal-workflow'}.tar.gz`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      message.success('工作流包导出成功');
    } catch (error: any) {
      message.error(error?.message || '工作流包导出失败');
    }
  };

  const handleImport: UploadProps['beforeUpload'] = (file) => {
    importMutation.mutate(file as File);
    return false;
  };

  const handleSaveWorkflow = async (
    data: CreateTemporalWorkflowDTO,
    workflowId?: string
  ): Promise<TemporalWorkflowDTO> => {
    const payload = {
      name: data.name,
      description: data.description,
      taskQueue: data.taskQueue || 'SKILL_TASK_QUEUE',
      workflowDsl: {
        ...data.workflowDsl,
        name: data.name,
      },
      activityDsl: data.activityDsl,
      generatedCode: data.generatedCode,
    };
    const persistedWorkflowId = workflowId || editingWorkflow?.id;
    return persistedWorkflowId
      ? updateMutation.mutateAsync({ id: persistedWorkflowId, data: payload })
      : createMutation.mutateAsync(payload);
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
            <Text strong style={{ color: 'var(--primary-color)', fontSize: 14 }}>
              {name}
            </Text>
            {r.sourceTemplate?.templateAssetVersion && (
              <Tag
                color="purple"
                style={{ margin: 0, fontSize: 10, lineHeight: '14px', height: 16 }}
              >
                v{r.sourceTemplate.templateAssetVersion}
              </Tag>
            )}
          </Space>
          {r.workflowDsl?.workflowClassName && (
            <Text type="secondary" style={{ fontSize: 12, fontFamily: 'monospace' }}>
              {r.workflowDsl.workflowClassName}
            </Text>
          )}
          <Text type="secondary" style={{ fontSize: 12 }}>
            {r.taskQueue}
          </Text>
        </div>
      ),
    },
    {
      title: centerTitle('描述'),
      dataIndex: 'description',
      key: 'description',
      width: 360,
      align: 'center',
      render: (desc: string) => <Tooltip title={desc || '-'}>{shorten(desc, 40)}</Tooltip>,
    },
    {
      title: centerTitle('步骤数'),
      key: 'stepCount',
      width: 60,
      align: 'center',
      render: (_, r) => {
        const summary = getLogicalStepSummary(r);
        return (
          <Tooltip
            title={`流程节点 ${summary.total}：Temporal 浏览器步骤 ${summary.browser}，控制面后处理 ${summary.postProcessing}`}
          >
            <Badge count={summary.total} showZero color="blue" />
          </Tooltip>
        );
      },
    },
    {
      title: centerTitle('工作单元数'),
      key: 'activityCount',
      width: 72,
      align: 'center',
      render: (_, r) => (
        <Badge count={r.activityDsl?.activities?.length || 0} showZero color="green" />
      ),
    },
    {
      title: centerTitle('工件版本'),
      key: 'artifactVersion',
      width: 88,
      align: 'center',
      render: (_, r) => <Tag color="purple">v{Number(r.artifactVersion || 0)}</Tag>,
    },
    {
      title: centerTitle('工件状态'),
      key: 'artifactStatus',
      width: 92,
      align: 'center',
      render: (_, r) => {
        const meta = getArtifactStatusMeta(r.validationStatus);
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: centerTitle('验证时间'),
      key: 'validatedAt',
      width: 160,
      align: 'center',
      render: (_, r) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {r.validatedAt ? new Date(r.validatedAt).toLocaleString() : '-'}
        </Text>
      ),
    },
    {
      title: centerTitle('状态'),
      key: 'status',
      width: 88,
      align: 'center',
      render: (_, r) => {
        if (!r.deployedAt) {
          return <Tag>未发布</Tag>;
        }
        return (
          <Tag color={r.isActive ? 'green' : 'orange'}>{r.isActive ? '已发布' : '已停用'}</Tag>
        );
      },
    },
    {
      title: centerTitle(t('common:actions')),
      key: 'actions',
      width: 260,
      align: 'center',
      render: (_, r) => (
        <Space size="small">
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(r)}
            title={t('common:edit')}
          />
          <Button
            type="text"
            size="small"
            icon={<CodeOutlined />}
            onClick={() => handleViewDetail(r)}
            title="查看详情"
          />
          <Button
            type="text"
            size="small"
            icon={<DownloadOutlined />}
            onClick={() => handleExport(r)}
            title="导出完整工作流包"
          />
          <Button
            type="text"
            danger
            size="small"
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(r.id)}
            title={t('common:delete')}
          />
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '8px 4px 12px' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 12,
          marginBottom: 16,
        }}
      >
        {workflowOverviewStats.map((item) => (
          <Card
            key={item.key}
            size="small"
            style={{ ...SECTION_CARD_STYLE, borderRadius: 14 }}
            styles={{ body: { padding: '10px 14px' } }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <Space size={8} align="center">
                <span style={{ display: 'inline-flex', fontSize: 14 }}>{item.icon}</span>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {item.label}
                </Text>
              </Space>
              <Text style={{ fontSize: 20, fontWeight: 700, color: item.color, lineHeight: 1 }}>
                {item.value}
              </Text>
            </div>
          </Card>
        ))}
      </div>

      <Card style={SECTION_CARD_STYLE} styles={{ body: { padding: '12px 16px' } }}>
        <ListSectionHeader
          title={
            <Space size={16}>
              <Text strong style={{ fontSize: 16 }}>
                工作流记录列表
              </Text>
              <Input
                size="small"
                placeholder="搜索工作流名称、描述或任务队列"
                prefix={<SearchOutlined />}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                style={{
                  width: 300,
                  background: 'var(--bg-secondary)',
                  borderRadius: 6,
                  fontSize: 12,
                }}
                variant="borderless"
                allowClear
              />
            </Space>
          }
          tip={
            <Tooltip title="Workflow DSL 定义确定性编排逻辑，Temporal 会 replay 这部分逻辑恢复状态；工作单元 DSL 定义 API 调用、文档渲染、浏览器操作、脚本执行等非确定性副作用操作。">
              <InfoCircleOutlined style={{ color: 'var(--text-secondary)' }} />
            </Tooltip>
          }
          extra={
            <Space wrap size={8}>
              <Text type="secondary" style={{ fontSize: 13 }}>
                共 {filteredWorkflows.length} 条
              </Text>
              <Button
                size="middle"
                icon={<ReloadOutlined />}
                onClick={() => workflowsQuery.refetch()}
                className="btn-pill"
              >
                刷新
              </Button>
              <Upload
                accept=".tar.gz,.tgz,application/gzip"
                beforeUpload={handleImport}
                showUploadList={false}
                disabled={importMutation.isLoading}
              >
                <Button
                  size="middle"
                  icon={<UploadOutlined />}
                  loading={importMutation.isLoading}
                  className="btn-pill"
                >
                  导入工作流包
                </Button>
              </Upload>
              <Button
                size="middle"
                icon={<RobotOutlined />}
                onClick={openAiDraftModal}
                className="btn-pill"
              >
                AI 创建
              </Button>
              <Button
                size="middle"
                icon={<FolderOpenOutlined />}
                onClick={handleCreateFromTemplate}
                className="btn-pill"
              >
                通过模版创建工作流
              </Button>
              <Button
                size="middle"
                icon={<PlusOutlined />}
                type="primary"
                onClick={handleCreate}
                className="btn-pill"
              >
                创建工作流
              </Button>
            </Space>
          }
        />

        <Table
          columns={columns}
          dataSource={filteredWorkflows}
          rowKey="id"
          loading={workflowsQuery.isLoading}
          size="middle"
          pagination={{ showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
        />
      </Card>

      <WorkflowDetailModal
        visible={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        selectedWorkflow={selectedWorkflow}
        SECTION_CARD_STYLE={SECTION_CARD_STYLE}
        getActivitySourceMeta={(step) => ({
          color: step?.activityRef?.startsWith('custom:') ? 'green' : 'blue',
          label: step?.activityName || 'Temporal Activity',
        })}
      />

      <AiDraftDrawer
        visible={aiDraftDrawerVisible}
        onClose={() => setAiDraftDrawerVisible(false)}
        onApplyDraft={(dsl) => {
          setAiDraftDrawerVisible(false);
          setEditingWorkflow(null);
          // 传完整 draft（含 workflowDsl + activityDsl + name/description/taskQueue），
          // 否则模态 useEffect 读 initialDraftDsl.workflowDsl 会得到 undefined 而回退默认值。
          setDraftWorkflowDsl(dsl);
          setOpenTemplatePickerOnEditOpen(false);
          setEditModalVisible(true);
        }}
      />

      <WorkflowEditModal
        visible={editModalVisible}
        onCancel={() => {
          setOpenTemplatePickerOnEditOpen(false);
          setEditModalVisible(false);
        }}
        onSave={handleSaveWorkflow}
        initialWorkflow={editingWorkflow}
        initialDraftDsl={draftWorkflowDsl}
        loading={createMutation.isLoading || updateMutation.isLoading}
        openTemplatePickerOnOpen={openTemplatePickerOnEditOpen}
        initialTemplatePickerMode="document"
      />
    </div>
  );
};

export default TemporalPage;
