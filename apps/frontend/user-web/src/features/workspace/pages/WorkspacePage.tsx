import {
  ArrowLeftOutlined,
  AuditOutlined,
  BankOutlined,
  ClearOutlined,
  CloudServerOutlined,
  DeleteOutlined,
  DesktopOutlined,
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

interface SystemFolderMeta {
  isSystem: boolean;
  key: 'tasks' | 'saved' | 'temp';
  displayName: string;
  categoryLabel: string;
  tagColor: string;
  iconColor: string;
}

function getSystemFolderMeta(node: WorkspaceNode, isRoot: boolean): SystemFolderMeta | null {
  if (node.type !== 'folder' || !isRoot) return null;
  const lower = node.name.toLowerCase();
  if (lower.includes('tasks') || lower.includes('工作任务成果')) {
    return {
      isSystem: true,
      key: 'tasks',
      displayName: '工作模式成果',
      categoryLabel: '工作模式',
      tagColor: 'blue',
      iconColor: '#3b82f6',
    };
  }
  if (lower.includes('saved') || lower.includes('沙盒保存内容')) {
    return {
      isSystem: true,
      key: 'saved',
      displayName: '个人模式成果',
      categoryLabel: '个人模式',
      tagColor: 'green',
      iconColor: '#10b981',
    };
  }
  if (lower.includes('temp') || lower.includes('临时工作区')) {
    return {
      isSystem: true,
      key: 'temp',
      displayName: '临时文件',
      categoryLabel: '临时文件',
      tagColor: 'gold',
      iconColor: '#f59e0b',
    };
  }
  return null;
}

function getNodeDisplayName(node: WorkspaceNode, isRoot: boolean): string {
  const meta = getSystemFolderMeta(node, isRoot);
  return meta ? meta.displayName : node.name;
}

function getFileIcon(node: WorkspaceNode, sysMeta?: SystemFolderMeta | null) {
  if (node.type === 'folder') {
    if (sysMeta) {
      const bgMap = {
        tasks: 'rgba(59, 130, 246, 0.16)',
        saved: 'rgba(16, 185, 129, 0.16)',
        temp: 'rgba(245, 158, 11, 0.16)',
      };
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            borderRadius: 8,
            background: bgMap[sysMeta.key] || 'rgba(59, 130, 246, 0.16)',
            color: sysMeta.iconColor,
            fontSize: 17,
            flexShrink: 0,
          }}
        >
          <FolderOutlined />
        </span>
      );
    }
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 30,
          height: 30,
          borderRadius: 6,
          background: 'rgba(250, 173, 20, 0.12)',
          color: '#faad14',
          fontSize: 16,
          flexShrink: 0,
        }}
      >
        <FolderOutlined />
      </span>
    );
  }
  const ext = (node.name.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') return <FilePdfOutlined className={styles['node-icon-pdf']} />;
  if (['docx', 'doc'].includes(ext)) return <FileWordOutlined className={styles['node-icon-word']} />;
  if (['pptx', 'ppt'].includes(ext)) return <FilePptOutlined className={styles['node-icon-ppt']} />;
  if (['xlsx', 'xls', 'csv'].includes(ext)) return <FileExcelOutlined className={styles['node-icon-excel']} />;
  if (['html', 'htm'].includes(ext)) return <DesktopOutlined style={{ color: '#fa8c16' }} className={styles['node-icon-default']} />;
  if (['txt', 'md', 'json', 'yaml', 'yml'].includes(ext)) return <FileTextOutlined className={styles['node-icon-default']} />;
  return <FileOutlined className={styles['node-icon-default']} />;
}

