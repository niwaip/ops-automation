import { useMemo } from 'react';
import {
  AuditOutlined,
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
} from '@ant-design/icons';
import { Button, Popconfirm, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { ContentMatchSnippet, WorkspaceNode } from '../../../api/workspace';
import type { WorkspaceColumnWidths } from './useWorkspaceColumnWidths';
import styles from '../pages/WorkspacePage.module.css';

export interface BreadcrumbItem {
  id: string | null;
  name: string;
}

export function formatBytes(bytesStr: string | number): string {
  const bytes = Number(bytesStr);
  if (!bytes || isNaN(bytes) || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export interface SystemFolderMeta {
  isSystem: boolean;
  key: 'tasks' | 'saved' | 'temp';
  displayName: string;
  categoryLabel: string;
  tagColor: string;
  iconColor: string;
}

export function getSystemFolderMeta(node: WorkspaceNode, isRoot: boolean): SystemFolderMeta | null {
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

export function getNodeDisplayName(node: WorkspaceNode, isRoot: boolean): string {
  const meta = getSystemFolderMeta(node, isRoot);
  return meta ? meta.displayName : node.name;
}

export function getFileIcon(node: WorkspaceNode, sysMeta?: SystemFolderMeta | null) {
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
          background: 'rgba(234, 179, 8, 0.12)',
          color: '#eab308',
          fontSize: 16,
          flexShrink: 0,
        }}
      >
        <FolderOpenOutlined />
      </span>
    );
  }

  const ext = node.name.split('.').pop()?.toLowerCase() || '';
  let icon = <FileOutlined />;
  let color = 'var(--text-secondary)';
  let bg = 'rgba(255, 255, 255, 0.05)';

  if (['pdf'].includes(ext)) {
    icon = <FilePdfOutlined />;
    color = '#ef4444';
    bg = 'rgba(239, 68, 68, 0.12)';
  } else if (['doc', 'docx'].includes(ext)) {
    icon = <FileWordOutlined />;
    color = '#3b82f6';
    bg = 'rgba(59, 130, 246, 0.12)';
  } else if (['xls', 'xlsx', 'csv'].includes(ext)) {
    icon = <FileExcelOutlined />;
    color = '#10b981';
    bg = 'rgba(16, 185, 129, 0.12)';
  } else if (['ppt', 'pptx'].includes(ext)) {
    icon = <FilePptOutlined />;
    color = '#f97316';
    bg = 'rgba(249, 115, 22, 0.12)';
  } else if (['md', 'txt', 'json', 'log', 'py', 'ts', 'js'].includes(ext)) {
    icon = <FileTextOutlined />;
    color = '#8b5cf6';
    bg = 'rgba(139, 92, 246, 0.12)';
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
        background: bg,
        color: color,
        fontSize: 16,
        flexShrink: 0,
      }}
    >
      {icon}
    </span>
  );
}

export interface UseWorkspaceTableColumnsProps {
  widths: WorkspaceColumnWidths;
  updateWidth: (key: keyof WorkspaceColumnWidths, width: number) => void;
  resetWidth: (key?: keyof WorkspaceColumnWidths) => void;
  sortField: string;
  sortOrder: 'asc' | 'desc';
  breadcrumbs: BreadcrumbItem[];
  isReadOnly: boolean;
  onEnterFolder: (folder: WorkspaceNode) => void;
  onPreviewNode: (file: WorkspaceNode) => void;
  onDownloadNode: (node: WorkspaceNode) => void;
  onDeleteNode: (node: WorkspaceNode) => void;
  onOpenDigestDrawer: (node: WorkspaceNode) => void;
}

