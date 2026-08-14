import { Button, Empty, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { LlmOperationCatalogEntry } from '../types';

const { Text } = Typography;

const formatDigestShort = (digest: string): string => {
  if (!digest) return '-';
  const parts = digest.split(':');
  const hash = parts.length > 1 ? parts[1] : digest;
  return hash.substring(0, 12);
};

const getStatusColor = (status: LlmOperationCatalogEntry['lifecycle']['status']): string => {
  switch (status) {
    case 'active':
      return 'success';
    case 'deprecated':
      return 'warning';
    case 'disabled':
      return 'error';
    default:
      return 'default';
  }
};

const getStatusLabel = (status: LlmOperationCatalogEntry['lifecycle']['status']): string => {
  switch (status) {
    case 'active':
      return '活跃';
    case 'deprecated':
      return '已弃用';
    case 'disabled':
      return '已禁用';
    default:
      return status;
  }
};

interface LlmOperationListProps {
  entries: LlmOperationCatalogEntry[];
  loading?: boolean;
  onManage?: (entry: LlmOperationCatalogEntry) => void;
}

export function LlmOperationList({ entries, loading, onManage }: LlmOperationListProps) {
  const columns: ColumnsType<LlmOperationCatalogEntry> = [
    {
      title: '名称 / Operation ID',
      key: 'name',
      width: 240,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Text strong>{record.displayName}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.capabilityRef.id}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Production 版本',
      dataIndex: ['capabilityRef', 'version'],
      key: 'version',
      width: 140,
      render: (version: string) => <Tag color="blue">{version || '-'}</Tag>,
    },
    {
      title: 'Digest 短码',
      dataIndex: ['capabilityRef', 'digest'],
      key: 'digest',
      width: 160,
      render: (digest: string) => (
        <code
          style={{
            fontSize: 12,
            padding: '2px 6px',
            background: 'var(--bg-secondary)',
            borderRadius: 4,
          }}
        >
          {formatDigestShort(digest)}
        </code>
      ),
    },
    {
      title: '状态',
      dataIndex: ['lifecycle', 'status'],
      key: 'status',
      width: 100,
      render: (status: LlmOperationCatalogEntry['lifecycle']['status']) => (
        <Tag color={getStatusColor(status)}>{getStatusLabel(status)}</Tag>
      ),
    },
    {
      title: '目标',
      dataIndex: 'summary',
      key: 'summary',
      ellipsis: true,
      render: (summary: string) => (
        <Tooltip title={summary}>
          <Text type="secondary">{summary || '-'}</Text>
        </Tooltip>
      ),
    },
    {
      title: '管理',
      key: 'manage',
      width: 100,
      fixed: 'right',
      render: (_, record) => (
        <Button type="link" onClick={() => onManage?.(record)}>
          版本 / Prompt
        </Button>
      ),
    },
  ];

  return (
    <Table
      rowKey={(record) => record.capabilityRef.id}
      columns={columns}
      dataSource={entries}
      loading={loading}
      pagination={false}
      locale={{
        emptyText: (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无 LLM Operation"
          />
        ),
      }}
      scroll={{ x: 920 }}
    />
  );
}
