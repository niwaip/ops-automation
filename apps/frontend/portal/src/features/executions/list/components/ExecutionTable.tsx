import React from 'react';
import {
  Card,
  Table,
  Tag,
  Space,
  Typography,
  Tooltip,
  Button,
  message,
} from 'antd';
import {
  CopyOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  RightOutlined,
  BranchesOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

import type { ColumnsType } from 'antd/es/table';
import type { ExecutionDto } from '@/api/execution';
import {
  formatDuration,
  formatListDateTime,
  getRiskBadgeStyle,
} from '@/features/executions/list/listView';
import { summarizeExecutionListInput } from '@/features/executions/list/listHelpers';
import { summarizeExecutionListResult } from '@ops/user-core';
import {
  EXECUTION_STATUS_COLORS,
  EXECUTION_STATUS_LABELS_ZH,
} from '@/shared/lib/executionStatusMeta';

const { Text } = Typography;

interface ExecutionTableProps {
  executions: ExecutionDto[];
  total: number;
  loading: boolean;
  page: number;
  pageSize: number;
  isDarkTheme: boolean;
  skillNameMap: Map<string, string>;
  onPageChange: (page: number, pageSize: number) => void;
  onRowClick: (record: ExecutionDto) => void;
  onOpenTakeover?: (record: ExecutionDto) => void;
}

const statusColors = EXECUTION_STATUS_COLORS;
const statusLabels = EXECUTION_STATUS_LABELS_ZH;

const listStatusLabels: Record<string, string> = {
  running: '执行中',
  waiting_input: '待补输入',
  pending_approval: '待审批',
  human_control: '人工接管',
  succeeded: '已完成',
  failed: '执行失败',
  cancelled: '已取消',
};

const getExecutionTime = (record: ExecutionDto) => {
  const source = record.startedAt || record.createdAt;
  return source ? new Date(source).getTime() : 0;
};

export const ExecutionTable: React.FC<ExecutionTableProps> = ({
  executions,
  total,
  loading,
  page,
  pageSize,
  isDarkTheme,
  skillNameMap,
  onPageChange,
  onRowClick,
}) => {
  const navigate = useNavigate();
  const getSkillDisplayName = (skillId?: string) => {
    if (!skillId) return '-';
    return skillNameMap.get(skillId) || skillId;
  };

  const handleCopyId = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id).then(() => {
      message.success('已复制任务 ID 到剪贴板');
    });
  };

  const columns: ColumnsType<ExecutionDto> = [
    {
      title: '执行任务 / 技能',
      key: 'skill',
      width: 230,
      render: (_, record) => {
        const displayName = getSkillDisplayName(record.skillId);
        const shortId = record.id.slice(0, 8);
        return (
          <Space direction="vertical" size={2} style={{ width: '100%' }}>
            <Space size={8} align="center">
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  background: 'rgba(24, 144, 255, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#1890ff',
                }}
              >
                <ThunderboltOutlined style={{ fontSize: 14 }} />
              </div>
              <Text
                strong
                style={{
                  fontSize: 14,
                  maxWidth: 160,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  display: 'inline-block',
                }}
                ellipsis={{ tooltip: displayName }}
              >
                {displayName}
              </Text>
            </Space>

            <Space size={4} style={{ marginLeft: 36 }}>
              <Text type="secondary" style={{ fontSize: 11, fontFamily: 'monospace' }}>
                #{shortId}
              </Text>
              <Tooltip title="复制完整任务 ID">
                <Button
                  type="text"
                  size="small"
                  icon={<CopyOutlined style={{ fontSize: 11, color: '#8c8c8c' }} />}
                  onClick={(e) => handleCopyId(e, record.id)}
                  style={{ padding: '0 2px', height: 16 }}
                />
              </Tooltip>
            </Space>
          </Space>
        );
      },
    },
    {
      title: '当前状态与耗时',
      key: 'status',
      width: 140,
      render: (_, record) => {
        const isRunning = record.status === 'running';
        const label = listStatusLabels[record.status] || statusLabels[record.status] || record.status;
        return (
          <Space direction="vertical" size={2}>
            <Tag
              color={statusColors[record.status]}
              style={{
                borderRadius: 999,
                padding: '2px 10px',
                fontWeight: 600,
                fontSize: 12,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              {isRunning && <span className="pulse-dot" style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#1890ff' }} />}
              {label}
            </Tag>
            <Text type="secondary" style={{ fontSize: 12, paddingLeft: 2 }}>
              {formatDuration(record)}
            </Text>
          </Space>
        );
      },
    },
    {
      title: '触发指令 / 输入',
      key: 'input',
      width: 240,
      render: (_, record) => {
        const inputSummary = summarizeExecutionListInput(record);
        return (
          <Tooltip title={inputSummary} placement="topLeft">
            <Text
              style={{
                display: 'block',
                maxWidth: 220,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                fontSize: 13,
              }}
            >
              {inputSummary || '-'}
            </Text>
          </Tooltip>
        );
      },
    },
    {
      title: '结果现场 / 产物',
      key: 'result',
      width: 260,
      render: (_, record) => {
        const resultText = summarizeExecutionListResult(record);
        const isFailed = record.status === 'failed';
        const isAttention = ['waiting_input', 'pending_approval', 'human_control'].includes(record.status);
        const isSucceeded = record.status === 'succeeded';

        if (isFailed) {
          return (
            <Space size={6} align="start">
              <CloseCircleOutlined style={{ color: '#ff4d4f', marginTop: 3, flexShrink: 0 }} />
              <Tooltip title={resultText} placement="topLeft">
                <Text
                  type="danger"
                  style={{
                    display: 'block',
                    maxWidth: 230,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  {resultText || '执行过程异常终止'}
                </Text>
              </Tooltip>
            </Space>
          );
        }

        if (isAttention) {
          return (
            <Text type="secondary" style={{ fontSize: 13 }}>
              {resultText || (record.status === 'pending_approval'
                ? '等待审批'
                : record.status === 'human_control'
                ? '人工处理中'
                : '待补充入参')}
            </Text>
          );
        }

        if (isSucceeded) {
          return (
            <Space size={6} align="start">
              <CheckCircleOutlined style={{ color: '#52c41a', marginTop: 3, flexShrink: 0 }} />
              <Tooltip title={resultText} placement="topLeft">
                <Text
                  style={{
                    display: 'block',
                    maxWidth: 230,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    fontSize: 13,
                  }}
                >
                  {resultText || '执行顺利完成'}
                </Text>
              </Tooltip>
            </Space>
          );
        }

        return (
          <Text type="secondary" style={{ fontSize: 13 }}>
            {resultText || '-'}
          </Text>
        );
      },
    },
    {
      title: '风险级别',
      dataIndex: 'riskLevel',
      key: 'riskLevel',
      width: 90,
      align: 'center',
      render: (riskLevel?: string) =>
        riskLevel ? (
          <span
            style={{
              ...getRiskBadgeStyle(riskLevel),
              display: 'inline-block',
              padding: '2px 8px',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {riskLevel}
          </span>
        ) : (
          <Text type="secondary">-</Text>
        ),
    },
    {
      title: '开始时间',
      dataIndex: 'startedAt',
      key: 'startedAt',
      width: 150,
      sorter: (a, b) => getExecutionTime(a) - getExecutionTime(b),
      render: (_, record) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {formatListDateTime(record.startedAt || record.createdAt)}
        </Text>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 175,
      fixed: 'right',
      render: (_, record) => {
        const isFailed = record.status === 'failed';
        return (
          <Space size={4} onClick={(e) => e.stopPropagation()}>
            {isFailed ? (
              <Button
                type="primary"
                size="small"
                danger
                icon={<ExclamationCircleOutlined />}
                onClick={() => onRowClick(record)}
              >
                排障详情
              </Button>
            ) : (
              <Button
                type="link"
                size="small"
                icon={<RightOutlined />}
                onClick={() => onRowClick(record)}
              >
                审计详情
              </Button>
            )}
            <Tooltip title="直接打开全屏链路追踪瀑布流">
              <Button
                type="text"
                size="small"
                icon={<BranchesOutlined style={{ color: '#1677ff' }} />}
                onClick={() => navigate(`/executions/${record.id}?tab=trace`)}
              >
                链路
              </Button>
            </Tooltip>
          </Space>
        );
      },
    },
  ];

  return (
    <Card
      style={{
        borderRadius: 14,
        border: '1px solid var(--bg-secondary)',
        background: 'var(--bg-card)',
      }}
      styles={{ body: { padding: '16px 20px' } }}
    >
      <Table
        columns={columns}
        dataSource={executions}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1100 }}
        locale={{
          emptyText: '暂无符合筛选条件的任务记录',
        }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (tTotal) => `共 ${tTotal} 条审计记录`,
          onChange: onPageChange,
        }}
        onRow={(record) => ({
          style: {
            cursor: 'pointer',
            transition: 'background 0.2s ease',
            background: record.status === 'failed'
              ? (isDarkTheme ? 'rgba(239, 68, 68, 0.08)' : '#fffafa')
              : undefined,
          },
          onClick: () => onRowClick(record),
        })}
      />
    </Card>
  );
};
