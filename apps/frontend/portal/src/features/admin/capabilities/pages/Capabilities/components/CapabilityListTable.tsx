import React from 'react';
import { Table, Tag, Button, Space, Typography, Tooltip, Input } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  SearchOutlined,
  ReloadOutlined,
  AppstoreAddOutlined,
  EyeOutlined,
  EditOutlined,
  RocketOutlined,
  DeleteOutlined,
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
  searchText: string;
  setSearchText: (text: string) => void;
  filteredReleases: CapabilityRelease[];
  isLoading: boolean;
  onRefresh: () => void;
  onOpenCreateModal: () => void;
  onSelectRelease: (id: string, mode: 'view' | 'edit') => void;
  onOpenDeployModal: (id: string) => void;
  onArchiveRelease: (id: string) => void;
  isStudioMode?: boolean;
}

export const CapabilityListTable: React.FC<CapabilityListTableProps> = ({
  searchText,
  setSearchText,
  filteredReleases,
  isLoading,
  onRefresh,
  onOpenCreateModal,
  onSelectRelease,
  onOpenDeployModal,
  onArchiveRelease,
  isStudioMode = false,
}) => {
  const columns: ColumnsType<CapabilityRelease> = [
    {
      title: <div style={{ textAlign: 'center' }}>能力名称</div>,
      dataIndex: 'sourceName',
      key: 'sourceName',
      width: 170,
      align: 'center',
      render: (value: string | null | undefined, record) => {
        const displayName = value || record.sourceId || '未命名';
        return (
          <Button
            type="link"
            size="small"
            style={{ padding: 0, maxWidth: 140 }}
            onClick={() => onSelectRelease(record.id, 'view')}
          >
            <Text style={{ maxWidth: 140 }} ellipsis={{ tooltip: displayName }}>
              {displayName}
            </Text>
          </Button>
        );
      },
    },
    {
      title: <div style={{ textAlign: 'center' }}>类型</div>,
      dataIndex: 'sourceType',
      key: 'sourceType',
      width: 120,
      align: 'center',
      render: (value: string) => (
        <Tag
          color={
            value === 'temporal_workflow'
              ? 'purple'
              : value === 'browser_recording'
                ? 'cyan'
                : 'blue'
          }
        >
          {getSourceTypeLabel(value)}
        </Tag>
      ),
    },
    {
      title: <div style={{ textAlign: 'center' }}>状态</div>,
      dataIndex: 'status',
      key: 'status',
      width: 120,
      align: 'center',
      render: (value: string) => <Tag color={statusColor(value)}>{value}</Tag>,
    },
    {
      title: <div style={{ textAlign: 'center' }}>审批状态</div>,
      dataIndex: 'approvalStatus',
      key: 'approvalStatus',
      width: 120,
      align: 'center',
      render: (value: string) => <Tag color={value === 'approved' ? 'green' : 'gold'}>{value}</Tag>,
    },
    {
      title: <div style={{ textAlign: 'center' }}>部署状态</div>,
      key: 'deploymentStatus',
      width: 180,
      align: 'center',
      render: (_, record) => {
        const status = record.deploymentStatus || '未部署';
        const env = record.lastDeploymentEnvironment;
        return (
          <Space direction="vertical" size={0} style={{ width: '100%', textAlign: 'center' }}>
            {env && (
              <div style={{ fontSize: 11, color: 'var(--text-light)', marginBottom: 2 }}>
                环境: <Text strong>{env}</Text>
              </div>
            )}
            <Tag color={statusColor(status)} style={{ margin: 0 }}>
              {status}
            </Tag>
          </Space>
        );
      },
    },
    {
      title: <div style={{ textAlign: 'center' }}>下一步指引</div>,
      key: 'nextStepHint',
      width: 160,
      align: 'center',
      render: (_, record) => {
        const hint = getNextStepHint(record);
        return <Tag color={hint.color}>{hint.label}</Tag>;
      },
    },
    {
      title: <div style={{ textAlign: 'center' }}>更新时间</div>,
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 160,
      align: 'center',
      render: (value: string) => new Date(value).toLocaleString(),
    },
    {
      title: <div style={{ textAlign: 'center' }}>操作</div>,
      key: 'actions',
      width: 280,
      align: 'center',
      render: (_, record) => (
        <Space size="small" style={{ justifyContent: 'center', width: '100%' }}>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => onSelectRelease(record.id, 'view')}
          >
            查看
          </Button>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => onSelectRelease(record.id, 'edit')}
          >
            发布中心
          </Button>
          {canEnterReleaseCenter(record) && (
            <Button
              size="small"
              type="primary"
              ghost
              icon={<RocketOutlined />}
              onClick={() => onOpenDeployModal(record.id)}
            >
              部署
            </Button>
          )}
          <Tooltip title="归档删除本 Capability Release">
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => onArchiveRelease(record.id)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <Space size="middle">
          <Input
            placeholder="搜索能力名称、类型、状态..."
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />
        </Space>
        <Space size="small">
          <Button icon={<ReloadOutlined />} onClick={onRefresh}>
            刷新
          </Button>
          {!isStudioMode && (
            <Button type="primary" icon={<AppstoreAddOutlined />} onClick={onOpenCreateModal}>
              创建 Capability Release
            </Button>
          )}
        </Space>
      </div>

      <Table
        rowKey="id"
        dataSource={filteredReleases}
        columns={columns}
        loading={isLoading}
        pagination={{ pageSize: 10, showSizeChanger: true }}
        size="middle"
        bordered
      />
    </div>
  );
};
