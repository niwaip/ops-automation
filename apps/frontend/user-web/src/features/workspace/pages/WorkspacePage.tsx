import {
  ArrowLeftOutlined,
  AuditOutlined,
  BankOutlined,
  CloudServerOutlined,
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
  SearchOutlined,
  TeamOutlined,
  UploadOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  Breadcrumb,
  Button,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Progress,
  Select,
  Table,
  Tag,
  Tooltip,
  Upload,
  message as antdMessage,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useMemo, useState } from 'react';
import { useQuery } from 'react-query';
import { useStore } from 'zustand';
import {
  workspaceApi,
  type ContentMatchSnippet,
  type FilePreviewResponse,
  type MyWorkspacesResponse,
  type WorkspaceFileDigest,
  type WorkspaceNode,
  type WorkspaceSummary,
} from '../../../api/workspace';
import { authStore } from '../../../adapters/auth/authStore';
import { FileDigestDrawer } from '../components/FileDigestDrawer';
import { DocumentPreviewModal } from '../components/DocumentPreviewModal';
import { useWorkspaceUrlFilePreview } from '../hooks/useWorkspaceUrlFilePreview';
import styles from './WorkspacePage.module.css';

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
    return <FolderOutlined className={styles['node-icon-folder']} />;
  }
  const ext = (node.name.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') return <FilePdfOutlined className={styles['node-icon-pdf']} />;
  if (['docx', 'doc'].includes(ext)) return <FileWordOutlined className={styles['node-icon-word']} />;
  if (['pptx', 'ppt'].includes(ext)) return <FilePptOutlined className={styles['node-icon-ppt']} />;
  if (['xlsx', 'xls', 'csv'].includes(ext)) return <FileExcelOutlined className={styles['node-icon-excel']} />;
  if (['txt', 'md', 'json', 'yaml', 'yml'].includes(ext)) return <FileTextOutlined className={styles['node-icon-default']} />;
  return <FileOutlined className={styles['node-icon-default']} />;
}

