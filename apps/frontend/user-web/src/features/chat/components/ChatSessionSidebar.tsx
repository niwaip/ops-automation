import { useMemo, useState } from 'react';
import {
  AppstoreOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  DesktopOutlined,
  GlobalOutlined,
  MenuFoldOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  WechatOutlined,
} from '@ant-design/icons';
import {
  Badge,
  Button,
  Card,
  Empty,
  Input,
  List,
  Popconfirm,
  Segmented,
  Skeleton,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ChatSession } from '@ops/user-core';
import { resolveSessionChannel, type SessionChannelMeta } from '../lib/sessionView';
import styles from '../pages/ChatPage.module.css';

interface ChatSessionSidebarProps {
  sessions: ChatSession[];
  selectedSessionId: string | null;
  isLoading: boolean;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession?: (sessionId: string) => void;
  onRefresh?: () => void;
  onCollapse: () => void;
  onCreateSession: () => void;
  getPreview: (sessionId: string) => string;
  formatUpdatedAt: (value?: string) => string;
}

type ChannelFilter = 'all' | 'local' | 'wechat';

export function ChatSessionSidebar({
  sessions,
  selectedSessionId,
  isLoading,
  onSelectSession,
  onDeleteSession,
  onRefresh,
  onCollapse,
  onCreateSession,
  getPreview,
  formatUpdatedAt,
}: ChatSessionSidebarProps) {
  const [searchKeyword, setSearchKeyword] = useState('');
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all');

  const channelCounts = useMemo(() => {
    let localCount = 0;
    let wechatCount = 0;
    sessions.forEach((s) => {
      const channel = resolveSessionChannel(s);
      if (channel.key === 'wechat') {
        wechatCount += 1;
      } else {
        localCount += 1;
      }
    });
    return {
      all: sessions.length,
      local: localCount,
      wechat: wechatCount,
    };
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    return sessions.filter((session) => {
      const channelMeta = resolveSessionChannel(session);
      if (channelFilter === 'local' && channelMeta.key !== 'local') {
        return false;
      }
      if (channelFilter === 'wechat' && channelMeta.key !== 'wechat') {
        return false;
      }
      if (!keyword) {
        return true;
      }
      const title = (session.title || '').toLowerCase();
      const preview = getPreview(session.id).toLowerCase();
      const modelId = (session.modelId || '').toLowerCase();
      return (
        title.includes(keyword) ||
        preview.includes(keyword) ||
        modelId.includes(keyword) ||
        channelMeta.label.toLowerCase().includes(keyword)
      );
    });
  }, [sessions, searchKeyword, channelFilter, getPreview]);

  const renderChannelTag = (meta: SessionChannelMeta) => {
    const channelClass =
      meta.key === 'wechat'
        ? styles['channel-wechat']
        : meta.key === 'dingtalk'
          ? styles['channel-dingtalk']
          : meta.key === 'feishu'
            ? styles['channel-feishu']
            : styles['channel-local'];

    const icon =
      meta.key === 'wechat' ? (
        <WechatOutlined style={{ marginRight: 4 }} />
      ) : meta.key === 'dingtalk' || meta.key === 'feishu' ? (
        <GlobalOutlined style={{ marginRight: 4 }} />
      ) : (
        <DesktopOutlined style={{ marginRight: 4 }} />
      );

    return (
      <span className={`${styles['session-channel-tag']} ${channelClass}`}>
        {icon}
        {meta.badgeText}
      </span>
    );
  };

  return (
    <Card className={styles['user-chat-sidebar']}>
      {/* 头部标题与操作 */}
      <div className={styles['user-chat-sidebar-header']}>
        <div className={styles['sidebar-title-group']}>
          <Space align="center" size={8}>
            <Typography.Title level={4} style={{ margin: 0 }}>
              会话管理
            </Typography.Title>
            <Badge
              count={sessions.length}
              overflowCount={999}
              className={styles['sidebar-header-badge']}
            />
          </Space>
          <Typography.Text type="secondary" className={styles['sidebar-subtitle']}>
            本地与渠道多端任务管理
          </Typography.Text>
        </div>
        <Space size={6}>
          <Tooltip title="收起侧边栏">
            <Button
              type="text"
              icon={<MenuFoldOutlined />}
              onClick={onCollapse}
              className={styles['user-chat-sidebar-toggle']}
            />
          </Tooltip>
          {onRefresh ? (
            <Tooltip title="刷新会话列表">
              <Button
                type="text"
                icon={<ReloadOutlined spin={isLoading} />}
                onClick={onRefresh}
                className={styles['user-chat-sidebar-toggle']}
              />
            </Tooltip>
          ) : null}
          <Tooltip title="新建会话">
            <Button
              type="primary"
              shape="circle"
              icon={<PlusOutlined />}
              onClick={onCreateSession}
              className={styles['sidebar-new-circle-btn']}
            />
          </Tooltip>
        </Space>
      </div>

      {/* 搜索框 */}
      <div className={styles['sidebar-search-wrapper']}>
        <Input
          prefix={<SearchOutlined className={styles['sidebar-search-icon']} />}
          placeholder="搜索会话、任务摘要..."
          allowClear
          value={searchKeyword}
          onChange={(e) => setSearchKeyword(e.target.value)}
          className={styles['sidebar-search-input']}
        />
      </div>

      {/* 渠道分段筛选器 */}
      <div className={styles['sidebar-filter-wrapper']}>
        <Segmented
          block
          value={channelFilter}
          onChange={(val) => setChannelFilter(val as ChannelFilter)}
          className={styles['sidebar-segmented']}
          options={[
            {
              label: (
                <Space size={4}>
                  <AppstoreOutlined />
                  <span>全部</span>
                  <span className={styles['segmented-count']}>{channelCounts.all}</span>
                </Space>
              ),
              value: 'all',
            },
            {
              label: (
                <Space size={4}>
                  <DesktopOutlined className={styles['segmented-icon-web']} />
                  <span>网页</span>
                  <span className={styles['segmented-count']}>{channelCounts.local}</span>
                </Space>
              ),
              value: 'local',
            },
            {
              label: (
                <Space size={4}>
                  <WechatOutlined className={styles['segmented-icon-wechat']} />
                  <span>微信</span>
                  <span className={styles['segmented-count']}>{channelCounts.wechat}</span>
                </Space>
              ),
              value: 'wechat',
            },
          ]}
        />
      </div>

      {/* 会话列表 */}
      <div className={styles['sidebar-list-container']}>
        {isLoading ? (
          <Skeleton active paragraph={{ rows: 6 }} className={styles['sidebar-skeleton']} />
        ) : filteredSessions.length === 0 ? (
          <div className={styles['sidebar-empty-wrapper']}>
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                searchKeyword
                  ? '未找到匹配会话'
                  : channelFilter === 'wechat'
                    ? '暂无微信互动会话'
                    : '暂无历史会话'
              }
            >
              {searchKeyword ? (
                <Button size="small" onClick={() => setSearchKeyword('')}>
                  清除搜索
                </Button>
              ) : (
                <Button type="primary" size="small" icon={<PlusOutlined />} onClick={onCreateSession}>
                  新建会话
                </Button>
              )}
            </Empty>
          </div>
        ) : (
          <List
            dataSource={filteredSessions}
            renderItem={(session) => {
              const isSelected = session.id === selectedSessionId;
              const channelMeta = resolveSessionChannel(session);
              const previewText = getPreview(session.id);
              const displayTitle =
                session.title ||
                (channelMeta.key === 'wechat' ? '微信互动会话' : '新对话');

              return (
                <List.Item
                  key={session.id}
                  className={`${styles['user-chat-session-item']} ${isSelected ? styles.active : ''} ${
                    channelMeta.key === 'wechat' ? styles['is-wechat-channel'] : styles['is-local-channel']
                  }`}
                  onClick={() => onSelectSession(session.id)}
                >
                  <div className={styles['user-chat-session-main']}>
                    {/* 第一行：渠道徽标 + 标题 + 删除操作 */}
                    <div className={styles['session-header-row']}>
                      <div className={styles['session-title-wrapper']}>
                        {renderChannelTag(channelMeta)}
                        <Typography.Text
                          strong
                          ellipsis={{ tooltip: displayTitle }}
                          className={styles['session-card-title']}
                        >
                          {displayTitle}
                        </Typography.Text>
                      </div>
                      {onDeleteSession ? (
                        <div
                          className={styles['session-action-hover']}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Popconfirm
                            title="删除会话"
                            description="确定要删除此会话历史记录吗？"
                            okText="删除"
                            cancelText="取消"
                            okButtonProps={{ danger: true, size: 'small' }}
                            cancelButtonProps={{ size: 'small' }}
                            onConfirm={() => onDeleteSession(session.id)}
                          >
                            <Button
                              type="text"
                              size="small"
                              icon={<DeleteOutlined />}
                              className={styles['session-delete-btn']}
                              title="删除会话"
                            />
                          </Popconfirm>
                        </div>
                      ) : null}
                    </div>

                    {/* 第二行：消息/摘要预览 */}
                    <Typography.Paragraph
                      type="secondary"
                      className={styles['user-chat-session-preview']}
                    >
                      {previewText}
                    </Typography.Paragraph>

                    {/* 第三行：元数据（模型 Tag、时间） */}
                    <div className={styles['session-footer-row']}>
                      <Space size={6} wrap className={styles['session-meta-tags']}>
                        {session.modelId && session.modelId !== 'default' ? (
                          <Tag className={styles['session-model-tag']}>
                            {session.modelId}
                          </Tag>
                        ) : null}
                      </Space>
                      <Space size={4} className={styles['session-time-text']}>
                        <ClockCircleOutlined style={{ fontSize: 11, opacity: 0.6 }} />
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {formatUpdatedAt(session.updatedAt)}
                        </Typography.Text>
                      </Space>
                    </div>
                  </div>
                </List.Item>
              );
            }}
          />
        )}
      </div>
    </Card>
  );
}
