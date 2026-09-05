import {
  BankOutlined,
  CloudUploadOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  FileExcelOutlined,
  FileOutlined,
  FilePdfOutlined,
  FilePptOutlined,
  FileTextOutlined,
  FileWordOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  HomeOutlined,
  PlusOutlined,
  ReloadOutlined,
  RobotOutlined,
  SearchOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Breadcrumb,
  Button,
  Card,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Progress,
  Radio,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  Upload,
  message as antdMessage,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useMemo, useState } from 'react';
import { useQuery } from 'react-query';
import {
  workspaceApi,
  type FilePreviewResponse,
  type MyWorkspacesResponse,
  type WorkspaceNode,
  type WorkspaceSummary,
} from '@/api/workspace';
import { WorkspaceAiCleanModal } from '../components/WorkspaceAiCleanModal';
import { WorkspaceDocumentPreviewModal } from '../components/WorkspaceDocumentPreviewModal';
import { WorkspaceFileDigestDrawer } from '../components/WorkspaceFileDigestDrawer';

const { Text, Title, Paragraph } = Typography;

interface BreadcrumbItem {
  id: string | null;
  name: string;
}

function formatBytes(bytesStr: string | number): string {
  const bytes = Number(bytesStr);
  if (!bytes || isNaN(bytes) || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getFileIcon(node: WorkspaceNode) {
  if (node.type === 'folder') {
    return <FolderOutlined style={{ color: '#faad14', fontSize: 18 }} />;
  }
  const ext = (node.name.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') return <FilePdfOutlined style={{ color: '#ff4d4f', fontSize: 18 }} />;
  if (['docx', 'doc'].includes(ext))
    return <FileWordOutlined style={{ color: '#1677ff', fontSize: 18 }} />;
  if (['pptx', 'ppt'].includes(ext))
    return <FilePptOutlined style={{ color: '#fa8c16', fontSize: 18 }} />;
  if (['xlsx', 'xls', 'csv'].includes(ext))
    return <FileExcelOutlined style={{ color: '#52c41a', fontSize: 18 }} />;
  if (['txt', 'md', 'json', 'yaml', 'yml'].includes(ext))
    return <FileTextOutlined style={{ color: '#13c2c2', fontSize: 18 }} />;
  return <FileOutlined style={{ color: '#8c8c8c', fontSize: 18 }} />;
}

export function WorkspaceAdminPage() {
  // 1. 获取工作空间概况（默认进入公司公共盘）
  const { data: workspacesData, refetch: refetchWorkspaces } = useQuery<MyWorkspacesResponse>(
    'admin-my-workspaces',
    () => workspaceApi.getMyWorkspaces(),
    {
      staleTime: 60000,
    }
  );

  const [activeTab, setActiveTab] = useState<'company' | 'department' | 'personal'>('company');
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([{ id: null, name: '根目录' }]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchMode, setSearchMode] = useState<'name' | 'content'>('name');

  // 选中的文件行（支持批量操作）
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [selectedNodes, setSelectedNodes] = useState<WorkspaceNode[]>([]);

  // 弹窗与抽屉状态
  const [previewNode, setPreviewNode] = useState<WorkspaceNode | null>(null);
  const [previewData, setPreviewData] = useState<FilePreviewResponse | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  const [digestDrawerNode, setDigestDrawerNode] = useState<WorkspaceNode | null>(null);

  const [aiCleanNodes, setAiCleanNodes] = useState<WorkspaceNode[]>([]);
  const [isAiCleanModalOpen, setIsAiCleanModalOpen] = useState(false);

  const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  const currentFolderId = breadcrumbs[breadcrumbs.length - 1].id;

  const currentWorkspace: WorkspaceSummary | null = useMemo(() => {
    if (!workspacesData) return null;
    if (activeTab === 'company') return workspacesData.company;
    if (activeTab === 'department') return workspacesData.department;
    return workspacesData.personal;
  }, [workspacesData, activeTab]);

  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab as 'company' | 'department' | 'personal');
    setBreadcrumbs([{ id: null, name: '根目录' }]);
    setSearchKeyword('');
    setSelectedRowKeys([]);
    setSelectedNodes([]);
  }, []);

  // 2. 加载当前目录下节点
  const {
    data: nodesData = [],
    isLoading: isNodesLoading,
    refetch: refetchNodes,
  } = useQuery(
    ['admin-workspace-nodes', currentWorkspace?.id, currentFolderId],
    () => {
      if (!currentWorkspace?.id) return Promise.resolve([]);
      return workspaceApi.getNodes(currentWorkspace.id, currentFolderId);
    },
    {
      enabled: Boolean(currentWorkspace?.id) && searchMode === 'name',
    }
  );

  // 3. 全文检索 Query
  const { data: contentSearchResults = [], isLoading: isContentSearching } = useQuery(
    ['admin-workspace-search-content', currentWorkspace?.id, searchKeyword],
    () => {
      if (!searchKeyword.trim() || searchKeyword.trim().length < 2) return Promise.resolve([]);
      return workspaceApi.searchContent(searchKeyword.trim(), currentWorkspace?.id);
    },
    {
      enabled: searchMode === 'content' && searchKeyword.trim().length >= 2,
    }
  );

  // 过滤展示节点
  const displayedNodes: WorkspaceNode[] = useMemo(() => {
    if (searchMode === 'content') {
      return contentSearchResults;
    }
    if (!searchKeyword.trim()) return nodesData;
    const lower = searchKeyword.toLowerCase();
    return nodesData.filter((n) => n.name.toLowerCase().includes(lower));
  }, [searchMode, searchKeyword, nodesData, contentSearchResults]);

  // 打开文本预览
  const handleOpenPreview = useCallback(
    async (node: WorkspaceNode) => {
      setPreviewNode(node);
      setIsPreviewOpen(true);
      setIsPreviewLoading(true);
      try {
        const preview = await workspaceApi.previewFileContent(node.workspaceId, node.id);
        setPreviewData(preview);
      } catch (err: any) {
        antdMessage.error(err.message || '获取文档预览失败');
      } finally {
        setIsPreviewLoading(false);
      }
    },
    []
  );

  // 下载文件
  const handleDownload = useCallback(async (node: WorkspaceNode) => {
    try {
      await workspaceApi.downloadFile(node.workspaceId, node.id, node.name);
    } catch (err: any) {
      antdMessage.error(err.message || '下载失败');
    }
  }, []);

  // 删除节点
  const handleDeleteNode = useCallback(
    async (node: WorkspaceNode) => {
      try {
        await workspaceApi.deleteNode(node.workspaceId, node.id);
        antdMessage.success(`已删除“${node.name}”`);
        void refetchNodes();
        void refetchWorkspaces();
      } catch (err: any) {
        antdMessage.error(err.message || '删除失败');
      }
    },
    [refetchNodes, refetchWorkspaces]
  );

  // 创建文件夹
  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !currentWorkspace) return;
    setIsCreatingFolder(true);
    try {
      await workspaceApi.createFolder(currentWorkspace.id, newFolderName.trim(), currentFolderId);
      antdMessage.success(`文件夹“${newFolderName}”创建成功`);
      setNewFolderName('');
      setIsNewFolderOpen(false);
      void refetchNodes();
    } catch (err: any) {
      antdMessage.error(err.message || '创建文件夹失败');
    } finally {
      setIsCreatingFolder(false);
    }
  };

  // 上传文件处理
  const handleUploadFile = async (file: File) => {
    if (!currentWorkspace) return;
    try {
      await workspaceApi.uploadFile(currentWorkspace.id, file, currentFolderId);
      antdMessage.success(`《${file.name}》上传成功，系统正在后台构建索引与卡片`);
      void refetchNodes();
      void refetchWorkspaces();
    } catch (err: any) {
      antdMessage.error(err.message || '文件上传失败');
    }
  };

  // 表格列定义
  const columns: ColumnsType<WorkspaceNode> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {getFileIcon(record)}
          {record.type === 'folder' ? (
            <Button
              type="link"
              onClick={() =>
                setBreadcrumbs((prev) => [...prev, { id: record.id, name: record.name }])
              }
              style={{ padding: 0, fontWeight: 500 }}
            >
              {name}
            </Button>
          ) : (
            <Button
              type="text"
              onClick={() => handleOpenPreview(record)}
              style={{
                padding: 0,
                textAlign: 'left',
                maxWidth: 280,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {name}
            </Button>
          )}
        </div>
      ),
    },
    {
      title: 'AI 治理 / 结构化摘要',
      key: 'digest',
      render: (_, record) => {
        if (record.type === 'folder') return <Text type="secondary">-</Text>;
        const d = record.digest;
        if (!d) {
          return (
            <Tag color="default" style={{ fontSize: 12 }}>
              未生成卡片
            </Tag>
          );
        }
        return (
          <Space size="small" direction="vertical" align="start">
            <Space direction="horizontal" size={4}>
              {d.cleanedByAi ? (
                <Tag color="success" icon={<RobotOutlined />}>
                  AI 深度清洗
                </Tag>
              ) : (
                <Tag color="cyan">规则摘要</Tag>
              )}
              {d.extractedData && <Tag color="purple">已抽取特定数据</Tag>}
            </Space>
            <Text
              type="secondary"
              style={{
                fontSize: 12,
                maxWidth: 320,
                display: '-webkit-box',
                WebkitLineClamp: 1,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {d.summary}
            </Text>
          </Space>
        );
      },
    },
    {
      title: '大小',
      dataIndex: 'fileSize',
      key: 'fileSize',
      width: 110,
      render: (size: string, record) =>
        record.type === 'folder' ? <Text type="secondary">-</Text> : formatBytes(size),
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 170,
      render: (val: string) => (val ? new Date(val).toLocaleString() : '-'),
    },
    {
      title: '操作',
      key: 'action',
      width: 260,
      render: (_, record) => (
        <Space size="small">
          {record.type === 'file' && (
            <>
              <Tooltip title="快速预览正文">
                <Button
                  size="small"
                  icon={<EyeOutlined />}
                  onClick={() => handleOpenPreview(record)}
                />
              </Tooltip>
              <Tooltip title="结构化卡片与详情">
                <Button
                  size="small"
                  icon={<FileTextOutlined />}
                  onClick={() => setDigestDrawerNode(record)}
                />
              </Tooltip>
              <Tooltip title="手动调用 AI 深度清洗与提炼">
                <Button
                  size="small"
                  type="primary"
                  ghost
                  icon={<RobotOutlined />}
                  onClick={() => {
                    setAiCleanNodes([record]);
                    setIsAiCleanModalOpen(true);
                  }}
                >
                  AI 清洗
                </Button>
              </Tooltip>
              <Tooltip title="下载文件">
                <Button
                  size="small"
                  icon={<DownloadOutlined />}
                  onClick={() => handleDownload(record)}
                />
              </Tooltip>
            </>
          )}
          <Popconfirm
            title={`确定删除${record.type === 'folder' ? '文件夹及其内容' : '该文件'}吗？`}
            onConfirm={() => handleDeleteNode(record)}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // 空间配额计算
  const quotaPercent = useMemo(() => {
    if (!currentWorkspace) return 0;
    const used = Number(currentWorkspace.usedBytes || 0);
    const quota = Number(currentWorkspace.quotaBytes || 1);
    return Math.min(100, Math.round((used / quota) * 100));
  }, [currentWorkspace]);

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 顶部标题与介绍 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <Title level={4} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <FolderOpenOutlined style={{ color: '#1677ff' }} />
            企业知识空间管理
          </Title>
          <Paragraph type="secondary" style={{ margin: '6px 0 0 0', maxWidth: 760, fontSize: 13 }}>
            企业级统一文档中心：管理员可集中维护公司制度、规程和专业知识资产，并可手动调用大模型对非结构化文档进行深度去噪、关键业务数据结构化萃取及重新清洗。
          </Paragraph>
        </div>

        {/* 空间用量看板 */}
        {currentWorkspace && (
          <Card
            size="small"
            style={{ width: 280, background: '#fafafa', border: '1px solid #f0f0f0' }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 12,
                marginBottom: 4,
              }}
            >
              <Text strong>{currentWorkspace.name}</Text>
              <Text type="secondary">
                {formatBytes(currentWorkspace.usedBytes)} / {formatBytes(currentWorkspace.quotaBytes)}
              </Text>
            </div>
            <Progress
              percent={quotaPercent}
              size="small"
              status={quotaPercent > 90 ? 'exception' : 'normal'}
            />
          </Card>
        )}
      </div>

      {/* 空间 Tabs 切换 */}
      <Card bodyStyle={{ padding: '12px 20px' }}>
        <Tabs
          activeKey={activeTab}
          onChange={handleTabChange}
          items={[
            {
              key: 'company',
              label: (
                <span style={{ fontWeight: 600 }}>
                  <BankOutlined /> 公司公共盘 (公司级制度/规程)
                </span>
              ),
            },
            {
              key: 'department',
              label: (
                <span>
                  <TeamOutlined /> 部门共享盘
                </span>
              ),
            },
            {
              key: 'personal',
              label: (
                <span>
                  <UserOutlined /> 用户个人盘
                </span>
              ),
            },
          ]}
        />

        {/* 目录面包屑导航与操作栏 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
            marginTop: 8,
          }}
        >
          <Breadcrumb
            items={breadcrumbs.map((b, idx) => ({
              title: (
                <span
                  style={{
                    cursor: idx < breadcrumbs.length - 1 ? 'pointer' : 'default',
                    color: idx === breadcrumbs.length - 1 ? '#262626' : '#1677ff',
                    fontWeight: idx === breadcrumbs.length - 1 ? 600 : 400,
                  }}
                  onClick={() => {
                    if (idx < breadcrumbs.length - 1) {
                      setBreadcrumbs(breadcrumbs.slice(0, idx + 1));
                    }
                  }}
                >
                  {idx === 0 ? <HomeOutlined style={{ marginRight: 4 }} /> : null}
                  {b.name}
                </span>
              ),
            }))}
          />

          <Space size="middle" wrap>
            {/* 搜索模式切换 */}
            <Radio.Group
              size="small"
              value={searchMode}
              onChange={(e) => setSearchMode(e.target.value)}
              optionType="button"
              buttonStyle="solid"
            >
              <Radio.Button value="name">按文件名</Radio.Button>
              <Radio.Button value="content">全文检索 (Grep)</Radio.Button>
            </Radio.Group>

            <Input
              placeholder={searchMode === 'name' ? '过滤当前文件...' : '全文搜索文档内容...'}
              prefix={<SearchOutlined />}
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              allowClear
              style={{ width: 220 }}
            />

            {/* 批量 AI 清洗按钮 */}
            {selectedNodes.length > 0 && (
              <Button
                type="primary"
                icon={<RobotOutlined />}
                onClick={() => {
                  setAiCleanNodes(selectedNodes.filter((n) => n.type === 'file'));
                  setIsAiCleanModalOpen(true);
                }}
              >
                批量 AI 清洗 ({selectedNodes.filter((n) => n.type === 'file').length})
              </Button>
            )}

            <Button icon={<PlusOutlined />} onClick={() => setIsNewFolderOpen(true)}>
              新建目录
            </Button>

            <Upload
              showUploadList={false}
              beforeUpload={(file) => {
                void handleUploadFile(file);
                return false;
              }}
            >
              <Button type="primary" icon={<CloudUploadOutlined />}>
                上传文档
              </Button>
            </Upload>

            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                void refetchNodes();
                void refetchWorkspaces();
              }}
            />
          </Space>
        </div>

        {/* 提示条 */}
        {activeTab === 'company' && (
          <Alert
            type="info"
            showIcon
            message="公司公共盘中的文档全员默认只读；所有系统 Agent 与工作流均可检索引用此处知识。仅管理员具有上传、删除与调用 AI 深度重清洗的权限。"
            style={{ margin: '14px 0 6px 0' }}
          />
        )}

        {/* 文件列表表格 */}
        <Table
          rowKey="id"
          loading={isNodesLoading || isContentSearching}
          dataSource={displayedNodes}
          columns={columns}
          rowSelection={{
            selectedRowKeys,
            onChange: (keys, rows) => {
              setSelectedRowKeys(keys);
              setSelectedNodes(rows);
            },
            getCheckboxProps: (record) => ({
              disabled: record.type === 'folder',
            }),
          }}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          style={{ marginTop: 12 }}
          locale={{
            emptyText: (
              <Empty
                description={
                  <span>
                    暂无文件，点击上方
                    <Text strong> 上传文档 </Text>
                    添加公司级知识资产
                  </span>
                }
              />
            ),
          }}
        />
      </Card>

      {/* 新建文件夹 Modal */}
      <Modal
        title="新建目录"
        open={isNewFolderOpen}
        onOk={handleCreateFolder}
        onCancel={() => {
          setIsNewFolderOpen(false);
          setNewFolderName('');
        }}
        confirmLoading={isCreatingFolder}
        okText="创建"
        cancelText="取消"
        destroyOnClose
      >
        <div style={{ marginTop: 16 }}>
          <Input
            placeholder="请输入目录名称，如“财务规章”、“运维白皮书”"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onPressEnter={handleCreateFolder}
            autoFocus
          />
        </div>
      </Modal>

      {/* 文档纯文本/代码预览 Modal */}
      <WorkspaceDocumentPreviewModal
        open={isPreviewOpen}
        node={previewNode}
        previewData={previewData}
        loading={isPreviewLoading}
        onClose={() => {
          setIsPreviewOpen(false);
          setPreviewNode(null);
          setPreviewData(null);
        }}
        onDownload={handleDownload}
      />

      {/* 结构化摘要卡片 Drawer */}
      <WorkspaceFileDigestDrawer
        open={Boolean(digestDrawerNode)}
        node={digestDrawerNode}
        onClose={() => setDigestDrawerNode(null)}
        onOpenPreview={handleOpenPreview}
        onDownload={handleDownload}
        onDigestUpdated={(nodeId, newDigest) => {
          void refetchNodes();
          setDigestDrawerNode((prev) => (prev?.id === nodeId ? { ...prev, digest: newDigest } : prev));
        }}
      />

      {/* AI 清洗配置 Modal */}
      {currentWorkspace && (
        <WorkspaceAiCleanModal
          open={isAiCleanModalOpen}
          nodes={aiCleanNodes}
          workspaceId={currentWorkspace.id}
          onClose={() => {
            setIsAiCleanModalOpen(false);
            setAiCleanNodes([]);
          }}
          onSuccess={(newDigest) => {
            void refetchNodes();
            if (newDigest && aiCleanNodes.length === 1) {
              const updatedId = aiCleanNodes[0].id;
              setDigestDrawerNode((prev) =>
                prev?.id === updatedId ? { ...prev, digest: newDigest } : prev
              );
            }
          }}
        />
      )}
    </div>
  );
}

export default WorkspaceAdminPage;
