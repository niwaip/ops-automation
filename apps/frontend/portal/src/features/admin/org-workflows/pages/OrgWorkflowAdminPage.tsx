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
  theme,
} from 'antd';
import {
  ApartmentOutlined,
  ApiOutlined,
  DeleteOutlined,
  EditOutlined,
  KeyOutlined,
  PlusOutlined,
  ReloadOutlined,
  RightOutlined,
  SearchOutlined,
  SendOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import type { ColumnsType } from 'antd/es/table';
import { orgWorkflowApi, type OrganizationWorkflowDTO } from '@/api/orgWorkflow';
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
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState<OrganizationWorkflowDTO | null>(null);
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
    if (!searchText.trim()) return workflows;
    const q = searchText.trim().toLowerCase();
    return workflows.filter(
      (w) =>
        (w.name || '').toLowerCase().includes(q) ||
        (w.workflowId || '').toLowerCase().includes(q) ||
        (w.category || '').toLowerCase().includes(q) ||
        (w.description || '').toLowerCase().includes(q)
    );
  }, [workflows, searchText]);

  const columns: ColumnsType<OrganizationWorkflowDTO> = [
    {
      title: '工作流名称 / 唯一标识',
      key: 'name',
      render: (_, record) => (
        <div>
          <Space>
            <ApartmentOutlined style={{ color: '#1677ff', fontSize: 16 }} />
            <strong style={{ fontSize: 15 }}>{record.name || '未命名工作流'}</strong>
          </Space>
          <div style={{ fontSize: 12, color: token.colorTextSecondary, marginTop: 2 }}>
            代号：<code>{record.workflowId || '-'}</code>
          </div>
        </div>
      ),
    },
    {
      title: '分类 & 任务类型',
      key: 'category',
      width: 140,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Tag color="blue">{record.category?.toUpperCase() || 'GENERAL'}</Tag>
          <span style={{ fontSize: 12, color: token.colorTextSecondary }}>
            {record.taskType === 'approval'
              ? '审批流转'
              : record.taskType === 'assignment'
              ? '任务指派'
              : '审阅复核'}
          </span>
        </Space>
      ),
    },
    {
      title: '组装的 5173 底层普通工作流',
      key: 'assembled',
      render: (_, record) => {
        const assembled = Array.isArray(record.assembledWorkflows)
          ? record.assembledWorkflows
          : [];
        if (assembled.length === 0) {
          return <Text type="secondary">纯流程 (未组装底层流)</Text>;
        }
        return (
          <Space wrap size={4}>
            {assembled.map((item) => (
              <Tooltip
                key={item.refId}
                title={`已组装资产: ${item.refId} | 触发时机: ${
                  item.triggerEvent === 'on_submit' ? '提单时' : '审批通过时'
                }`}
              >
                <Tag color="purple" icon={<ApiOutlined />}>
                  {item.name}
                </Tag>
              </Tooltip>
            ))}
          </Space>
        );
      },
    },
    {
      title: '流程定义节点 (Stages)',
      key: 'stages',
      width: 230,
      render: (_, record) => {
        const stages = Array.isArray(record.processDefinition?.stages)
          ? record.processDefinition.stages
          : [];
        if (stages.length === 0) {
          return <Text type="secondary">无节点定义</Text>;
        }
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            {stages.map((s, idx) => (
              <React.Fragment key={s.id || idx}>
                <Tag
                  color={
                    s.type === 'approval'
                      ? 'orange'
                      : s.type === 'automation'
                      ? 'purple'
                      : s.type === 'archive'
                      ? 'green'
                      : 'blue'
                  }
                  style={{ margin: 0, fontSize: 11 }}
                >
                  {idx + 1}.{s.name}
                </Tag>
                {idx < stages.length - 1 && (
                  <RightOutlined style={{ fontSize: 9, color: '#bfbfbf' }} />
                )}
              </React.Fragment>
            ))}
          </div>
        );
      },
    },
    {
      title: '授权使用角色',
      key: 'roles',
      width: 150,
      render: (_, record) => {
        const roles = Array.isArray(record.grantedRoleIds) ? record.grantedRoleIds : [];
        return (
          <Space wrap size={2}>
            {roles.map((r) => (
              <Tag key={r} color="geekblue">
                {r}
              </Tag>
            ))}
          </Space>
        );
      },
    },
    {
      title: '发布状态',
      key: 'status',
      width: 130,
      render: (_, record) =>
        record.isPublished ? (
          <Badge status="success" text="已发布 (5174可见)" />
        ) : (
          <Badge status="default" text="草稿 (Draft)" />
        ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 220,
      render: (_, record) => (
        <Space size={4}>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              setSelectedWorkflow(record);
              setDrawerVisible(true);
            }}
          >
            组装编排
          </Button>

          <Button
            type="link"
            size="small"
            icon={<KeyOutlined />}
            onClick={() => {
              setSelectedWorkflow(record);
              setPermissionModalVisible(true);
            }}
          >
            授权
          </Button>

          {record.isPublished ? (
            <Button
              type="link"
              size="small"
              danger
              icon={<StopOutlined />}
              onClick={() =>
                togglePublishMutation.mutate({ id: record.id, publish: false })
              }
            >
              下架
            </Button>
          ) : (
            <Button
              type="link"
              size="small"
              style={{ color: '#52c41a' }}
              icon={<SendOutlined />}
              onClick={() =>
                togglePublishMutation.mutate({ id: record.id, publish: true })
              }
            >
              发布
            </Button>
          )}

          <Popconfirm
            title={`确定删除工作流 ${record.name}？`}
            onConfirm={() => deleteMutation.mutate(record.id)}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '0 0 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
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

      {/* 1. 顶部统计卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <Card size="small" style={{ borderRadius: 8 }}>
          <div style={{ fontSize: 13, color: token.colorTextSecondary }}>企业工作流总数</div>
          <div style={{ fontSize: 24, fontWeight: 'bold', marginTop: 4 }}>{stats.total}</div>
        </Card>
        <Card size="small" style={{ borderRadius: 8 }}>
          <div style={{ fontSize: 13, color: token.colorTextSecondary }}>已公开就绪 (5174 可见)</div>
          <div style={{ fontSize: 24, fontWeight: 'bold', color: '#52c41a', marginTop: 4 }}>
            {stats.publishedCount}
          </div>
        </Card>
        <Card size="small" style={{ borderRadius: 8 }}>
          <div style={{ fontSize: 13, color: token.colorTextSecondary }}>草稿设计态</div>
          <div style={{ fontSize: 24, fontWeight: 'bold', color: '#fa8c16', marginTop: 4 }}>
            {stats.draftCount}
          </div>
        </Card>
        <Card size="small" style={{ borderRadius: 8 }}>
          <div style={{ fontSize: 13, color: token.colorTextSecondary }}>已组装流程工作流</div>
          <div style={{ fontSize: 24, fontWeight: 'bold', color: '#722ed1', marginTop: 4 }}>
            {stats.assembledBaseCount}
          </div>
        </Card>
      </div>

      {/* 2. 操作与筛选工具栏 */}
      <Card size="small" style={{ borderRadius: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space>
            <Input
              prefix={<SearchOutlined />}
              placeholder="搜索工作流名称、代号或分类..."
              style={{ width: 280 }}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
            />
            <Button icon={<ReloadOutlined />} onClick={() => refetch()}>
              刷新
            </Button>
          </Space>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setSelectedWorkflow(null);
              setDrawerVisible(true);
            }}
          >
            组装与新建企业工作流
          </Button>
        </div>
      </Card>

      {/* 3. 工作流列表 Table */}
      <Card size="small" style={{ borderRadius: 8 }} bodyStyle={{ padding: 0 }}>
        <Table
          columns={columns}
          dataSource={filteredWorkflows}
          rowKey="id"
          loading={isLoading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      {/* 4. 编辑抽屉与权限弹窗 */}
      <OrgWorkflowEditDrawer
        visible={drawerVisible}
        workflow={selectedWorkflow}
        onClose={() => {
          setDrawerVisible(false);
          setSelectedWorkflow(null);
        }}
        onSuccess={() => refetch()}
      />

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
