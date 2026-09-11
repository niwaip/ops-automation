import React, { useState, useMemo } from 'react';
import { Card, Table, Tag, Space, Button, Typography, Tooltip, Radio } from 'antd';
import {
  PlayCircleOutlined,
  ReloadOutlined,
  ArrowRightOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ExecutionDto, ExecutionStatus } from '@/api/execution';
import {
  buildExecutionStatusLabels,
  EXECUTION_STATUS_COLORS,
} from '@/shared/lib/executionStatusMeta';

const { Text } = Typography;

const summarizeText = (value?: string, maxLength = 38) => {
  if (!value) return '';
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
};

const summarizeExecutionInput = (execution: ExecutionDto) => {
  const prompt = typeof execution.input?.prompt === 'string' ? execution.input.prompt : undefined;
  const objective =
    typeof execution.normalizedInput?.objective === 'string'
      ? execution.normalizedInput.objective
      : undefined;
  const summary = summarizeText(prompt || objective, 40);

  if (summary) {
    return summary;
  }

  if (execution.input && Object.keys(execution.input).length > 0) {
    const keys = Object.keys(execution.input);
    const preview = keys.slice(0, 2).join('、');
    return keys.length > 2 ? `${preview} 等 ${keys.length} 项` : preview;
  }

  return '暂无输入参数';
};

interface AdminRecentExecutionsCardProps {
  executions: ExecutionDto[];
  loading?: boolean;
  skillNameMap: Map<string, string>;
  onRefresh?: () => void;
}

export const AdminRecentExecutionsCard: React.FC<AdminRecentExecutionsCardProps> = ({
  executions,
  loading = false,
  skillNameMap,
  onRefresh,
}) => {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const [filterMode, setFilterMode] = useState<'all' | 'pending' | 'running'>('all');

  const statusColors = EXECUTION_STATUS_COLORS;
  const statusLabels = buildExecutionStatusLabels({
    draft: t('executionStatusDraft'),
    queued: t('executionStatusQueued'),
    running: t('executionStatusRunning'),
    waiting_input: t('executionStatusWaitingInput'),
    pending_approval: t('executionStatusPendingApproval'),
    human_control: t('executionStatusHumanControl'),
    paused: t('executionStatusPaused'),
    succeeded: t('executionStatusSucceeded'),
    failed: t('executionStatusFailed'),
    cancelled: t('executionStatusCancelled'),
    rolled_back: t('executionStatusRolledBack'),
  });

  const getSkillDisplayName = (skillId?: string) => {
    if (!skillId) return '-';
    return skillNameMap.get(skillId) || skillId;
  };

  const filteredExecutions = useMemo(() => {
    if (filterMode === 'pending') {
      return executions.filter(
        (e) => e.status === 'pending_approval' || e.status === 'waiting_input' || e.status === 'human_control'
      );
    }
    if (filterMode === 'running') {
      return executions.filter((e) => e.status === 'running' || e.status === 'queued');
    }
    return executions;
  }, [executions, filterMode]);

  const columns = [
    {
      title: '调用技能',
      dataIndex: 'skillId',
      key: 'skill',
      width: '22%',
      ellipsis: true,
      render: (skillId: string) => (
        <Space direction="vertical" size={2}>
          <Text strong>{getSkillDisplayName(skillId)}</Text>
        </Space>
      ),
    },
    {
      title: '任务输入摘要',
      key: 'inputSummary',
      width: '32%',
      render: (_: unknown, record: ExecutionDto) => (
        <Tooltip title={JSON.stringify(record.input || {}, null, 2)}>
          <Text
            style={{
              display: 'block',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {summarizeExecutionInput(record)}
          </Text>
        </Tooltip>
      ),
    },
    {
      title: '执行状态',
      dataIndex: 'status',
      key: 'status',
      width: '14%',
      render: (status: ExecutionStatus) => (
        <Tag color={statusColors[status]}>{statusLabels[status] || status}</Tag>
      ),
    },
    {
      title: '风险级别',
      dataIndex: 'riskLevel',
      key: 'riskLevel',
      width: '12%',
      render: (riskLevel?: string) => {
        if (!riskLevel || riskLevel === 'low') {
          return <Tag color="green">低风险</Tag>;
        }
        if (riskLevel === 'medium') {
          return <Tag color="orange">中风险</Tag>;
        }
        if (riskLevel === 'high') {
          return <Tag color="red">高风险</Tag>;
        }
        return <Tag>{riskLevel}</Tag>;
      },
    },
    {
      title: '提交时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: '18%',
      render: (createdAt: string) => new Date(createdAt).toLocaleString(),
    },
    {
      title: '操作',
      key: 'action',
      width: '8%',
      render: (_: unknown, record: ExecutionDto) => (
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/executions/${record.id}`);
          }}
        >
          查看
        </Button>
      ),
    },
  ];

  return (
    <Card
      title={
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            width: '100%',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <Space size={8} align="center">
            <PlayCircleOutlined style={{ color: 'var(--primary-color)' }} />
            <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>
              任务执行监控与风险审计
            </span>
          </Space>

          <Space size={10} wrap>
            <Radio.Group
              value={filterMode}
              onChange={(e) => setFilterMode(e.target.value)}
              buttonStyle="solid"
              size="small"
            >
              <Radio.Button value="all">全部记录</Radio.Button>
              <Radio.Button value="pending">需审批干预</Radio.Button>
              <Radio.Button value="running">运行中</Radio.Button>
            </Radio.Group>

            {onRefresh && (
              <Button size="small" icon={<ReloadOutlined />} onClick={onRefresh}>
                刷新
              </Button>
            )}

            <Button
              type="link"
              size="small"
              icon={<ArrowRightOutlined />}
              onClick={() => navigate('/executions')}
            >
              查看全量执行
            </Button>
          </Space>
        </div>
      }
      styles={{ body: { padding: '16px 20px' } }}
      style={{
        borderRadius: 16,
        border: '1px solid var(--border-color)',
        background: 'var(--bg-card)',
        boxShadow: 'var(--shadow-md)',
      }}
    >
      <Table
        columns={columns}
        dataSource={filteredExecutions}
        rowKey="id"
        loading={loading}
        pagination={false}
        size="middle"
        tableLayout="fixed"
        onRow={(record: ExecutionDto) => ({
          style: { cursor: 'pointer' },
          onClick: () => navigate(`/executions/${record.id}`),
        })}
      />
    </Card>
  );
};