export function WorkspacePage() {
  const currentUser = useStore(authStore, (s) => s.user);
  const isAdmin = useMemo(() => {
    const roles = (currentUser as any)?.roles || [];
    return roles.includes('admin') || (currentUser as any)?.role === 'admin';
  }, [currentUser]);

  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);

  // 1. 获取工作空间概况
  const {
    data: workspacesData,
    isLoading: isWsLoading,
    refetch: refetchWorkspaces,
  } = useQuery<MyWorkspacesResponse>(
    ['my-workspaces', selectedDeptId],
    () => workspaceApi.getMyWorkspaces({ departmentId: selectedDeptId || undefined }),
    {
      staleTime: 60000,
    }
  );

  const [activeTab, setActiveTab] = useState<'personal' | 'department' | 'company' | 'process'>('personal');
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([{ id: null, name: '根目录' }]);
  const [sortField, setSortField] = useState<string>('updatedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchMode, setSearchMode] = useState<'name' | 'content'>('name');
  const [previewNode, setPreviewNode] = useState<WorkspaceNode | null>(null);
  const [previewData, setPreviewData] = useState<FilePreviewResponse | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [digestDrawerNode, setDigestDrawerNode] = useState<WorkspaceNode | null>(null);
  const [isCleaningTemp, setIsCleaningTemp] = useState(false);
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
    if (activeTab === 'process') return workspacesData.process || null;
    return workspacesData.department;
  }, [workspacesData, activeTab]);

  // 切换工作空间 Tab 时重置路径与搜索
  const handleTabChange = useCallback((tab: 'personal' | 'department' | 'company' | 'process') => {
    setActiveTab(tab);
    setBreadcrumbs([{ id: null, name: '根目录' }]);
    setSearchKeyword('');
  }, []);

  // 2. 获取当前目录下节点列表（支持按修改时间倒序等排序）
  const {
    data: nodesData,
    isLoading: isNodesLoading,
    refetch: refetchNodes,
  } = useQuery(
    ['workspace-nodes', currentWorkspace?.id, currentFolderId, sortField, sortOrder],
    () => {
      if (!currentWorkspace?.id) return Promise.resolve([]);
      return workspaceApi.getNodes(currentWorkspace.id, currentFolderId, {
        sortBy: sortField,
        order: sortOrder,
      });
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

  // 过滤展示节点（根据搜索框关键词或全文匹配，并保证文件夹置顶与用户指定排序，默认时间倒序）
  const displayNodes = useMemo(() => {
    let list: (WorkspaceNode & { matches?: ContentMatchSnippet[] })[] = [];
    if (searchMode === 'content') {
      if (searchKeyword.trim().length < 2) return [];
      list = [...((contentSearchResults || []) as (WorkspaceNode & { matches?: ContentMatchSnippet[] })[])];
    } else {
      list = [...(nodesData || [])];
      if (searchKeyword.trim()) {
        const q = searchKeyword.trim().toLowerCase();
        list = list.filter((item) => item.name.toLowerCase().includes(q));
      }
    }

    return list.sort((a, b) => {
      // 文件夹置顶展示
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1;
      }
      if (sortField === 'name') {
        const comp = a.name.localeCompare(b.name, 'zh-CN');
        return sortOrder === 'desc' ? -comp : comp;
      }
      if (sortField === 'fileSize') {
        const sA = Number(a.fileSize) || 0;
        const sB = Number(b.fileSize) || 0;
        return sortOrder === 'desc' ? sB - sA : sA - sB;
      }
      // 默认按修改时间排序 (updatedAt)，最新排前面 (desc)
      // 若是文件夹，优先使用内部最新文件更新时间 latestUpdatedAt
      const tA = new Date(a.latestUpdatedAt || a.updatedAt || a.createdAt || 0).getTime();
      const tB = new Date(b.latestUpdatedAt || b.updatedAt || b.createdAt || 0).getTime();
      return sortOrder === 'desc' ? tB - tA : tA - tB;
    });
  }, [nodesData, searchKeyword, searchMode, contentSearchResults, sortField, sortOrder]);

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

  // 4.1 拖拽上传支持
  const [isDragOver, setIsDragOver] = useState(false);
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      for (const file of files) {
        void handleUploadFile(file);
      }
    }
  }, [handleUploadFile]);

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
    const isRoot = breadcrumbs.length === 1;
    const displayName = getNodeDisplayName(folder, isRoot);
    setBreadcrumbs((prev) => [...prev, { id: folder.id, name: displayName }]);
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

  // 9.1 一键清理临时工作区
  const handleCleanupTemp = async () => {
    if (!currentWorkspace?.id) return;
    setIsCleaningTemp(true);
    void antdMessage.loading({ content: '正在智能整理并清理临时工作区...', key: 'cleanup-temp' });
    try {
      const res = await workspaceApi.cleanupTempWorkspace(currentWorkspace.id);
      if (res.totalCleaned > 0) {
        void antdMessage.success({
          content: `清理完成！共清理 ${res.ghostNodesCleaned} 个失效幽灵记录与 ${res.cacheFilesCleaned} 个衍生提取缓存，保留 ${res.remainingFiles} 个有效成果`,
          key: 'cleanup-temp',
          duration: 5,
        });
      } else {
        void antdMessage.info({
          content: '临时工作区很整洁，未发现失效记录或冗余缓存',
          key: 'cleanup-temp',
        });
      }
      void refetchNodes();
      void refetchWorkspaces();
    } catch (err: unknown) {
      void antdMessage.error({
        content: err instanceof Error ? err.message : '清理失败',
        key: 'cleanup-temp',
      });
    } finally {
      setIsCleaningTemp(false);
    }
  };

  // 是否只读（公司公共盘与流程管理空间默认非管理员只读，确保归档文档安全防篡改）
  const isReadOnly = (activeTab === 'company' || activeTab === 'process') && !isAdmin;

  // 表格列定义
  const columns: ColumnsType<WorkspaceNode> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      sorter: true,
      sortOrder: sortField === 'name' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null,
      render: (_, record) => {
        const matches = (record as any).matches as ContentMatchSnippet[] | undefined;
        const keyTopics = record.digest?.keyTopics;
        const isRoot = breadcrumbs.length === 1;
        const sysMeta = getSystemFolderMeta(record, isRoot);
        const displayName = getNodeDisplayName(record, isRoot);

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '2px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
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
                {getFileIcon(record, sysMeta)}
                <span style={{ fontWeight: record.type === 'folder' ? 500 : 400, fontSize: 13.5 }}>
                  {displayName}
                </span>
              </span>

              {keyTopics && keyTopics.length > 0 && (
                <div style={{ display: 'inline-flex', gap: 4, marginLeft: 4 }}>
                  {keyTopics.slice(0, 3).map((topic, i) => (
                    <Tag
                      key={i}
                      color="blue"
                      bordered={false}
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
            </div>

            {matches && matches.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--primary-color, #1677ff)', paddingLeft: 42, marginTop: 2 }}>
                <Tag color="cyan" bordered={false} style={{ marginRight: 6, fontSize: 10 }}>全文命中</Tag>
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
      width: 130,
      sorter: true,
      sortOrder: sortField === 'fileSize' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null,
      render: (size: string, record) => {
        if (record.type === 'folder') {
          const count = record.fileCount ?? 0;
          return (
            <span style={{ color: count > 0 ? 'var(--text-primary)' : 'var(--text-secondary)', fontSize: 12.5 }}>
              {count} 项
            </span>
          );
        }
        return <span style={{ fontSize: 12.5 }}>{formatBytes(size)}</span>;
      },
    },
    {
      title: '类型',
      key: 'type',
      width: 140,
      render: (_, record) => {
        const isRoot = breadcrumbs.length === 1;
        const sysMeta = getSystemFolderMeta(record, isRoot);
        if (sysMeta) {
          return <Tag color={sysMeta.tagColor} bordered={false}>{sysMeta.categoryLabel}</Tag>;
        }
        if (record.type === 'folder') {
          return <Tag bordered={false}>文件夹</Tag>;
        }
        const ext = (record.name.split('.').pop() || '文件').toUpperCase();
        return <Tag color="default" bordered={false}>{ext}</Tag>;
      },
    },
    {
      title: '修改时间',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 190,
      sorter: true,
      sortOrder: sortField === 'updatedAt' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null,
      render: (val: string, record) => {
        const targetTime = record.latestUpdatedAt || val;
        if (!targetTime) return '-';
        const d = new Date(targetTime);
        const hasLatestFromChildren = record.type === 'folder' && Boolean(record.latestUpdatedAt);
        return (
          <Tooltip title={hasLatestFromChildren ? `最新文件修改时间: ${d.toLocaleString()}` : d.toLocaleString()}>
            <span style={{ color: hasLatestFromChildren ? 'var(--text-primary)' : 'var(--text-secondary)', fontSize: 12.5 }}>
              {d.toLocaleString()}
            </span>
          </Tooltip>
        );
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      fixed: 'right',
      render: (_, record) => {
        const isRoot = breadcrumbs.length === 1;
        const sysMeta = getSystemFolderMeta(record, isRoot);

        return (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {record.type === 'folder' ? (
              <Button
                type="link"
                size="small"
                className={styles['btn-open-folder']}
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
                    className={styles['action-icon-btn']}
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
                    className={styles['action-icon-btn']}
                    icon={<EyeOutlined />}
                    onClick={() => void handlePreviewNode(record)}
                  />
                </Tooltip>
                <Tooltip title="下载">
                  <Button
                    type="text"
                    size="small"
                    className={styles['action-icon-btn']}
                    icon={<DownloadOutlined />}
                    onClick={() => handleDownloadNode(record)}
                  />
                </Tooltip>
              </>
            )}
            {/* 系统内置根目录严禁出现删除按钮 */}
            {!isReadOnly && !sysMeta && (
              <Popconfirm
                title={`确定要删除 "${record.name}" 吗？`}
                description={record.type === 'folder' ? '文件夹内的所有子文件也将被永久删除！' : undefined}
                overlayStyle={{ maxWidth: 280 }}
                okText="确定"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                onConfirm={() => handleDeleteNode(record)}
              >
                <Tooltip title="删除">
                  <Button
                    type="text"
                    size="small"
                    className={styles['action-icon-btn-danger']}
                    icon={<DeleteOutlined />}
                  />
                </Tooltip>
              </Popconfirm>
            )}
          </div>
        );
      },
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
                <span>{workspacesData?.department?.name || '部门共享'}</span>
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

            <div
              className={`${styles['workspace-nav-item']}${activeTab === 'process' ? ` ${styles['is-active']}` : ''}`}
              onClick={() => handleTabChange('process')}
            >
              <div className={styles['workspace-nav-item-left']}>
                <span className={styles['workspace-nav-icon']}><AuditOutlined /></span>
                <span>流程管理空间</span>
              </div>
              <Tag color="cyan" bordered={false}>协同归档</Tag>
            </div>
          </nav>

          <div className={styles['workspace-sidebar-tip-card']}>
            <div className={styles['workspace-sidebar-tip-title']}>
              <FolderOpenOutlined style={{ marginRight: 6, color: 'var(--primary-color)' }} />
              业务与沙盒资产沉淀
            </div>
            <p className={styles['workspace-sidebar-tip-desc']}>
              数字员工任务成果与沙盒临时工作区文件自动归档，支持全文检索与一键智能摘要。
            </p>
          </div>
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
            {activeTab === 'department' && workspacesData?.departments && workspacesData.departments.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>部门:</span>
                <Select
                  size="middle"
                  style={{ minWidth: 140 }}
                  value={currentWorkspace?.departmentId || selectedDeptId || workspacesData.departments[0]?.id}
                  onChange={(deptId) => {
                    setSelectedDeptId(deptId);
                    setBreadcrumbs([{ id: null, name: '根目录' }]);
                    setSearchKeyword('');
                  }}
                  options={workspacesData.departments.map((d) => ({
                    value: d.id,
                    label: d.name,
                  }))}
                />
              </div>
            )}

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

            <Select
              value={`${sortField}_${sortOrder}`}
              onChange={(val) => {
                const [f, o] = val.split('_');
                setSortField(f);
                setSortOrder(o as 'asc' | 'desc');
              }}
              style={{ width: 145 }}
              options={[
                { value: 'updatedAt_desc', label: '最新修改优先' },
                { value: 'updatedAt_asc', label: '最早修改优先' },
                { value: 'name_asc', label: '文件名 (A → Z)' },
                { value: 'name_desc', label: '文件名 (Z → A)' },
                { value: 'fileSize_desc', label: '大小 (大到小)' },
                { value: 'fileSize_asc', label: '大小 (小到大)' },
              ]}
            />

            {!isReadOnly && (
              <>
                {/* 仅在进入临时文件目录后才展示一键清理按钮，首页绝不显示 */}
                {activeTab === 'personal' &&
                  breadcrumbs.length > 1 &&
                  (breadcrumbs[breadcrumbs.length - 1].name.includes('临时') ||
                   breadcrumbs[breadcrumbs.length - 1].name.includes('temp')) && (
                  <Popconfirm
                    title="清理临时文件"
                    description="将自动清理已失效的历史记录与系统提取缓存。真实的交付成果、代码及报告不会被删除。是否继续？"
                    overlayStyle={{ maxWidth: 320 }}
                    okText="确定清理"
                    cancelText="取消"
                    okButtonProps={{ danger: true, loading: isCleaningTemp }}
                    onConfirm={handleCleanupTemp}
                  >
                    <Button
                      className={styles['btn-cleanup-action']}
                      icon={<ClearOutlined />}
                      loading={isCleaningTemp}
                    >
                      一键清理
                    </Button>
                  </Popconfirm>
                )}

                {/* 仅在非个人空间根目录下才允许新建文件夹与上传文件，保持根目录规范 */}
                {(breadcrumbs.length > 1 || activeTab !== 'personal') && (
                  <>
                    <Button
                      className={styles['btn-secondary-folder']}
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
                        className={styles['btn-primary-upload']}
                        icon={<UploadOutlined />}
                        loading={isUploading}
                      >
                        上传文件
                      </Button>
                    </Upload>
                  </>
                )}
              </>
            )}

            <Tooltip title="刷新列表">
              <Button
                className={styles['btn-reload-action']}
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
        <div
          className={`${styles['workspace-content-body']}${isDragOver ? ` ${styles['is-drag-over']}` : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <Table<WorkspaceNode>
            className={styles['workspace-table']}
            columns={columns}
            dataSource={displayNodes}
            rowKey="id"
            scroll={{ x: 720 }}
            tableLayout="fixed"
            loading={isWsLoading || (searchMode === 'name' ? isNodesLoading : isContentSearching)}
            onChange={(_, __, sorter: any) => {
              if (!Array.isArray(sorter) && sorter.field) {
                const field = String(sorter.field);
                if (sorter.order) {
                  setSortField(field);
                  setSortOrder(sorter.order === 'ascend' ? 'asc' : 'desc');
                } else {
                  setSortField('updatedAt');
                  setSortOrder('desc');
                }
              }
            }}
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
                        : activeTab === 'department' && !currentWorkspace
                        ? '当前尚未配置或关联任何部门共享盘'
                        : isReadOnly
                        ? '公共盘当前目录暂无文件'
                        : '当前目录暂无文件或文件夹，点击右上角上传文件或新建文件夹'
                    }
                  />
                </div>
              ),
            }}
          />
        </div>

        {/* 底部状态栏 */}
        <footer className={styles['workspace-footer']}>
          <div className={styles['workspace-footer-left']}>
            <span>共 {displayNodes.length} 个项目</span>
            {searchKeyword && <span>（当前条件筛选结果）</span>}
          </div>
          <div className={styles['workspace-footer-right']}>
            {currentWorkspace && (
              <span>已用容量：{formatBytes(currentWorkspace.usedBytes)} / {formatBytes(currentWorkspace.quotaBytes)}</span>
            )}
          </div>
        </footer>
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
