import React, { Component, useMemo, useState } from 'react';
import {
  Table,
  Card,
  Button,
  Input,
  Space,
  Tag,
  Typography,
  Badge,
  Popconfirm,
  message,
  Tooltip,
  Alert,
  Dropdown,
  Select,
  theme,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  ApiOutlined,
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  KeyOutlined,
  NodeIndexOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import type { ColumnsType } from 'antd/es/table';
import { orgWorkflowApi, type OrganizationWorkflowDTO } from '@/api/orgWorkflow';
import { PRESET_WORKFLOW_TEMPLATES } from '../constants/orgWorkflowPresets';
import { OrgWorkflowEditDrawer } from '../components/OrgWorkflowEditDrawer';
import { OrgWorkflowPermissionModal } from '../components/OrgWorkflowPermissionModal';

const { Text } = Typography;

// 防御性 Error Boundary，防止任何子渲染异常造成白屏
interface ErrorBoundaryProps {
  children: React.ReactNode;
}
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class OrgWorkflowErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('OrgWorkflowAdminPage ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24 }}>
          <Alert
            message="企业工作流管理界面遇到临时渲染异常"
            description={
              <div>
                <div>错误详情：{this.state.error?.message || '未知异常'}</div>
                <Button
                  type="primary"
                  size="small"
                  style={{ marginTop: 12 }}
                  onClick={() => {
                    this.setState({ hasError: false, error: null });
                    window.location.reload();
                  }}
                >
                  重新加载页面
                </Button>
              </div>
            }
            type="error"
            showIcon
          />
        </div>
      );
    }
    return this.props.children;
  }
}

