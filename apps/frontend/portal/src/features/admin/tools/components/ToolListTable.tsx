import React from 'react';
import { Button, Space, Table, Tag, Tooltip, Typography } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  CodeOutlined,
  EditOutlined,
  EyeOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import type { ToolCatalogItem } from '@/api/tool-catalog';
import {
  CATEGORY_COLORS,
  RISK_META,
  STATUS_META,
  promptExposureMeta,
} from '../constants/toolConstants';

const { Text } = Typography;

interface ToolListTableProps {
  dataSource: ToolCatalogItem[];
  loading: boolean;
  onOpenDetail: (toolName: string) => void;
  onQuickToggleStatus: (tool: ToolCatalogItem) => void;
  onQuickToggleBinding: (tool: ToolCatalogItem) => void;
}

export const ToolListTable: React.FC<ToolListTableProps> = ({
  dataSource,
  loading,
  onOpenDetail,
  onQuickToggleStatus,
  onQuickToggleBinding,
}) => {
  const navigate = useNavigate();

  const columns: ColumnsType<ToolCatalogItem> = [
    {
      title: '能力标识 / 显示名称',
      key: 'identity',
      width: 260,
      fixed: 'left',
      render: (_, record) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Space size={6}>
            <span
              style={{
                fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace',
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--ant-primary-color, #1677ff)',
                cursor: 'pointer',
              }}
              onClick={() => onOpenDetail(record.name)}
            >
              {record.name}
            </span>
          </Space>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Text strong style={{ fontSize: 13 }}>
              {record.displayName}
            </Text>
          </div>
          {record.description && (
            <Text type="secondary" ellipsis={{ tooltip: record.description }} style={{ fontSize: 12, maxWidth: 240 }}>
              {record.description}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: '类别 / 运行时',
      key: 'classification',
      width: 170,
      render: (_, record) => (
        <Space direction="vertical" size={4}>
          {record.category ? (
            <Tag color={CATEGORY_COLORS[record.category] || 'default'} style={{ borderRadius: 6, margin: 0 }}>
              {record.category}
            </Tag>
          ) : (
            <Text type="secondary">-</Text>
          )}
          {record.runtimeType && (
            <Tag style={{ borderRadius: 6, margin: 0, background: 'var(--bg-secondary)', border: 'none' }}>
              <CodeOutlined style={{ marginRight: 4 }} />
              {record.runtimeType}
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: '运行状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (status: ToolCatalogItem['status']) => {
        const meta = STATUS_META[status] || STATUS_META.active;
        return (
          <Tag color={meta.color} style={{ borderRadius: 6 }}>
            {meta.label}
          </Tag>
        );
      },
    },
    {
      title: '风险等级',
      dataIndex: 'riskLevel',
      key: 'riskLevel',
      width: 130,
      render: (riskLevel: ToolCatalogItem['riskLevel']) => {
        const meta = RISK_META[riskLevel] || RISK_META.L0;
        return (
          <Tooltip title={meta.desc}>
            <Tag
              style={{
                color: meta.color,
                borderColor: meta.border,
                background: meta.bg,
                fontWeight: 600,
                borderRadius: 6,
                cursor: 'help',
              }}
            >
              <SafetyCertificateOutlined style={{ marginRight: 4 }} />
              {riskLevel}
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      title: '大模型 Prompt 暴露',
      dataIndex: 'promptExposure',
      key: 'promptExposure',
      width: 170,
      render: (value) => {
        const meta = promptExposureMeta(value);
        return (
          <Tooltip title={meta.desc}>
            <Tag color={meta.tagColor} style={{ borderRadius: 6 }}>
              <EyeOutlined style={{ marginRight: 4 }} />
              {meta.label.split(' ')[0]}
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      title: 'Skill 绑定门禁',
      dataIndex: 'allowSkillBinding',
      key: 'allowSkillBinding',
      width: 120,
      render: (allowed: boolean) =>
        allowed ? (
          <Tag color="success" style={{ borderRadius: 6 }}>
            <CheckCircleOutlined style={{ marginRight: 3 }} />
            允许绑定
          </Tag>
        ) : (
          <Tag color="error" style={{ borderRadius: 6 }}>
            <CloseCircleOutlined style={{ marginRight: 3 }} />
            禁止绑定
          </Tag>
        ),
    },
    {
      title: '关联 Skill 影响面',
      key: 'usageSummary',
      width: 130,
      render: (_, record) => {
        const count = record.usageSummary?.boundSkillCount || 0;
        return count > 0 ? (
          <Tooltip title="点击在技能管理中查看所有引用的 Skill">
            <Button
              type="link"
              size="small"
              icon={<ThunderboltOutlined style={{ color: '#722ed1' }} />}
              style={{ padding: 0, fontWeight: 600 }}
              onClick={() => navigate(`/admin/skills?q=${encodeURIComponent(record.name)}`)}
            >
              {count} 个 Skill
            </Button>
          </Tooltip>
        ) : (
          <Text type="secondary" style={{ fontSize: 13 }}>
            0
          </Text>
        );
      },
    },
    {
      title: '干预门禁',
      key: 'policy',
      width: 130,
      render: (_, record) => (
        <Space size={4} wrap>
          {record.defaultRequiresConfirmation && (
            <Tag color="warning" style={{ borderRadius: 6 }}>
              需确认
            </Tag>
          )}
          {record.defaultRequiresApproval && (
            <Tag color="error" style={{ borderRadius: 6 }}>
              <LockOutlined style={{ marginRight: 2 }} />
              需审批
            </Tag>
          )}
          {!record.defaultRequiresConfirmation && !record.defaultRequiresApproval && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              直通执行
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 160,
      render: (value?: string) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {value ? new Date(value).toLocaleString() : '-'}
        </Text>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 220,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => onOpenDetail(record.name)}
          >
            治理
          </Button>
          <Button
            type="link"
            size="small"
            danger={record.status === 'active'}
            onClick={() => onQuickToggleStatus(record)}
          >
            {record.status === 'active' ? '禁用' : '启用'}
          </Button>
          <Button
            type="link"
            size="small"
            onClick={() => onQuickToggleBinding(record)}
          >
            {record.allowSkillBinding ? '禁止绑定' : '允许绑定'}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Table
      rowKey="name"
      loading={loading}
      columns={columns}
      dataSource={dataSource}
      scroll={{ x: 1540 }}
      pagination={{
        pageSize: 10,
        showSizeChanger: true,
        pageSizeOptions: ['10', '20', '50'],
        showTotal: (total) => `共 ${total} 项模型原子能力`,
      }}
      style={{
        borderRadius: 12,
        overflow: 'hidden',
      }}
    />
  );
};
