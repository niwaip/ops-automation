import {
  ArrowLeftOutlined,
  AuditOutlined,
  BankOutlined,
  ClearOutlined,
  CloudServerOutlined,
  DeleteOutlined,
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
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { ResizableHeaderCell } from '../components/ResizableHeaderCell';
import { useWorkspaceUrlFilePreview } from '../hooks/useWorkspaceUrlFilePreview';
import { useWorkspaceColumnWidths } from '../hooks/useWorkspaceColumnWidths';
import {
  type BreadcrumbItem,
  formatBytes,
  getNodeDisplayName,
  useWorkspaceTableColumns,
} from '../hooks/useWorkspaceTableColumns';
import styles from './WorkspacePage.module.css';

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
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);
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

  // 切换工作空间 Tab 时重置路径与搜索及多选项
  const handleTabChange = useCallback((tab: 'personal' | 'department' | 'company' | 'process') => {
    setActiveTab(tab);
    setBreadcrumbs([{ id: null, name: '根目录' }]);
    setSearchKeyword('');
    setSelectedRowKeys([]);
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

  // 全文内容检索防抖（300ms 避免快速输入与拼音组合时发起密集请求堵塞后端扫描）
  const [debouncedKeyword, setDebouncedKeyword] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedKeyword(searchKeyword.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchKeyword]);

  // 全文内容检索 Query（当 searchMode 为 content 且关键字长度 >= 2 时自动触发，精准收敛到当前文件夹与已保存成果）
  const {
    data: contentSearchResults,
    isLoading: isContentSearching,
  } = useQuery(
    ['workspace-content-search-page', currentWorkspace?.id, currentFolderId, debouncedKeyword],
    () => {
      if (!debouncedKeyword || debouncedKeyword.length < 2) return Promise.resolve([]);
      return workspaceApi.searchContent(debouncedKeyword, currentWorkspace?.id, currentFolderId);
    },
    {
      enabled: searchMode === 'content' && Boolean(debouncedKeyword.length >= 2),
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

  // 5.1 批量删除选中项目
  const handleBatchDelete = async () => {
    if (!currentWorkspace?.id || selectedRowKeys.length === 0) return;
    setIsBatchDeleting(true);
    try {
      const res = await workspaceApi.batchDeleteNodes(
        currentWorkspace.id,
        selectedRowKeys as string[]
      );
      void antdMessage.success(`成功批量删除 ${res.deletedCount} 个项目`);
      setSelectedRowKeys([]);
      void refetchNodes();
      void refetchWorkspaces();
    } catch (err: unknown) {
      void antdMessage.error(err instanceof Error ? err.message : '批量删除失败');
    } finally {
      setIsBatchDeleting(false);
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
    setSelectedRowKeys([]);
  };

  // 8. 点击面包屑回退
  const handleBreadcrumbClick = (index: number) => {
    setBreadcrumbs((prev) => prev.slice(0, index + 1));
    setSearchKeyword('');
    setSelectedRowKeys([]);
  };

  // 9. 返回上一层
  const handleGoBack = () => {
    if (breadcrumbs.length > 1) {
      setBreadcrumbs((prev) => prev.slice(0, prev.length - 1));
      setSearchKeyword('');
      setSelectedRowKeys([]);
    }
  };

  // 9.1 一键清理临时工作区（默认清理超 7 天旧临时文件与失效缓存）
  const handleCleanupTemp = async (forceEmpty: boolean = false) => {
    if (!currentWorkspace?.id) return;
    setIsCleaningTemp(true);
    void antdMessage.loading({
      content: forceEmpty ? '正在彻底清空临时工作区全部文件...' : '正在智能清理超7天过期文件与系统冗余缓存...',
      key: 'cleanup-temp',
    });
    try {
      const res = await workspaceApi.cleanupTempWorkspace(currentWorkspace.id, {
        retentionDays: forceEmpty ? 0 : 7,
        forceEmpty,
      });
      if (res.totalCleaned > 0) {
        const parts: string[] = [];
        if (res.expiredFilesCleaned && res.expiredFilesCleaned > 0) {
          parts.push(`${res.expiredFilesCleaned} 个超7天过期临时文件`);
        }
        if (res.cacheFilesCleaned > 0) {
          parts.push(`${res.cacheFilesCleaned} 个衍生提取缓存`);
        }
        if (res.ghostNodesCleaned > 0) {
          parts.push(`${res.ghostNodesCleaned} 个失效幽灵记录`);
        }
        const detailStr = parts.join('、') || `${res.totalCleaned} 项`;
        void antdMessage.success({
          content: `清理完成！共清理 ${detailStr}，保留 ${res.remainingFiles} 个有效成果（默认保留7天内文件）`,
          key: 'cleanup-temp',
          duration: 5,
        });
      } else {
        void antdMessage.info({
          content: '临时工作区很整洁，未发现失效记录或超7天过期文件',
          key: 'cleanup-temp',
        });
      }
      setSelectedRowKeys([]);
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

  const { widths, updateWidth, resetWidth } = useWorkspaceColumnWidths();

  // 表格列定义（支持拖拽调整列宽与持久化记忆）
  const columns = useWorkspaceTableColumns({
    widths,
    updateWidth,
    resetWidth,
    sortField,
    sortOrder,
    breadcrumbs,
    isReadOnly,
    onEnterFolder: handleEnterFolder,
    onPreviewNode: (file) => void handlePreviewNode(file),
    onDownloadNode: (node) => void handleDownloadNode(node),
    onDeleteNode: (node) => void handleDeleteNode(node),
    onOpenDigestDrawer: setDigestDrawerNode,
  });

  const isTempFolder = useMemo(() => {
    if (breadcrumbs.length <= 1) return false;
    const currentName = breadcrumbs[breadcrumbs.length - 1].name;
    return currentName.includes('临时') || currentName.includes('temp');
  }, [breadcrumbs]);

  const rowSelection = useMemo(() => {
    if (isReadOnly) return undefined;
    return {
      selectedRowKeys,
      onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
      getCheckboxProps: (record: WorkspaceNode) => {
        const isRoot = breadcrumbs.length === 1;
        const isSystemFolder = isRoot && record.type === 'folder' && ['tasks', 'saved', 'temp'].some(k => record.name.toLowerCase().includes(k));
        return {
          disabled: isReadOnly || isSystemFolder,
        };
      },
    };
  }, [isReadOnly, selectedRowKeys, breadcrumbs.length]);

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

            {/* 批量操作工具条 */}
            {selectedRowKeys.length > 0 && !isReadOnly && (
              <div className={styles['batch-actions-bar']}>
                <span className={styles['batch-selected-count']}>
                  已选择 <strong>{selectedRowKeys.length}</strong> 项
                </span>
                <Button
                  size="small"
                  onClick={() => setSelectedRowKeys([])}
                  className={styles['btn-batch-cancel']}
                >
                  取消
                </Button>
                <Popconfirm
                  title="批量删除确认"
                  description={`确定删除选中的 ${selectedRowKeys.length} 个项目吗？将同步彻底清理底层磁盘文件，不可恢复。`}
                  overlayStyle={{ maxWidth: 300 }}
                  okText="确认删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true, loading: isBatchDeleting }}
                  onConfirm={handleBatchDelete}
                >
                  <Button
                    danger
                    type="primary"
                    size="small"
                    icon={<DeleteOutlined />}
                    loading={isBatchDeleting}
                  >
                    批量删除
                  </Button>
                </Popconfirm>
              </div>
            )}

            {!isReadOnly && (
              <>
                {/* 仅在进入临时文件目录后才展示一键清理按钮，首页绝不显示 */}
                {activeTab === 'personal' && isTempFolder && (
                  <Popconfirm
                    title="一键清理临时文件"
                    description="将自动清理已失效的历史记录、衍生缓存，以及超过 7 天（一星期）的旧临时文件。近 7 天内的成果文件将被安全保留。是否继续？"
                    overlayStyle={{ maxWidth: 340 }}
                    okText="确定清理"
                    cancelText="取消"
                    okButtonProps={{ danger: true, loading: isCleaningTemp }}
                    onConfirm={() => handleCleanupTemp(false)}
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

        {/* 临时工作区 7 天保留期提示条 */}
        {isTempFolder && (
          <div className={styles['temp-folder-hint-bar']}>
            <span>💡 提示：临时文件默认最多保存一个星期（7天）。如需长期保存，请在会话中点击「保存」按钮归档至成果空间。</span>
          </div>
        )}

        {/* 内容表格区 */}
        <div
          className={`${styles['workspace-content-body']}${isDragOver ? ` ${styles['is-drag-over']}` : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <Table<WorkspaceNode>
            className={styles['workspace-table']}
            components={{
              header: {
                cell: ResizableHeaderCell,
              },
            }}
            columns={columns}
            dataSource={displayNodes}
            rowKey="id"
            rowSelection={rowSelection}
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
