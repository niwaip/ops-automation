import {
  BankOutlined,
  FileExcelOutlined,
  FileOutlined,
  FilePdfOutlined,
  FilePptOutlined,
  FileTextOutlined,
  FileWordOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Empty, Segmented, Spin, Tag } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from 'react-query';
import { workspaceApi, type ContentMatchSnippet, type WorkspaceNode } from '../../../api/workspace';
import styles from './WorkspaceMentionDropdown.module.css';

interface WorkspaceMentionDropdownProps {
  open: boolean;
  searchQuery: string;
  onSelect: (node: WorkspaceNode) => void;
  onClose: () => void;
  selectedIndex: number;
  onHoverIndex: (index: number) => void;
  onFilteredNodesChange?: (nodes: WorkspaceNode[]) => void;
}

function getFileIcon(node: WorkspaceNode) {
  const ext = (node.name.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') return <FilePdfOutlined style={{ color: '#ff4d4f' }} />;
  if (['docx', 'doc'].includes(ext)) return <FileWordOutlined style={{ color: '#1677ff' }} />;
  if (['pptx', 'ppt'].includes(ext)) return <FilePptOutlined style={{ color: '#fa541c' }} />;
  if (['xlsx', 'xls', 'csv'].includes(ext)) return <FileExcelOutlined style={{ color: '#52c41a' }} />;
  if (['txt', 'md', 'json', 'yaml', 'yml'].includes(ext)) return <FileTextOutlined style={{ color: '#8c8c8c' }} />;
  return <FileOutlined style={{ color: '#8c8c8c' }} />;
}

function formatBytes(bytesStr: string | number): string {
  const bytes = Number(bytesStr);
  if (!bytes || isNaN(bytes) || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function WorkspaceMentionDropdown({
  open,
  searchQuery,
  onSelect,
  onClose,
  selectedIndex,
  onHoverIndex,
  onFilteredNodesChange,
}: WorkspaceMentionDropdownProps) {
  const [activeScope, setActiveScope] = useState<'all' | 'personal' | 'department' | 'company'>('all');

  const { data: searchResults, isLoading: isSearchLoading } = useQuery(
    ['workspace-search', searchQuery],
    () => workspaceApi.searchFiles(searchQuery),
    {
      enabled: open,
      staleTime: 5000,
    }
  );

  const { data: contentResults, isLoading: isContentLoading } = useQuery(
    ['workspace-content-search-dropdown', searchQuery],
    () => {
      if (!searchQuery || searchQuery.trim().length < 2) return Promise.resolve([]);
      return workspaceApi.searchContent(searchQuery.trim());
    },
    {
      enabled: open && Boolean(searchQuery && searchQuery.trim().length >= 2),
      staleTime: 5000,
    }
  );

  const mergedNodes = useMemo(() => {
    const map = new Map<string, WorkspaceNode & { matches?: ContentMatchSnippet[] }>();
    for (const node of searchResults || []) {
      map.set(node.id, { ...node });
    }
    for (const node of contentResults || []) {
      if (map.has(node.id)) {
        map.get(node.id)!.matches = node.matches;
      } else {
        map.set(node.id, node);
      }
    }
    return Array.from(map.values());
  }, [searchResults, contentResults]);

  const filteredNodes = useMemo(() => {
    if (activeScope === 'all') return mergedNodes;
    return mergedNodes.filter((item) => item.workspaceType === activeScope);
  }, [mergedNodes, activeScope]);

  const isLoading = isSearchLoading || isContentLoading;

  useEffect(() => {
    onFilteredNodesChange?.(filteredNodes);
  }, [filteredNodes, onFilteredNodesChange]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        !target.closest(`.${styles['mention-dropdown']}`) &&
        !target.closest('textarea') &&
        !target.closest('button')
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={styles['mention-dropdown']}>
      {/* 顶部过滤条 */}
      <div className={styles['mention-header']}>
        <div className={styles['mention-title']}>
          引用工作空间文件 {searchQuery ? `(匹配 "${searchQuery}")` : ''}
        </div>
        <Segmented
          size="small"
          value={activeScope}
          onChange={(v) => setActiveScope(v as any)}
          options={[
            { label: '全部', value: 'all' },
            { label: '我的', value: 'personal' },
            { label: '部门', value: 'department' },
            { label: '公司', value: 'company' },
          ]}
        />
      </div>

      {/* 文件列表区 */}
      <div className={styles['mention-list']}>
        {isLoading ? (
          <div style={{ padding: '24px 0', textAlign: 'center' }}>
            <Spin size="small" />
          </div>
        ) : filteredNodes.length === 0 ? (
          <div style={{ padding: '16px 0' }}>
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <span style={{ fontSize: 12, color: 'var(--text-light)' }}>
                  {searchQuery ? '无匹配的工作空间文件' : '工作空间暂无可用文件'}
                </span>
              }
            />
          </div>
        ) : (
          filteredNodes.map((node, index) => {
            const isSelected = index === selectedIndex;
            const scopeTag =
              node.workspaceType === 'personal' ? (
                <Tag color="blue" icon={<UserOutlined />}>我的</Tag>
              ) : node.workspaceType === 'department' ? (
                <Tag color="purple" icon={<TeamOutlined />}>部门</Tag>
              ) : (
                <Tag color="orange" icon={<BankOutlined />}>公共</Tag>
              );

            return (
              <div
                key={node.id}
                onMouseEnter={() => onHoverIndex(index)}
                onClick={() => onSelect(node)}
                className={`${styles['mention-item']}${isSelected ? ` ${styles['is-selected']}` : ''}`}
              >
                <div className={styles['mention-item-info']}>
                  <span className={styles['mention-item-icon']}>{getFileIcon(node)}</span>
                  <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, flex: 1 }}>
                    <span className={styles['mention-item-name']} title={node.name}>
                      {node.name}
                    </span>
                    {node.matches && node.matches.length > 0 ? (
                      <span
                        style={{
                          fontSize: 11,
                          color: '#1677ff',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          marginTop: 1,
                        }}
                        title={`第 ${node.matches[0].line} 行: ${node.matches[0].snippet}`}
                      >
                        第 {node.matches[0].line} 行: {node.matches[0].snippet}
                      </span>
                    ) : node.digest?.keyTopics && node.digest.keyTopics.length > 0 ? (
                      <span
                        style={{
                          fontSize: 11,
                          color: 'var(--text-secondary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          marginTop: 1,
                        }}
                      >
                        {node.digest.keyTopics.slice(0, 3).map((t) => `#${t}`).join(' ')}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className={styles['mention-item-meta']}>
                  <span className={styles['mention-item-size']}>
                    {formatBytes(node.fileSize)}
                  </span>
                  {scopeTag}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 底部快捷键提示 */}
      <div className={styles['mention-footer']}>
        <span>↑↓ 选择 · 回车确认</span>
        <span onClick={onClose} className={styles['mention-close-btn']}>Esc 关闭</span>
      </div>
    </div>
  );
}
