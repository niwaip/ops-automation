import React from 'react';
import { Table, Tag, Space, Button, Popconfirm, Typography, Tooltip, message } from 'antd';
import {
  PlayCircleOutlined,
  CodeOutlined,
  EditOutlined,
  DeleteOutlined,
  CopyOutlined,
  CheckCircleOutlined,
  StopOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { ActivityDTO, BuiltinActivityDTO } from '@/api/activity';
import { HANDLER_CONFIG } from '../utils/activityHelpers';

const { Text } = Typography;

export interface ActivityListTableProps {
  activeTab: 'custom' | 'builtin';
  customActivities: ActivityDTO[];
  builtinActivities: BuiltinActivityDTO[];
  isLoading: boolean;
  onEdit: (activity: ActivityDTO) => void;
  onDelete: (id: string) => void;
  onTest: (activity: ActivityDTO) => void;
  onViewCode: (activity: ActivityDTO) => void;
  onClone: (activity: ActivityDTO | BuiltinActivityDTO) => void;
  onViewBuiltinCode: (activity: BuiltinActivityDTO) => void;
}

export const ActivityListTable: React.FC<ActivityListTableProps> = ({
  activeTab,
  customActivities,
  builtinActivities,
  isLoading,
  onEdit,
  onDelete,
  onTest,
  onViewCode,
  onClone,
  onViewBuiltinCode,
}) => {
  const handleCopyFn = (fn: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(fn);
    message.success(`已复制函数名: ${fn}`);
  };

  if (activeTab === 'builtin') {
    const builtinColumns: ColumnsType<BuiltinActivityDTO> = [
      {
        title: 'Activity 名称与分类',
        dataIndex: 'name',
        key: 'name',
        width: 260,
        render: (name, record) => (
          <Space direction="vertical" size={2}>
            <Space size={6}>
              <Text strong>{name}</Text>
              <Tag color="cyan" style={{ fontSize: 11 }}>
                内置
              </Tag>
            </Space>
            {record.description && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {record.description}
              </Text>
            )}
          </Space>
        ),
      },
      {
        title: 'Python 函数签名 (fn)',
        dataIndex: 'fn',
        key: 'fn',
        width: 240,
        render: (fn) => (
          <Space size={4}>
            <Text code>{fn}</Text>
            <Tooltip title="复制函数签名">
              <Button
                type="text"
                size="small"
                icon={<CopyOutlined />}
                onClick={(e) => handleCopyFn(fn, e)}
              />
            </Tooltip>
          </Space>
        ),
      },
      {
        title: '处理器类型',
        dataIndex: 'handler',
        key: 'handler',
        width: 130,
        render: (handler) => {
          const handlerKey = String(handler || 'script');
          const cfg = HANDLER_CONFIG[handlerKey] || { label: handlerKey, color: 'default' };
          return (
            <Tag color={cfg.color} icon={cfg.icon}>
              {cfg.label}
            </Tag>
          );
        },
      },
      {
        title: '超时时间',
        dataIndex: 'timeout',
        key: 'timeout',
        width: 100,
        render: (t) => <Text code>{t || '60s'}</Text>,
      },
      {
        title: '分类 / 驱动',
        dataIndex: 'category',
        key: 'category',
        width: 130,
        render: (cat) => <Tag color="blue">{cat || '基础能力'}</Tag>,
      },
      {
        title: '操作',
        key: 'action',
        width: 200,
        render: (_, record) => (
          <Space size="small">
            <Button
              type="link"
              size="small"
              icon={<CodeOutlined />}
              onClick={() => onViewBuiltinCode(record)}
            >
              查看代码
            </Button>
            <Button
              type="link"
              size="small"
              icon={<CopyOutlined />}
              onClick={() => onClone(record)}
            >
              复制为自定义
            </Button>
          </Space>
        ),
      },
    ];

    return (
      <Table
        rowKey="key"
        dataSource={builtinActivities}
        columns={builtinColumns}
        loading={isLoading}
        pagination={{ pageSize: 10, showTotal: (total) => `共 ${total} 个内置 Activity` }}
      />
    );
  }

  const customColumns: ColumnsType<ActivityDTO> = [
    {
      title: 'Activity 任务名称',
      dataIndex: 'name',
      key: 'name',
      render: (name, record) => {
        const sourceSkill = record.config?.sourceSkillName;
        return (
          <Space direction="vertical" size={2}>
            <Space size={6} wrap>
              <Text strong style={{ fontSize: 14 }}>
                {name}
              </Text>
              {sourceSkill && (
                <Tag color="purple" style={{ fontSize: 11 }}>
                  来自: {sourceSkill}
                </Tag>
              )}
            </Space>
            <Space size={4}>
              <Text code style={{ fontSize: 12 }}>
                {record.fn}
              </Text>
              <Tooltip title="复制 Python 函数名">
                <Button
                  type="text"
                  size="small"
                  icon={<CopyOutlined style={{ fontSize: 11 }} />}
                  onClick={(e) => handleCopyFn(record.fn, e)}
                />
              </Tooltip>
            </Space>
            {record.config?.description && (
              <Text type="secondary" ellipsis={{ tooltip: record.config.description }} style={{ maxWidth: 360, fontSize: 12 }}>
                {record.config.description}
              </Text>
            )}
          </Space>
        );
      },
    },
    {
      title: '处理器类型',
      dataIndex: 'handler',
      key: 'handler',
      width: 140,
      render: (handler) => {
        const handlerKey = String(handler || 'script');
        const cfg = HANDLER_CONFIG[handlerKey] || { label: handlerKey, color: 'default' };
        return (
          <Tag color={cfg.color} icon={cfg.icon}>
            {cfg.label}
          </Tag>
        );
      },
    },
    {
      title: '超时时间',
      dataIndex: 'timeout',
      key: 'timeout',
      width: 100,
      render: (t) => <Text code>{t || '60s'}</Text>,
    },
    {
      title: '状态',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 100,
      render: (isActive) => (
        <Tag
          color={isActive ? 'success' : 'default'}
          icon={isActive ? <CheckCircleOutlined /> : <StopOutlined />}
        >
          {isActive ? '已启用' : '已停用'}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 300,
      render: (_, record) => (
        <Space size={2} wrap>
          <Button
            type="link"
            size="small"
            icon={<PlayCircleOutlined />}
            onClick={() => onTest(record)}
          >
            测试
          </Button>
          <Button
            type="link"
            size="small"
            icon={<CodeOutlined />}
            onClick={() => onViewCode(record)}
          >
            代码
          </Button>
          <Button
            type="link"
            size="small"
            icon={<CopyOutlined />}
            onClick={() => onClone(record)}
          >
            复制生成
          </Button>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => onEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要删除此 Activity 吗？"
            description="删除后将无法在工作流编排中调度此任务节点。"
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
      rowKey="id"
      dataSource={customActivities}
      columns={customColumns}
      loading={isLoading}
      pagination={{ pageSize: 10, showTotal: (total) => `共 ${total} 个自定义 Activity` }}
    />
  );
};

export default ActivityListTable;