export function WorkspacePage() {
  const currentUser = useStore(authStore, (s) => s.user);
  const isAdmin = useMemo(() => {
    const roles = (currentUser as any)?.roles || [];
    return roles.includes('admin') || (currentUser as any)?.role === 'admin';
  }, [currentUser]);

  // 1. 获取工作空间概况
  const {
    data: workspacesData,
    isLoading: isWsLoading,
    refetch: refetchWorkspaces,
  } = useQuery<MyWorkspacesResponse>('my-workspaces', () => workspaceApi.getMyWorkspaces(), {
    staleTime: 60000,
  });

  const [activeTab, setActiveTab] = useState<'personal' | 'department' | 'company'>('personal');
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([{ id: null, name: '根目录' }]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchMode, setSearchMode] = useState<'name' | 'content'>('name');
  const [previewNode, setPreviewNode] = useState<WorkspaceNode | null>(null);
  const [previewData, setPreviewData] = useState<FilePreviewResponse | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [digestDrawerNode, setDigestDrawerNode] = useState<WorkspaceNode | null>(null);
  const currentFolderId = breadcrumbs[breadcrumbs.length - 1].id;

  useWorkspaceUrlFilePreview({
    workspacesData,
    activeTab,
    setActiveTab,
    setPreviewNode,
    setPreviewData,
    setIsPreviewOpen,
    setIsPreviewLoading,
  });

  const currentWorkspace: WorkspaceSummary | null = useMemo(() => {
    if (!workspacesData) return null;
    if (activeTab === 'personal') return workspacesData.personal;
    if (activeTab === 'company') return workspacesData.company;
    return workspacesData.department;
  }, [workspacesData, activeTab]);

  // 切换工作空间 Tab 时重置路径与搜索
  const handleTabChange = useCallback((tab: 'personal' | 'department' | 'company') => {
    setActiveTab(tab);
    setBreadcrumbs([{ id: null, name: '根目录' }]);
    setSearchKeyword('');
  }, []);

  // 2. 获取当前目录下节点列表
  const {
    data: nodesData,
    isLoading: isNodesLoading,
    refetch: refetchNodes,
  } = useQuery(
    ['workspace-nodes', currentWorkspace?.id, currentFolderId],
    () => {
      if (!currentWorkspace?.id) return Promise.resolve([]);
      return workspaceApi.getNodes(currentWorkspace.id, currentFolderId);
    },
    {
      enabled: Boolean(currentWorkspace?.id) && searchMode === 'name',
    }
  );

  const handleDigestUpdated = useCallback((nodeId: string, digest: WorkspaceFileDigest) => {
    void refetchNodes();
    setDigestDrawerNode((prev) => (prev?.id === nodeId ? { ...prev, digest } : prev));
  }, [refetchNodes]);

  // 全文内容检索 Query（当 searchMode 为 content 且关键字长度 >= 2 时自动触发）
  const {
    data: contentSearchResults,
    isLoading: isContentSearching,
  } = useQuery(
    ['workspace-content-search-page', currentWorkspace?.id, searchKeyword],
    () => {
      if (!searchKeyword.trim() || searchKeyword.trim().length < 2) return Promise.resolve([]);
      return workspaceApi.searchContent(searchKeyword.trim(), currentWorkspace?.id);
    },
    {
      enabled: searchMode === 'content' && Boolean(searchKeyword.trim().length >= 2),
      staleTime: 5000,
    }
  );

  // 过滤展示节点（根据搜索框关键词或全文匹配）
  const displayNodes = useMemo(() => {
    if (searchMode === 'content') {
      if (searchKeyword.trim().length < 2) return [];
      return (contentSearchResults || []) as (WorkspaceNode & { matches?: ContentMatchSnippet[] })[];
    }
    const list = nodesData || [];
    if (!searchKeyword.trim()) return list;
    const q = searchKeyword.trim().toLowerCase();
    return list.filter((item) => item.name.toLowerCase().includes(q));
  }, [nodesData, searchKeyword, searchMode, contentSearchResults]);

  // 快速预览文件
  const handlePreviewNode = useCallback(async (node: WorkspaceNode) => {
    setPreviewNode(node);
    setIsPreviewOpen(true);
    setIsPreviewLoading(true);
    try {
      const res = await workspaceApi.previewFileContent(node.workspaceId, node.id);
      setPreviewData(res);
    } catch (err: any) {
      void antdMessage.error(err.message || '加载预览失败');
      setPreviewData(null);
    } finally {
      setIsPreviewLoading(false);
    }
  }, []);

  // 3. 新建文件夹弹窗
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  const handleCreateFolder = async () => {
    if (!currentWorkspace?.id) return;
    const trimmed = newFolderName.trim();
    if (!trimmed) {
      void antdMessage.warning('请输入文件夹名称');
      return;
    }
    setIsCreatingFolder(true);
    try {
      await workspaceApi.createFolder(currentWorkspace.id, trimmed, currentFolderId);
      void antdMessage.success(`文件夹 "${trimmed}" 创建成功`);
      setIsFolderModalOpen(false);
      setNewFolderName('');
      void refetchNodes();
    } catch (err: unknown) {
      void antdMessage.error(err instanceof Error ? err.message : '创建失败');
    } finally {
      setIsCreatingFolder(false);
    }
  };

  // 4. 上传文件
  const [isUploading, setIsUploading] = useState(false);
  const handleUploadFile = async (file: File) => {
    if (!currentWorkspace?.id) return false;
    setIsUploading(true);
    void antdMessage.loading({ content: `正在上传 "${file.name}"...`, key: 'uploading-file' });
    try {
      await workspaceApi.uploadFile(currentWorkspace.id, file, currentFolderId);
      void antdMessage.success({ content: `文件 "${file.name}" 上传成功`, key: 'uploading-file' });
      void refetchNodes();
      void refetchWorkspaces();
    } catch (err: unknown) {
      void antdMessage.error({ content: err instanceof Error ? err.message : '上传失败', key: 'uploading-file' });
    } finally {
      setIsUploading(false);
    }
    return false;
  };

  // 5. 删除文件/文件夹
  const handleDeleteNode = async (node: WorkspaceNode) => {
    if (!currentWorkspace?.id) return;
    try {
      await workspaceApi.deleteNode(currentWorkspace.id, node.id);
      void antdMessage.success(`已删除 "${node.name}"`);
    } catch (err: unknown) {
      void antdMessage.error(err instanceof Error ? err.message : '删除失败');
    } finally {
      void refetchNodes();
      void refetchWorkspaces();
    }
  };

  // 6. 下载文件
  const handleDownloadNode = async (node: WorkspaceNode) => {
    if (!currentWorkspace?.id) return;
    try {
      void antdMessage.loading({ content: `正在准备下载 "${node.name}"...`, key: 'downloading' });
      await workspaceApi.downloadFile(currentWorkspace.id, node.id, node.name);
      void antdMessage.success({ content: `已开始下载 "${node.name}"`, key: 'downloading' });
    } catch (err: unknown) {
      void antdMessage.error({ content: err instanceof Error ? err.message : '下载失败', key: 'downloading' });
    }
  };

  // 7. 进入文件夹
  const handleEnterFolder = (folder: WorkspaceNode) => {
    setBreadcrumbs((prev) => [...prev, { id: folder.id, name: folder.name }]);
    setSearchKeyword('');
  };

  // 8. 点击面包屑回退
  const handleBreadcrumbClick = (index: number) => {
    setBreadcrumbs((prev) => prev.slice(0, index + 1));
    setSearchKeyword('');
  };

  // 9. 返回上一层
  const handleGoBack = () => {
    if (breadcrumbs.length > 1) {
      setBreadcrumbs((prev) => prev.slice(0, prev.length - 1));
      setSearchKeyword('');
    }
  };

  // 是否只读（公司公共盘且非管理员为只读）
  const isReadOnly = activeTab === 'company' && !isAdmin;

  // 表格列定义
  const columns: ColumnsType<WorkspaceNode> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record) => {
        const matches = (record as any).matches as ContentMatchSnippet[] | undefined;
        const keyTopics = record.digest?.keyTopics;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span
              className={styles['node-item-name']}
              onClick={() => {
                if (record.type === 'folder') {
                  handleEnterFolder(record);
                } else {
                  void handlePreviewNode(record);
                }
              }}
            >
              {getFileIcon(record)}
              <span style={{ fontWeight: record.type === 'folder' ? 600 : 400 }}>{name}</span>
            </span>
            {keyTopics && keyTopics.length > 0 && (
              <div style={{ display: 'flex', gap: 4, paddingLeft: 22, marginTop: 1, flexWrap: 'wrap' }}>
                {keyTopics.slice(0, 3).map((topic, i) => (
                  <Tag
                    key={i}
                    color="blue"
                    style={{
                      fontSize: 10,
                      lineHeight: '16px',
                      padding: '0 4px',
                      borderRadius: 4,
                      margin: 0,
                    }}
                  >
                    #{topic}
                  </Tag>
                ))}
              </div>
            )}
            {matches && matches.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--primary-color, #1677ff)', paddingLeft: 22, marginTop: 2 }}>
                <Tag color="cyan" style={{ marginRight: 6, fontSize: 10 }}>全文命中</Tag>
                <span>第 {matches[0].line} 行: {matches[0].snippet}</span>
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: '大小',
      dataIndex: 'fileSize',
      key: 'fileSize',
      width: 140,
      render: (size: string, record) => (record.type === 'folder' ? '-' : formatBytes(size)),
    },
    {
      title: '类型',
      key: 'type',
      width: 130,
      render: (_, record) => {
        if (record.type === 'folder') {
          return <Tag color="default">文件夹</Tag>;
        }
        const ext = (record.name.split('.').pop() || '文件').toUpperCase();
        return <Tag color="processing">{ext}</Tag>;
      },
    },
    {
      title: '修改时间',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 180,
      render: (val: string) => (val ? new Date(val).toLocaleString() : '-'),
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_, record) => (
        <div style={{ display: 'flex', gap: 6 }}>
          {record.type === 'folder' ? (
            <Button
              type="link"
              size="small"
              onClick={() => handleEnterFolder(record)}
            >
              打开
            </Button>
          ) : (
            <>
              <Tooltip title="文档摘要卡片">
                <Button
                  type="text"
                  size="small"
                  icon={
                    <AuditOutlined
                      style={{ color: record.digest ? 'var(--primary-color, #1677ff)' : undefined }}
                    />
                  }
                  onClick={() => setDigestDrawerNode(record)}
                />
              </Tooltip>
              <Tooltip title="快速预览">
                <Button
                  type="text"
                  size="small"
                  icon={<EyeOutlined />}
                  onClick={() => void handlePreviewNode(record)}
                />
              </Tooltip>
              <Tooltip title="下载">
                <Button
                  type="text"
                  size="small"
                  icon={<DownloadOutlined />}
                  onClick={() => handleDownloadNode(record)}
                />
              </Tooltip>
            </>
          )}
          {!isReadOnly && (
            <Popconfirm
              title={`确定要删除 "${record.name}" 吗？`}
              description={record.type === 'folder' ? '文件夹内的所有子文件也将被永久删除！' : undefined}
              okText="确定"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onConfirm={() => handleDeleteNode(record)}
            >
              <Tooltip title="删除">
                <Button type="text" size="small" danger icon={<DeleteOutlined />} />
              </Tooltip>
            </Popconfirm>
          )}
        </div>
      ),
    },
  ];

  const quotaPercent = useMemo(() => {
    if (!currentWorkspace) return 0;
    const used = Number(currentWorkspace.usedBytes);
    const quota = Number(currentWorkspace.quotaBytes);
    if (!quota) return 0;
    return Math.min(100, Math.round((used / quota) * 100));
  }, [currentWorkspace]);

  return (
    <div className={styles['workspace-container']}>
      {/* 左侧导航栏 */}
      <aside className={styles['workspace-sidebar']}>
        <div className={styles['workspace-sidebar-top']}>
          <div className={styles['workspace-brand']}>
            <div className={styles['workspace-brand-icon']}>
              <FolderOpenOutlined />
            </div>
            <div className={styles['workspace-brand-info']}>
              <h2>资料空间</h2>
              <p>企业知识库与协同资料盘</p>
            </div>
          </div>

          <nav className={styles['workspace-nav-list']}>
            <div
              className={`${styles['workspace-nav-item']}${activeTab === 'personal' ? ` ${styles['is-active']}` : ''}`}
              onClick={() => handleTabChange('personal')}
            >
              <div className={styles['workspace-nav-item-left']}>
                <span className={styles['workspace-nav-icon']}><UserOutlined /></span>
                <span>我的空间</span>
              </div>
              <Tag color="blue" bordered={false}>个人</Tag>
            </div>

            <div
              className={`${styles['workspace-nav-item']}${activeTab === 'department' ? ` ${styles['is-active']}` : ''}`}
              onClick={() => handleTabChange('department')}
            >
              <div className={styles['workspace-nav-item-left']}>
                <span className={styles['workspace-nav-icon']}><TeamOutlined /></span>
                <span>部门共享</span>
              </div>
              <Tag color="purple" bordered={false}>团队</Tag>
            </div>

            <div
              className={`${styles['workspace-nav-item']}${activeTab === 'company' ? ` ${styles['is-active']}` : ''}`}
              onClick={() => handleTabChange('company')}
            >
              <div className={styles['workspace-nav-item-left']}>
                <span className={styles['workspace-nav-icon']}><BankOutlined /></span>
                <span>公司公共盘</span>
              </div>
              <Tag color="orange" bordered={false}>{isAdmin ? '维护' : '只读'}</Tag>
            </div>
          </nav>
        </div>

        {/* 底部容量指示 */}
        <div className={styles['workspace-sidebar-bottom']}>
          {currentWorkspace && (
            <div className={styles['workspace-quota-widget']}>
              <div className={styles['workspace-quota-header']}>
                <span>已用容量配额</span>
                <CloudServerOutlined />
              </div>
              <Progress
                percent={quotaPercent}
                size="small"
                status={quotaPercent > 90 ? 'exception' : 'normal'}
                showInfo={false}
              />
              <div className={styles['workspace-quota-values']}>
                <span>{formatBytes(currentWorkspace.usedBytes)}</span>
                <span>{formatBytes(currentWorkspace.quotaBytes)}</span>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* 右侧主工作区 */}
      <main className={styles['workspace-main']}>
        {/* 顶部工具栏 */}
        <header className={styles['workspace-topbar']}>
          <div className={styles['workspace-breadcrumbs-area']}>
            {breadcrumbs.length > 1 && (
              <Button
                type="text"
                size="small"
                icon={<ArrowLeftOutlined />}
                onClick={handleGoBack}
                className={styles['workspace-back-btn']}
                title="返回上一层"
              />
            )}
            <Breadcrumb
              items={breadcrumbs.map((b, idx) => ({
                title: (
                  <span
                    style={{
                      cursor: idx < breadcrumbs.length - 1 ? 'pointer' : 'default',
                      fontWeight: idx === breadcrumbs.length - 1 ? 600 : 400,
                      color: idx === breadcrumbs.length - 1 ? 'var(--text-primary)' : 'var(--text-secondary)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                    onClick={() => {
                      if (idx < breadcrumbs.length - 1) {
                        handleBreadcrumbClick(idx);
                      }
                    }}
                  >
                    {idx === 0 ? <HomeOutlined /> : <FolderOutlined />}
                    {b.name}
                  </span>
                ),
              }))}
            />
          </div>

          <div className={styles['workspace-topbar-actions']}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <Select
                value={searchMode}
                onChange={(val) => {
                  setSearchMode(val);
                  setSearchKeyword('');
                }}
                style={{ width: 105 }}
                options={[
                  { value: 'name', label: '文件名' },
                  { value: 'content', label: '全文内容' },
                ]}
              />
              <Input
                prefix={<SearchOutlined style={{ color: 'var(--text-light)' }} />}
                placeholder={searchMode === 'content' ? '输入内容关键词检索...' : '搜索当前目录...'}
                allowClear
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                className={styles['workspace-search-input']}
                size="middle"
                style={{ marginLeft: -1, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
              />
            </div>

            {!isReadOnly && (
              <>
                <Button
                  icon={<PlusOutlined />}
                  onClick={() => setIsFolderModalOpen(true)}
                >
                  新建文件夹
                </Button>
                <Upload
                  beforeUpload={(file) => {
                    void handleUploadFile(file);
                    return false;
                  }}
                  showUploadList={false}
                  disabled={isUploading}
                >
                  <Button
                    type="primary"
                    icon={<UploadOutlined />}
                    loading={isUploading}
                  >
                    上传文件
                  </Button>
                </Upload>
              </>
            )}

            <Tooltip title="刷新列表">
              <Button
                icon={<ReloadOutlined />}
                onClick={() => {
                  void refetchNodes();
                  void refetchWorkspaces();
                }}
              />
            </Tooltip>
          </div>
        </header>

        {/* 内容表格区 */}
        <div className={styles['workspace-content-body']}>
          <Table<WorkspaceNode>
            className={styles['workspace-table']}
            columns={columns}
            dataSource={displayNodes}
            rowKey="id"
            loading={isWsLoading || (searchMode === 'name' ? isNodesLoading : isContentSearching)}
            pagination={{
              pageSize: 15,
              showSizeChanger: false,
              hideOnSinglePage: true,
            }}
            locale={{
              emptyText: (
                <div className={styles['workspace-empty-state']}>
                  <Empty
                    description={
                      searchKeyword
                        ? searchMode === 'content'
                          ? `未检索到正文包含 "${searchKeyword}" 的文档`
                          : `未找到与 "${searchKeyword}" 匹配的文件`
                        : isReadOnly
                        ? '公共盘当前目录暂无文件'
                        : '当前文件夹为空，点击右上角上传文件或新建文件夹'
                    }
                  />
                </div>
              ),
            }}
          />
        </div>
      </main>

      {/* 新建文件夹弹窗 */}
      <Modal
        title="新建文件夹"
        open={isFolderModalOpen}
        onOk={handleCreateFolder}
        confirmLoading={isCreatingFolder}
        onCancel={() => {
          setIsFolderModalOpen(false);
          setNewFolderName('');
        }}
        okText="创建"
        cancelText="取消"
        destroyOnClose
      >
        <div style={{ marginTop: 16 }}>
          <Input
            placeholder="请输入文件夹名称（如：项目资料、财务报表）"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onPressEnter={handleCreateFolder}
            autoFocus
            maxLength={100}
          />
        </div>
      </Modal>

      {/* 多格式富文本与原生文档预览弹窗 */}
      <DocumentPreviewModal
        open={isPreviewOpen}
        node={previewNode}
        previewData={previewData}
        loading={isPreviewLoading}
        onClose={() => {
          setIsPreviewOpen(false);
          setPreviewData(null);
        }}
        onDownload={(node) => void handleDownloadNode(node)}
      />

      {/* 文档结构化摘要卡片抽屉 */}
      <FileDigestDrawer
        open={Boolean(digestDrawerNode)}
        node={digestDrawerNode}
        onClose={() => setDigestDrawerNode(null)}
        onOpenPreview={(node) => void handlePreviewNode(node)}
        onDownload={(node) => void handleDownloadNode(node)}
        onDigestUpdated={handleDigestUpdated}
      />
    </div>
  );
}