export function useWorkspaceTableColumns({
  widths,
  updateWidth,
  resetWidth,
  sortField,
  sortOrder,
  breadcrumbs,
  isReadOnly,
  onEnterFolder,
  onPreviewNode,
  onDownloadNode,
  onDeleteNode,
  onOpenDigestDrawer,
}: UseWorkspaceTableColumnsProps): ColumnsType<WorkspaceNode> {
  const isRoot = breadcrumbs.length === 1;

  return useMemo(
    () => [
      {
        title: '名称',
        dataIndex: 'name',
        key: 'name',
        minWidth: widths.nameMinWidth,
        ellipsis: true,
        sorter: true,
        sortOrder: sortField === 'name' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null,
        onHeaderCell: () => ({
          width: widths.nameMinWidth,
          minWidth: 160,
          maxWidth: 900,
          onResize: (newWidth: number) => updateWidth('nameMinWidth', newWidth),
          onReset: () => resetWidth('nameMinWidth'),
          resizable: true,
        }),
        render: (_, record) => {
          const matches = (record as any).matches as ContentMatchSnippet[] | undefined;
          const keyTopics = record.digest?.keyTopics;
          const sysMeta = getSystemFolderMeta(record, isRoot);
          const displayName = getNodeDisplayName(record, isRoot);

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '2px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span
                  className={styles['node-item-name']}
                  title={displayName}
                  onClick={() => {
                    if (record.type === 'folder') {
                      onEnterFolder(record);
                    } else {
                      onPreviewNode(record);
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
        width: widths.fileSize,
        sorter: true,
        sortOrder: sortField === 'fileSize' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null,
        onHeaderCell: () => ({
          width: widths.fileSize,
          minWidth: 50,
          maxWidth: 200,
          onResize: (newWidth: number) => updateWidth('fileSize', newWidth),
          onReset: () => resetWidth('fileSize'),
          resizable: true,
        }),
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
        width: widths.type,
        onHeaderCell: () => ({
          width: widths.type,
          minWidth: 50,
          maxWidth: 180,
          onResize: (newWidth: number) => updateWidth('type', newWidth),
          onReset: () => resetWidth('type'),
          resizable: true,
        }),
        render: (_, record) => {
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
        width: widths.updatedAt,
        sorter: true,
        sortOrder: sortField === 'updatedAt' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null,
        onHeaderCell: () => ({
          width: widths.updatedAt,
          minWidth: 120,
          maxWidth: 300,
          onResize: (newWidth: number) => updateWidth('updatedAt', newWidth),
          onReset: () => resetWidth('updatedAt'),
          resizable: true,
        }),
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
        width: widths.action,
        fixed: 'right',
        onHeaderCell: () => ({
          width: widths.action,
          minWidth: 90,
          maxWidth: 220,
          onResize: (newWidth: number) => updateWidth('action', newWidth),
          onReset: () => resetWidth('action'),
          resizable: true,
        }),
        render: (_, record) => {
          const sysMeta = getSystemFolderMeta(record, isRoot);

          return (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {record.type === 'folder' ? (
                <Button
                  type="link"
                  size="small"
                  className={styles['btn-open-folder']}
                  onClick={() => onEnterFolder(record)}
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
                      onClick={() => onOpenDigestDrawer(record)}
                    />
                  </Tooltip>
                  <Tooltip title="快速预览">
                    <Button
                      type="text"
                      size="small"
                      className={styles['action-icon-btn']}
                      icon={<EyeOutlined />}
                      onClick={() => onPreviewNode(record)}
                    />
                  </Tooltip>
                  <Tooltip title="下载">
                    <Button
                      type="text"
                      size="small"
                      className={styles['action-icon-btn']}
                      icon={<DownloadOutlined />}
                      onClick={() => onDownloadNode(record)}
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
                  onConfirm={() => onDeleteNode(record)}
                >
                  <Tooltip title="删除">
                    <Button
                      type="text"
                      danger
                      size="small"
                      className={styles['action-icon-btn']}
                      icon={<DeleteOutlined />}
                    />
                  </Tooltip>
                </Popconfirm>
              )}
            </div>
          );
        },
      },
    ],
    [
      widths,
      updateWidth,
      resetWidth,
      sortField,
      sortOrder,
      isRoot,
      isReadOnly,
      onEnterFolder,
      onPreviewNode,
      onDownloadNode,
      onDeleteNode,
      onOpenDigestDrawer,
    ]
  );
}
