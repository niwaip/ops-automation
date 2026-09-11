import React from 'react';
import {
  Button,
  Card,
  Dropdown,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  EllipsisOutlined,
  FileTextOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  RightOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
  UserOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { HabitCandidate } from '@/api/habitLearning';

const { Text } = Typography;

export const formatRiskLevel = (riskLevel: string) => {
  if (riskLevel === 'external_commit') {
    return {
      text: '外部写操作',
      fullText: '⚠️ 外部写操作/外部提交',
      color: 'orange',
      tooltip: '包含向外部系统推送消息、发送邮件或调用变更 Webhook，具有外部副作用。',
      isWarning: true,
      icon: <WarningOutlined />,
    };
  }
  return {
    text: '纯只读安全',
    fullText: '🛡️ 纯只读/安全查询',
    color: 'green',
    tooltip: '流程仅读取或分析数据，无外部写副作用。',
    isWarning: false,
    icon: <SafetyCertificateOutlined />,
  };
};

export const formatHabitStatus = (status: string) => {
  switch (status) {
    case 'active':
      return {
        badgeText: '0-Token 直通中',
        color: 'success',
        icon: <ThunderboltOutlined />,
      };
    case 'candidate':
      return {
        badgeText: '待生效候选',
        color: 'processing',
        icon: null,
      };
    case 'held':
      return {
        badgeText: '已暂停直通',
        color: 'warning',
        icon: <PauseCircleOutlined />,
      };
    case 'rejected':
      return {
        badgeText: '已拒绝',
        color: 'default',
        icon: null,
      };
    case 'rolled_back':
      return {
        badgeText: '已回滚',
        color: 'default',
        icon: null,
      };
    default:
      return {
        badgeText: status,
        color: 'default',
        icon: null,
      };
  }
};

interface HabitCandidateCardProps {
  candidate: HabitCandidate;
  actingId?: string;
  onAction: (candidate: HabitCandidate, action: 'hold' | 'reject' | 'rollback') => void;
  onViewDetail: (candidate: HabitCandidate) => void;
}

export const HabitCandidateCard: React.FC<HabitCandidateCardProps> = ({
  candidate,
  actingId,
  onAction,
  onViewDetail,
}) => {
  const riskInfo = formatRiskLevel(candidate.riskLevel);
  const statusInfo = formatHabitStatus(candidate.status);
  const nodes = candidate.planSnapshot?.nodes || [];

  const topBorderColor =
    candidate.status === 'active'
      ? '#52c41a'
      : candidate.status === 'held'
      ? '#faad14'
      : 'var(--border-color)';

  const moreMenuItems = [
    ...(candidate.status !== 'rejected'
      ? [
          {
            key: 'reject',
            label: '拒绝此习惯',
            danger: true,
            onClick: () => onAction(candidate, 'reject'),
          },
        ]
      : []),
    ...(candidate.status === 'active'
      ? [
          {
            key: 'rollback',
            label: '回滚到上一版本',
            onClick: () => onAction(candidate, 'rollback'),
          },
        ]
      : []),
  ];

  return (
    <Card
      hoverable
      size="small"
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: 12,
        borderTop: `3px solid ${topBorderColor}`,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
      }}
      bodyStyle={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        padding: '16px 18px',
      }}
    >
      <div>
        {/* 卡片头部：工作流名称 + 版本 + 运行状态徽标 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 10,
          }}
        >
          <div style={{ flex: 1, marginRight: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text
                strong
                style={{
                  fontSize: 16,
                  lineHeight: '22px',
                  color: 'var(--text-primary)',
                }}
              >
                {candidate.workflowName || candidate.intentKey || '未命名工作流'}
              </Text>
              {candidate.savedVersion && (
                <Tag
                  bordered={false}
                  style={{
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-secondary)',
                    borderRadius: 10,
                    fontSize: 11,
                    margin: 0,
                  }}
                >
                  v{candidate.savedVersion}
                </Tag>
              )}
            </div>
            <div
              style={{
                fontSize: 12,
                color: 'var(--text-secondary)',
                marginTop: 4,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>
                <UserOutlined style={{ marginRight: 3 }} />
                <code>{candidate.userKey}</code>
              </span>
              <span>·</span>
              <span>{new Date(candidate.createdAt).toLocaleDateString()}</span>
            </div>
          </div>

          <Tag
            color={statusInfo.color}
            style={{
              margin: 0,
              padding: '2px 8px',
              borderRadius: 12,
              fontWeight: 500,
              fontSize: 12,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {statusInfo.icon}
            {statusInfo.badgeText}
          </Tag>
        </div>

        {/* 重点 1：触发场景 / 命中口令 */}
        <div
          style={{
            background: 'var(--bg-secondary)',
            borderRadius: 8,
            padding: '10px 12px',
            marginBottom: 12,
            border: '1px solid var(--border-color)',
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: 'var(--text-secondary)',
              marginBottom: 4,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>🎯 触发意图 / 口令:</span>
            <span style={{ fontSize: 11, color: 'var(--text-light)' }}>
              精确匹配即直通
            </span>
          </div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--text-primary)',
              wordBreak: 'break-all',
              fontFamily: 'monospace',
            }}
          >
            "{candidate.intentKey || candidate.workflowName || '-'}"
          </div>
        </div>

        {/* 重点 2：执行流程步骤 */}
        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              fontSize: 12,
              color: 'var(--text-secondary)',
              marginBottom: 6,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>⚡ 流程动作 ({nodes.length > 0 ? nodes.length : 1} 步)</span>
            <Tooltip title={riskInfo.tooltip}>
              <Tag
                color={riskInfo.color}
                style={{
                  margin: 0,
                  fontSize: 11,
                  borderRadius: 8,
                  padding: '0 6px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                }}
              >
                {riskInfo.icon}
                {riskInfo.text}
              </Tag>
            </Tooltip>
          </div>

          {nodes.length > 0 ? (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {nodes.slice(0, 4).map((node, idx) => (
                <React.Fragment key={node.nodeId || idx}>
                  <Tag
                    bordered={false}
                    style={{
                      margin: 0,
                      padding: '2px 8px',
                      borderRadius: 6,
                      fontSize: 12,
                      background: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-color)',
                      maxWidth: 160,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={node.title || node.skillId || `步骤 ${idx + 1}`}
                  >
                    <span style={{ color: 'var(--text-secondary)', marginRight: 4 }}>
                      {idx + 1}.
                    </span>
                    {node.title || node.skillId || `步骤 ${idx + 1}`}
                  </Tag>
                  {idx < Math.min(nodes.length, 4) - 1 && (
                    <RightOutlined style={{ color: 'var(--text-light)', fontSize: 10 }} />
                  )}
                </React.Fragment>
              ))}
              {nodes.length > 4 && (
                <Tag
                  bordered={false}
                  style={{
                    margin: 0,
                    borderRadius: 6,
                    fontSize: 11,
                    color: 'var(--text-secondary)',
                  }}
                >
                  +{nodes.length - 4} 步
                </Tag>
              )}
            </div>
          ) : (
            <Text type="secondary" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              多步骤工作流计划（版本 v{candidate.savedVersion || 1}）
            </Text>
          )}
        </div>
      </div>

      {/* 卡片底部操作栏 */}
      <div
        style={{
          borderTop: '1px solid var(--border-color)',
          paddingTop: 10,
          marginTop: 'auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Button
          size="small"
          type="link"
          icon={<FileTextOutlined />}
          style={{ padding: 0 }}
          onClick={() => onViewDetail(candidate)}
        >
          查看详情
        </Button>

        <Space size="small">
          {candidate.status === 'active' ? (
            <Button
              size="small"
              danger
              icon={<PauseCircleOutlined />}
              loading={actingId === candidate.id}
              onClick={() => onAction(candidate, 'hold')}
            >
              暂停直通
            </Button>
          ) : candidate.status === 'held' ? (
            <Button
              size="small"
              type="primary"
              icon={<PlayCircleOutlined />}
              loading={actingId === candidate.id}
              onClick={() => onAction(candidate, 'hold')}
            >
              恢复直通
            </Button>
          ) : (
            <Tooltip title="锁定该候选，阻止系统后续批次将其自动激活为直通习惯">
              <Button
                size="small"
                icon={<PauseCircleOutlined />}
                loading={actingId === candidate.id}
                onClick={() => onAction(candidate, 'hold')}
              >
                搁置候选
              </Button>
            </Tooltip>
          )}

          {moreMenuItems.length > 0 && (
            <Dropdown menu={{ items: moreMenuItems }} trigger={['click']} placement="bottomRight">
              <Button size="small" icon={<EllipsisOutlined />} />
            </Dropdown>
          )}
        </Space>
      </div>
    </Card>
  );
};
