import React from 'react';
import { Table, Tag, Space, Button, Typography, Tooltip, Badge, Popconfirm, Dropdown } from 'antd';
import {
  EditOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  EyeOutlined,
  CopyOutlined,
  ExportOutlined,
  SettingOutlined,
  FileTextOutlined,
  CodeOutlined,
  ToolOutlined,
  ApiOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  ExecutionFlowTemplateDTO,
  ExecutionFlowStep,
  EXECUTION_FLOW_CATEGORIES,
} from '@/api/flows';
import { renderValidationScore } from './flowHelpers';

const { Text } = Typography;

export interface FlowListTableProps {
  templates: ExecutionFlowTemplateDTO[];
  isLoading: boolean;
  onEdit: (template: ExecutionFlowTemplateDTO) => void;
  onViewDetail: (template: ExecutionFlowTemplateDTO) => void;
  onValidate: (template: ExecutionFlowTemplateDTO) => void;
  onClone: (template: ExecutionFlowTemplateDTO) => void;
  onExport: (template: ExecutionFlowTemplateDTO) => void;
  onDelete: (id: string) => void;
}

const renderStepMiniIcon = (type: string) => {
  switch (type) {
    case 'api':
      return <ApiOutlined style={{ color: '#52c41a', fontSize: 13 }} />;
    case 'script':
      return <CodeOutlined style={{ color: '#fa8c16', fontSize: 13 }} />;
    case 'tool':
      return <ToolOutlined style={{ color: '#1890ff', fontSize: 13 }} />;
    case 'llm':
      return <FileTextOutlined style={{ color: '#8b5cf6', fontSize: 13 }} />;
    case 'validator':
      return <CheckCircleOutlined style={{ color: '#13c2c2', fontSize: 13 }} />;
    default:
      return <FileTextOutlined style={{ color: 'var(--text-secondary)', fontSize: 13 }} />;
  }
};

export const FlowListTable: React.FC<FlowListTableProps> = ({
  templates,
  isLoading,
  onEdit,
  onViewDetail,
  onValidate,
  onClone,
  onExport,
  onDelete,
}) => {
  const columns: ColumnsType<ExecutionFlowTemplateDTO> = [
    {
      title: '工作流组合名称与目标',
      dataIndex: 'name',
      key: 'name',
      width: 280,
      render: (name: string, record: ExecutionFlowTemplateDTO) => {
        const keys = record.executionFlowKeys || [];
        return (
          <Space direction="vertical" size={3}>
            <a
              onClick={() => onViewDetail(record)}
              style={{ fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
            >
              {name}
            </a>
            {record.goal ? (
              <Text
                type="secondary"
                ellipsis={{ tooltip: record.goal }}
                style={{ maxWidth: 260, fontSize: 12 }}
              >
                目标: {record.goal}
              </Text>
            ) : record.description ? (
              <Text
                type="secondary"
                ellipsis={{ tooltip: record.description }}
                style={{ maxWidth: 260, fontSize: 12 }}
              >
                {record.description}
              </Text>
            ) : null}
            {keys.length > 0 && (
              <Space size={4} wrap>
                {keys.slice(0, 3).map((k) => (
                  <Tag key={k} color="purple" style={{ fontSize: 11, margin: 0 }}>
                    {k}
                  </Tag>
                ))}
                {keys.length > 3 && (
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    +{keys.length - 3}
                  </Text>
                )}
              </Space>
            )}
          </Space>
        );
      },
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 120,
      render: (category: string) => {
        const info = EXECUTION_FLOW_CATEGORIES[category] || {
          label: category || '通用',
          color: 'default',
          desc: '',
        };
        return (
          <Tooltip title={info.desc}>
            <Tag color={info.color}>{info.label}</Tag>
          </Tooltip>
        );
      },
    },
    {
      title: '编排步骤与拓扑',
      key: 'steps',
      width: 220,
      render: (_, record) => {
        const steps: ExecutionFlowStep[] = record.steps || [];
        if (steps.length === 0) {
          return <Text type="secondary">暂无步骤</Text>;
        }
        return (
          <Space size={6} align="center">
            <Badge
              count={steps.length}
              style={{ backgroundColor: 'var(--primary-color)' }}
              title={`共 ${steps.length} 个执行步骤`}
            />
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              {steps.slice(0, 4).map((s, idx) => (
                <Tooltip
                  key={idx}
                  title={`步骤 ${idx + 1}: ${s.name || '未命名'} (${s.type})`}
                >
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      background: 'var(--bg-secondary)',
                      padding: '2px 4px',
                      borderRadius: 4,
                    }}
                  >
                    {renderStepMiniIcon(s.type)}
                  </span>
                  {idx < Math.min(steps.length - 1, 3) && (
                    <Text type="secondary" style={{ fontSize: 9, margin: '0 1px' }}>
                      ➔
                    </Text>
                  )}
                </Tooltip>
              ))}
              {steps.length > 4 && (
                <Text type="secondary" style={{ fontSize: 11 }}>
                  +{steps.length - 4}
                </Text>
              )}
            </div>
          </Space>
        );
      },
    },
    {
      title: 'AI 验证质量',
      key: 'validation',
      width: 110,
      render: (_, record) => renderValidationScore(record.validation),
    },
    {
      title: '复用统计',
      dataIndex: 'usageCount',
      key: 'usageCount',
      width: 100,
      render: (count: number, record: ExecutionFlowTemplateDTO) => (
        <Space direction="vertical" size={2}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            调用: {count || 0} 次
          </Text>
          <Tag color={record.isPublic ? 'green' : 'default'} style={{ fontSize: 10 }}>
            {record.isPublic ? '公开共享' : '私有'}
          </Tag>
        </Space>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 250,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => onViewDetail(record)}
          >
            详情
          </Button>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => onEdit(record)}
          >
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            icon={<PlayCircleOutlined />}
            onClick={() => onValidate(record)}
          >
            验证
          </Button>

          <Dropdown
            menu={{
              items: [
                {
                  key: 'clone',
                  icon: <CopyOutlined />,
                  label: '复制副本',
                  onClick: () => onClone(record),
                },
                {
                  key: 'export',
                  icon: <ExportOutlined />,
                  label: '导出 JSON',
                  onClick: () => onExport(record),
                },
              ],
            }}
          >
            <Button type="link" size="small" icon={<SettingOutlined />}>
              更多
            </Button>
          </Dropdown>

          <Popconfirm
            title="确定要删除此工作流组合吗？"
            description="删除后，已关联该组合的技能将无法自动执行其步骤。"
            onConfirm={() => onDelete(record.id)}
            okText="确定删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button type="link" danger size="small" icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Table
      columns={columns}
      dataSource={templates}
      rowKey="id"
      loading={isLoading}
      scroll={{ x: 1050 }}
      pagination={{
        pageSize: 10,
        showSizeChanger: true,
        showTotal: (total) => `共 ${total} 个工作流组合`,
      }}
    />
  );
};

export default FlowListTable;
