import React from 'react';
import {
  Card,
  Table,
  Tag,
  Button,
  Space,
  Typography,
  Tooltip,
  Popconfirm,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  EyeOutlined,
  EditOutlined,
  RocketOutlined,
  DeleteOutlined,
  CopyOutlined,
  GlobalOutlined,
  ApartmentOutlined,
  NodeIndexOutlined,
} from '@ant-design/icons';
import type { CapabilityRelease } from '@/api/capabilities';
import {
  getSourceTypeLabel,
  statusColor,
  getNextStepHint,
  canEnterReleaseCenter,
} from '../utils/capabilitiesHelpers';

const { Text } = Typography;

export interface CapabilityListTableProps {
  filteredReleases: CapabilityRelease[];
  isLoading: boolean;
  onSelectRelease: (id: string, mode: 'view' | 'edit') => void;
  onOpenDeployModal: (id: string) => void;
  onArchiveRelease: (id: string) => void;
}

export const CapabilityListTable: React.FC<CapabilityListTableProps> = ({
  filteredReleases,
  isLoading,
  onSelectRelease,
  onOpenDeployModal,
  onArchiveRelease,
}) => {
  const handleCopyId = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id).then(() => {
      message.success('已复制发布版本 ID 到剪贴板');
    });
  };

  const getSourceIcon = (sourceType: string) => {
    switch (sourceType) {
      case 'temporal_workflow':
        return <ApartmentOutlined style={{ color: '#722ed1', fontSize: 16 }} />;
      case 'browser_recording':
        return <GlobalOutlined style={{ color: '#13c2c2', fontSize: 16 }} />;
      case 'execution_flow_template':
      default:
        return <NodeIndexOutlined style={{ color: '#1890ff', fontSize: 16 }} />;
    }
  };

  const columns: ColumnsType<CapabilityRelease> = [
    {
      title: '流程资产名称与 ID',
      key: 'sourceName',
      width: 250,
      render: (_, record) => {
        const displayName = record.sourceName || record.sourceId || '未命名流程';
        const versionText = `v${record.releaseVersion || 1}`;

        return (
          <Space align="start" size={10}>
            <div style={{ marginTop: 2 }}>{getSourceIcon(record.sourceType)}</div>
            <Space direction="vertical" size={2}>
              <Space size={6} wrap>
                <Text
                  strong
                  style={{
                    fontSize: 14,
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                  }}
                  onClick={() => onSelectRelease(record.id, 'view')}
                >
                  {displayName}
                </Text>
                <Tag color="blue" style={{ fontSize: 11, margin: 0, padding: '0 5px' }}>
                  {versionText}
                </Tag>
              </Space>

              <Space size={6}>
                <Text type="secondary" style={{ fontSize: 11, fontFamily: 'monospace' }}>
                  #{record.id.slice(0, 10)}
                </Text>
                <Tooltip title="复制发布版本 ID">
                  <Button
                    type="text"
                    size="small"
                    icon={<CopyOutlined style={{ fontSize: 11, color: 'var(--text-secondary)' }} />}
                    onClick={(e) => handleCopyId(e, record.id)}
                    style={{ width: 16, height: 16, padding: 0 }}
                  />
                </Tooltip>
              </Space>
            </Space>
          </Space>
        );
      },
    },
    {
      title: '源资产类型',
      dataIndex: 'sourceType',
      key: 'sourceType',
      width: 140,
      render: (value: string) => {
        const isTemporal = value === 'temporal_workflow';
        const isBrowser = value === 'browser_recording';
        return (
          <Tag
            color={isTemporal ? 'purple' : isBrowser ? 'cyan' : 'blue'}
            style={{ borderRadius: 6, padding: '2px 8px' }}
          >
            {getSourceTypeLabel(value)}
          </Tag>
        );
      },
    },
    {
      title: '发布状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (value: string) => (
        <Tag color={statusColor(value)} style={{ borderRadius: 6, padding: '2px 8px' }}>
          {value}
        </Tag>
      ),
    },
    {
      title: '审批状态',
      dataIndex: 'approvalStatus',
      key: 'approvalStatus',
      width: 120,
      render: (value: string) => {
        const isApproved = value === 'approved';
        return (
          <Tag color={isApproved ? 'green' : 'gold'} style={{ borderRadius: 6, padding: '2px 8px' }}>
            {isApproved ? '已审批通过' : value || '待审批'}
          </Tag>
        );
      },
    },
    {
      title: '部署状态与环境',
      key: 'deploymentStatus',
      width: 160,
      render: (_, record) => {
        const status = record.deploymentStatus || '未部署';
        const env = record.lastDeploymentEnvironment;
        const isDeployed = status === 'deployed' || status === 'succeeded';

        return (
          <Space direction="vertical" size={2}>
            <Tag color={statusColor(status)} style={{ borderRadius: 6, padding: '2px 8px', margin: 0 }}>
              {isDeployed ? '已部署运行' : status}
            </Tag>
            {env && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                环境: <Text code style={{ fontSize: 11 }}>{env}</Text>
              </Text>
            )}
          </Space>
        );
      },
    },
    {
      title: '下一步行动指引',
      key: 'nextStepHint',
      width: 150,
      render: (_, record) => {
        const hint = getNextStepHint(record);
        return (
          <Tag
            color={hint.color}
            style={{
              borderRadius: 6,
              padding: '2px 8px',
              fontWeight: 500,
            }}
          >
            {hint.label}
          </Tag>
        );
      },
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 150,
      sorter: (a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime(),
      render: (value: string) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {new Date(value).toLocaleString()}
        </Text>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 220,
      fixed: 'right',
      render: (_, record) => (
        <Space size={6} onClick={(e) => e.stopPropagation()}>
          <Button
            size="small"
            type="primary"
            icon={<EditOutlined />}
            onClick={() => onSelectRelease(record.id, 'edit')}
          >
            发布中心
          </Button>

          {canEnterReleaseCenter(record) && (
            <Button
              size="small"
              icon={<RocketOutlined style={{ color: '#52c41a' }} />}
              onClick={() => onOpenDeployModal(record.id)}
            >
              部署
            </Button>
          )}

          <Button
            size="small"
            type="link"
            icon={<EyeOutlined />}
            onClick={() => onSelectRelease(record.id, 'view')}
          >
            详情
          </Button>

          <Popconfirm
            title="确认归档删除该流程发布？"
            description="归档后流程将从在线列表移除，历史构建与验证记录仍将保留。"
            onConfirm={() => onArchiveRelease(record.id)}
            okText="确认归档"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Tooltip title="归档删除本流程发布">
              <Button
                size="small"
                type="text"
                danger
                icon={<DeleteOutlined />}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
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
        rowKey="id"
        dataSource={filteredReleases}
        columns={columns}
        loading={isLoading}
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 条流程发布记录`,
        }}
        scroll={{ x: 1200 }}
        locale={{
          emptyText: '暂无符合筛选条件的流程发布记录',
        }}
      />
    </Card>
  );
};

export default CapabilityListTable;