const OrgWorkflowAdminContent: React.FC = () => {
  const { token } = theme.useToken();
  const queryClient = useQueryClient();
  const [searchText, setSearchText] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState<OrganizationWorkflowDTO | null>(null);
  const [initialTemplateId, setInitialTemplateId] = useState<string | null>(null);
  const [permissionModalVisible, setPermissionModalVisible] = useState(false);

  const {
    data: listData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery(['admin-org-workflows'], () => orgWorkflowApi.listAdminWorkflows(), {
    retry: 1,
  });

  const togglePublishMutation = useMutation(
    ({ id, publish }: { id: string; publish: boolean }) =>
      orgWorkflowApi.togglePublish(id, publish),
    {
      onSuccess: () => {
        message.success('工作流发布状态已更新');
        queryClient.invalidateQueries(['admin-org-workflows']);
      },
      onError: (err: any) => {
        message.error(`更新发布状态失败: ${err.message || '未知错误'}`);
      },
    }
  );

  const deleteMutation = useMutation(
    (id: string) => orgWorkflowApi.deleteWorkflow(id),
    {
      onSuccess: () => {
        message.success('工作流已删除');
        queryClient.invalidateQueries(['admin-org-workflows']);
      },
      onError: (err: any) => {
        message.error(`删除失败: ${err.message || '未知错误'}`);
      },
    }
  );

  // 防御性解构
  const workflows: OrganizationWorkflowDTO[] = Array.isArray(listData?.workflows)
    ? listData.workflows
    : [];

  const stats = listData?.stats || {
    total: workflows.length,
    publishedCount: workflows.filter((w) => w.isPublished).length,
    draftCount: workflows.filter((w) => !w.isPublished).length,
    assembledBaseCount: workflows.reduce(
      (acc, w) => acc + (Array.isArray(w.assembledWorkflows) ? w.assembledWorkflows.length : 0),
      0
    ),
  };

  const filteredWorkflows = useMemo(() => {
    return workflows.filter((w) => {
      // 文本搜索
      if (searchText.trim()) {
        const q = searchText.trim().toLowerCase();
        const matchText =
          (w.name || '').toLowerCase().includes(q) ||
          (w.description || '').toLowerCase().includes(q);
        if (!matchText) return false;
      }
      // 分类筛选
      if (categoryFilter !== 'all' && w.category !== categoryFilter) {
        return false;
      }
      // 状态筛选
      if (statusFilter === 'published' && !w.isPublished) return false;
      if (statusFilter === 'draft' && w.isPublished) return false;

      return true;
    });
  }, [workflows, searchText, categoryFilter, statusFilter]);

  const openDrawer = (wf: OrganizationWorkflowDTO) => {
    setSelectedWorkflow(wf);
    setInitialTemplateId(null);
    setDrawerVisible(true);
  };

  const columns: ColumnsType<OrganizationWorkflowDTO> = [
    {
      title: '工作流名称',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      render: (name: string, record) => (
        <Tooltip title={record.description || name} placement="topLeft">
          <Typography.Link
            strong
            style={{ fontSize: 14, color: token.colorTextHeading }}
            onClick={() => openDrawer(record)}
          >
            {name || '未命名工作流'}
          </Typography.Link>
        </Tooltip>
      ),
    },
    {
      title: '业务分类',
      dataIndex: 'category',
      key: 'category',
      width: 120,
      render: (category: string) => {
        const catMap: Record<string, { label: string; color: string }> = {
          legal: { label: '法务风控', color: 'geekblue' },
          hr: { label: '人事行政', color: 'green' },
          finance: { label: '财务资产', color: 'gold' },
          it: { label: 'IT 运维', color: 'purple' },
        };
        const cat = catMap[category || ''] || {
          label: (category || '通用').toUpperCase(),
          color: 'default',
        };
        return (
          <Tag color={cat.color} style={{ margin: 0, whiteSpace: 'nowrap' }}>
            {cat.label}
          </Tag>
        );
      },
    },
    {
      title: '流程节点',
      key: 'stagesCount',
      width: 120,
      render: (_, record) => {
        const stages = Array.isArray(record.processDefinition?.stages)
          ? record.processDefinition.stages
          : [];
        const stageNames = stages.map((s, idx) => `${idx + 1}. ${s.name}`).join(' → ');
        return (
          <Tooltip title={stageNames || '无节点定义'}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
              onClick={() => openDrawer(record)}
            >
              <NodeIndexOutlined style={{ color: '#1677ff' }} />
              <span>{stages.length} 个节点</span>
            </span>
          </Tooltip>
        );
      },
    },
    {
      title: '底层能力',
      key: 'assembledCount',
      width: 120,
      render: (_, record) => {
        const assembled = Array.isArray(record.assembledWorkflows)
          ? record.assembledWorkflows
          : [];
        if (assembled.length === 0) {
          return <span style={{ color: token.colorTextTertiary, whiteSpace: 'nowrap' }}>-</span>;
        }
        const assembledNames = assembled.map((a) => a.name).join('、');
        return (
          <Tooltip title={assembledNames}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                color: token.colorTextSecondary,
                whiteSpace: 'nowrap',
              }}
            >
              <ApiOutlined style={{ color: '#722ed1' }} />
              <span>{assembled.length} 项能力</span>
            </span>
          </Tooltip>
        );
      },
    },
    {
      title: '适用角色',
      dataIndex: 'grantedRoleIds',
      key: 'roles',
      width: 130,
      render: (roles: string[]) => {
        const roleList = Array.isArray(roles) ? roles : [];
        if (roleList.length === 0 || (roleList.includes('employee') && roleList.includes('admin'))) {
          return <span style={{ color: token.colorTextSecondary, whiteSpace: 'nowrap' }}>全员可用</span>;
        }
        return (
          <Tooltip title={`授权角色：${roleList.join(', ')}`}>
            <span style={{ color: token.colorTextSecondary, whiteSpace: 'nowrap' }}>
              指定角色 ({roleList.length})
            </span>
          </Tooltip>
        );
      },
    },
    {
      title: '状态',
      dataIndex: 'isPublished',
      key: 'status',
      width: 100,
      render: (isPublished: boolean) => (
        <span style={{ whiteSpace: 'nowrap' }}>
          {isPublished ? (
            <Badge status="success" text="已发布" />
          ) : (
            <Badge status="default" text="草稿" />
          )}
        </span>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 260,
      align: 'right',
      render: (_, record) => (
        <Space size={4} style={{ whiteSpace: 'nowrap' }}>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openDrawer(record)}
            style={{ padding: '0 4px' }}
          >
            详情与编排
          </Button>

          <Button
            type="link"
            size="small"
            icon={<KeyOutlined />}
            onClick={() => {
              setSelectedWorkflow(record);
              setPermissionModalVisible(true);
            }}
            style={{ padding: '0 4px' }}
          >
            授权
          </Button>

          {record.isPublished ? (
            <Button
              type="link"
              size="small"
              danger
              onClick={() =>
                togglePublishMutation.mutate({ id: record.id, publish: false })
              }
              style={{ padding: '0 4px' }}
            >
              下架
            </Button>
          ) : (
            <Button
              type="link"
              size="small"
              style={{ color: '#52c41a', padding: '0 4px' }}
              onClick={() =>
                togglePublishMutation.mutate({ id: record.id, publish: true })
              }
            >
              发布
            </Button>
          )}

          <Popconfirm
            title={`确定删除工作流 "${record.name}"？`}
            description="删除后无法恢复，相关业务将不再展示此流程模版。"
            onConfirm={() => deleteMutation.mutate(record.id)}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
              style={{ padding: '0 4px' }}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const templateMenuItems: MenuProps['items'] = PRESET_WORKFLOW_TEMPLATES.map((t) => ({
    key: t.id,
    icon: <ThunderboltOutlined style={{ color: t.category === 'legal' ? '#2f54eb' : '#fa8c16' }} />,
    label: (
      <div style={{ padding: '2px 0' }}>
        <Space size={6}>
          <Tag
            color={
              t.category === 'legal'
                ? 'geekblue'
                : t.category === 'hr'
                ? 'green'
                : 'orange'
            }
            style={{ margin: 0, fontSize: 10 }}
          >
            {t.categoryName}
          </Tag>
          <strong>{t.name}</strong>
        </Space>
        <div
          style={{
            fontSize: 11,
            color: token.colorTextSecondary,
            maxWidth: 320,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            marginTop: 2,
          }}
        >
          {t.description}
        </div>
      </div>
    ),
    onClick: () => {
      setSelectedWorkflow(null);
      setInitialTemplateId(t.id);
      setDrawerVisible(true);
    },
  }));

  return (
    <div style={{ padding: '0 0 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 错误提示 */}
      {isError && (
        <Alert
          message="无法从服务获取企业工作流数据"
          description={String((error as any)?.message || '网络连接或平台服务响应异常')}
          type="warning"
          showIcon
          action={
            <Button size="small" onClick={() => refetch()}>
              重试
            </Button>
          }
        />
      )}

      {/* 紧凑型页头与工具栏：数据统计与全局操作一体化 */}
      <Card size="small" style={{ borderRadius: 8 }} bodyStyle={{ padding: '12px 16px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          {/* 左侧：标题与统计徽章 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 16, fontWeight: 600, color: token.colorTextHeading }}>
              企业工作流管理
            </span>
            <Space size={6}>
              <Tag style={{ borderRadius: 12, padding: '1px 8px', fontSize: 12, margin: 0 }}>
                全部 <strong>{stats.total}</strong>
              </Tag>
              <Tag color="success" style={{ borderRadius: 12, padding: '1px 8px', fontSize: 12, margin: 0 }}>
                已发布 <strong>{stats.publishedCount}</strong>
              </Tag>
              <Tag color="warning" style={{ borderRadius: 12, padding: '1px 8px', fontSize: 12, margin: 0 }}>
                草稿 <strong>{stats.draftCount}</strong>
              </Tag>
            </Space>
          </div>

          {/* 右侧：全局操作按钮 */}
          <Space size={8}>
            <Button icon={<ReloadOutlined />} onClick={() => refetch()}>
              刷新
            </Button>
            <Dropdown menu={{ items: templateMenuItems }} placement="bottomRight">
              <Button icon={<ThunderboltOutlined style={{ color: '#fa8c16' }} />}>
                从模版新建 <DownOutlined style={{ fontSize: 10 }} />
              </Button>
            </Dropdown>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setSelectedWorkflow(null);
                setInitialTemplateId('legal.nda.generation_and_review_flow');
                setDrawerVisible(true);
              }}
            >
              新建工作流
            </Button>
          </Space>
        </div>

        {/* 搜索与多维度筛选栏 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginTop: 12,
            paddingTop: 12,
            borderTop: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <Input
            prefix={<SearchOutlined style={{ color: token.colorTextTertiary }} />}
            placeholder="按名称或说明检索..."
            style={{ width: 260 }}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
          />

          <Select
            value={categoryFilter}
            onChange={setCategoryFilter}
            style={{ width: 130 }}
            options={[
              { label: '全部分类', value: 'all' },
              { label: '法务风控', value: 'legal' },
              { label: '人事行政', value: 'hr' },
              { label: '财务资产', value: 'finance' },
              { label: 'IT 运维', value: 'it' },
            ]}
          />

          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 120 }}
            options={[
              { label: '全部状态', value: 'all' },
              { label: '已发布', value: 'published' },
              { label: '草稿态', value: 'draft' },
            ]}
          />

          <div style={{ flex: 1 }} />
          <Text type="secondary" style={{ fontSize: 12 }}>
            共 {filteredWorkflows.length} 条工作流
          </Text>
        </div>
      </Card>

      {/* 主工作流表格：清爽无冗余，严格单行对齐，去除多余展开项 */}
      <Card size="small" style={{ borderRadius: 8 }} bodyStyle={{ padding: 0 }}>
        <Table
          columns={columns}
          dataSource={filteredWorkflows}
          rowKey="id"
          loading={isLoading}
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t) => `共 ${t} 个工作流` }}
        />
      </Card>

      {/* 完整设计与编排抽屉：包含唯一代号、版本号、详细描述、各阶段流转定义与底层能力组装 */}
      <OrgWorkflowEditDrawer
        visible={drawerVisible}
        workflow={selectedWorkflow}
        initialTemplateId={initialTemplateId}
        onClose={() => {
          setDrawerVisible(false);
          setSelectedWorkflow(null);
          setInitialTemplateId(null);
        }}
        onSuccess={() => refetch()}
      />

      {/* 权限设置弹窗 */}
      <OrgWorkflowPermissionModal
        visible={permissionModalVisible}
        workflow={selectedWorkflow}
        onClose={() => {
          setPermissionModalVisible(false);
          setSelectedWorkflow(null);
        }}
        onSuccess={() => refetch()}
      />
    </div>
  );
};

export const OrgWorkflowAdminPage: React.FC = () => (
  <OrgWorkflowErrorBoundary>
    <OrgWorkflowAdminContent />
  </OrgWorkflowErrorBoundary>
);

export default OrgWorkflowAdminPage;
