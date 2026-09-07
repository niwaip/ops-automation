import {
  CloseOutlined,
  FormOutlined,
  MessageOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Button, Empty, Spin, Tag, Tooltip } from 'antd';
import { useEffect, useMemo, useRef } from 'react';
import { useQuery } from 'react-query';
import {
  workbenchCoordinationApi,
  type CollaboratorUser,
} from '../../../api/workbenchCoordination';
import styles from './UserCoordinationMentionDropdown.module.css';

interface UserCoordinationMentionDropdownProps {
  open: boolean;
  searchQuery: string;
  onSelectUser: (user: CollaboratorUser, mode: 'freeform' | 'card') => void;
  onClose: () => void;
  selectedIndex: number;
  onHoverIndex: (index: number) => void;
  onFilteredUsersChange?: (users: CollaboratorUser[]) => void;
}

export function UserCoordinationMentionDropdown({
  open,
  searchQuery,
  onSelectUser,
  onClose,
  selectedIndex,
  onHoverIndex,
  onFilteredUsersChange,
}: UserCoordinationMentionDropdownProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: rawUsers, isLoading } = useQuery(
    ['collaborators-search', searchQuery],
    () => workbenchCoordinationApi.searchCollaborators(searchQuery),
    {
      enabled: open,
      staleTime: 0,
      retry: false,
    }
  );

  const users = useMemo(() => {
    return Array.isArray(rawUsers) ? rawUsers : [];
  }, [rawUsers]);

  const filteredUsers = useMemo(() => {
    if (!users || !Array.isArray(users)) return [];
    if (!searchQuery) return users;
    const lower = searchQuery.toLowerCase();
    return users.filter(
      (u) =>
        Boolean(
          (u?.username && u.username.toLowerCase().includes(lower)) ||
          (u?.email && u.email.toLowerCase().includes(lower))
        )
    );
  }, [users, searchQuery]);

  useEffect(() => {
    onFilteredUsersChange?.(filteredUsers);
  }, [filteredUsers, onFilteredUsersChange]);

  // 监听点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        !target.closest(`.${styles.dropdown}`) &&
        !target.closest('textarea')
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open, onClose]);

  if (!open) return null;

  const safeFilteredUsers = Array.isArray(filteredUsers) ? filteredUsers : [];

  return (
    <div ref={containerRef} className={styles.dropdown}>
      <div className={styles.header}>
        <div className={styles.title}>
          <TeamOutlined style={{ color: '#1677ff' }} />
          <span>协同成员 (@)</span>
          {safeFilteredUsers.length > 0 ? (
            <Tag color="blue" style={{ marginLeft: 4, borderRadius: 10, fontSize: 11 }}>
              {safeFilteredUsers.length} 人
            </Tag>
          ) : null}
        </div>
        <Button
          type="text"
          size="small"
          icon={<CloseOutlined style={{ fontSize: 12 }} />}
          onClick={onClose}
        />
      </div>

      <div className={styles.list}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <Spin size="small" />
          </div>
        ) : safeFilteredUsers.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              searchQuery
                ? `未找到匹配 "${searchQuery}" 的成员`
                : '暂无协同成员'
            }
          />
        ) : (
          safeFilteredUsers.map((user, idx) => {
            if (!user) return null;
            const isSelected = idx === selectedIndex;
            const username = user.username || '未知用户';
            const initial = username.charAt(0).toUpperCase();

            return (
              <div
                key={user.id || `user-${idx}`}
                className={`${styles.item} ${isSelected ? styles.selected : ''}`}
                onMouseEnter={() => onHoverIndex(idx)}
                onClick={() => onSelectUser(user, 'freeform')}
              >
                <div className={styles.userInfo}>
                  <div className={styles.avatar}>{initial}</div>
                  <div className={styles.meta}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className={styles.username}>{username}</span>
                      {user.role ? (
                        <Tag color="default" style={{ fontSize: 10, margin: 0, padding: '0 4px' }}>
                          {user.role}
                        </Tag>
                      ) : null}
                    </div>
                    {user.email ? <span className={styles.email}>{user.email}</span> : null}
                  </div>
                </div>

                <div className={styles.actions} onClick={(e) => e.stopPropagation()}>
                  <Tooltip title="直接对话模式：在输入框内自由撰写任务内容">
                    <Button
                      size="small"
                      type={isSelected ? 'primary' : 'default'}
                      icon={<MessageOutlined />}
                      onClick={() => onSelectUser(user, 'freeform')}
                    >
                      自由对话
                    </Button>
                  </Tooltip>
                  <Tooltip title="卡片预设模式：填写标题、截止时间、附件等规范要素">
                    <Button
                      size="small"
                      icon={<FormOutlined />}
                      onClick={() => onSelectUser(user, 'card')}
                    >
                      规范卡片
                    </Button>
                  </Tooltip>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className={styles.footer}>
        <span>
          <span className={styles.kbd}>↑</span> <span className={styles.kbd}>↓</span> 选择，
          <span className={styles.kbd}>Enter</span> 自由协同，<span className={styles.kbd}>Esc</span> 取消
        </span>
      </div>
    </div>
  );
}
