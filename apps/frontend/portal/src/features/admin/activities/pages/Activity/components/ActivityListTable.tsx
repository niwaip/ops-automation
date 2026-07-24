import React from 'react';
import { Table, Tag, Space, Button, Popconfirm, Typography } from 'antd';
import { PlayCircleOutlined, CodeOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
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
}) => {
  if (activeTab === 'builtin') {
    const builtinColumns: ColumnsType<BuiltinActivityDTO> = [
      {
        title: '名称',
        dataIndex: 'name',
        key: 'name',
        render: (name) => <Text strong>{name}</Text>,
      },
      {
        title: '函数名',
        dataIndex: 'fn',
        key: 'fn',
        render: (fn) => <Text code>{fn}</Text>,
      },
      {
        title: '描述',
        dataIndex: 'description',
        key: 'description',
      },
      {
        title: '分类',
        dataIndex: 'category',
        key: 'category',
        render: (cat) => <Tag color="blue">{cat || '内置'}</Tag>,
      },
    ];

    return (
      <Table
        rowKey="key"
        dataSource={builtinActivities}
        columns={builtinColumns}
        loading={isLoading}
        pagination={{ pageSize: 10 }}
      />
    );
  }

  const customColumns: ColumnsType<ActivityDTO> = [
    {
      title: 'Activity 名称',
      dataIndex: 'name',
      key: 'name',
      render: (name, record) => (
        <Space direction="vertical" size={2}>
          <Text strong>{name}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.fn}
          </Text>
        </Space>
      ),
    },
    {
      title: '处理器类型',
      dataIndex: 'handler',
      key: 'handler',
      width: 140,
      render: (handler) => {
        const handlerKey = String(handler || 'script');
        const cfg = HANDLER_CONFIG[handlerKey] || { label: handlerKey, color: 'default' };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: '超时时间',
      dataIndex: 'timeout',
      key: 'timeout',
      width: 110,
      render: (t) => <Text code>{t || '60s'}</Text>,
    },
    {
      title: '状态',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 90,
      render: (isActive) => (
        <Tag color={isActive ? 'success' : 'default'}>{isActive ? '已启用' : '已停用'}</Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 220,
      render: (_, record) => (
        <Space size="small">
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
            icon={<EditOutlined />}
            onClick={() => onEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要删除此 Activity 吗？"
            onConfirm={() => onDelete(record.id)}
            okText="删除"
            cancelText="取消"
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
      pagination={{ pageSize: 10 }}
    />
  );
};
