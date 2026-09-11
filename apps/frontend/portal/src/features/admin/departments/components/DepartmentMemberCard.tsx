import React, { useState } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Avatar,
  Typography,
  Tooltip,
  Popconfirm,
  Modal,
  Select,
  Input,
  Form,
  Empty,
  Descriptions,
} from 'antd';
import {
  UserAddOutlined,
  UserDeleteOutlined,
  CrownOutlined,
  IdcardOutlined,
  MailOutlined,
  ApartmentOutlined,
} from '@ant-design/icons';

import type { ColumnsType } from 'antd/es/table';
import type { OrganizationDepartment, OrganizationMember } from '@/api/organization';
import type { UserDto } from '@/api/auth';

const { Text } = Typography;
const { Option } = Select;

interface DepartmentMemberCardProps {
  department: OrganizationDepartment | null;
  parentDeptName?: string | null;
  members: OrganizationMember[];
  allUsers: UserDto[];
  loading: boolean;
  onAddMember: (userId: string, title?: string) => void;
  onRemoveMember: (userId: string) => void;
  onSetLeader: (userId: string) => void;
}

export const DepartmentMemberCard: React.FC<DepartmentMemberCardProps> = ({
  department,
  parentDeptName,
  members,
  allUsers,
  loading,
  onAddMember,
  onRemoveMember,
  onSetLeader,
}) => {
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [form] = Form.useForm();

  // Filter members belonging to this department
  const deptMembers = department
    ? members.filter((m) => m.departmentId === department.id)
    : members;

  // Find candidate users not in this department
  const currentMemberUserIds = new Set(deptMembers.map((m) => m.userId));
  const candidateUsers = allUsers.filter((u) => !currentMemberUserIds.has(u.id));

  const handleAddSubmit = () => {
    form.validateFields().then((values) => {
      onAddMember(values.userId, values.title);
      form.resetFields();
      setAddModalOpen(false);
    });
  };

  const columns: ColumnsType<OrganizationMember> = [
    {
      title: '成员姓名',
      dataIndex: ['user', 'username'],
      key: 'username',
      width: 180,
      render: (username: string, record) => {
        const isLeader = department?.managerUserId === record.userId;
        return (
          <Space size={8}>
            <Avatar style={{ backgroundColor: isLeader ? '#fa8c16' : '#1890ff', fontWeight: 600 }} size="small">
              {username?.charAt(0).toUpperCase()}
            </Avatar>
            <Text strong>{username}</Text>
            {isLeader && (
              <Tooltip title="部门负责人 / 主管">
                <CrownOutlined style={{ color: '#fa8c16', fontSize: 14 }} />
              </Tooltip>
            )}
          </Space>
        );
      },
    },
    {
      title: '电子邮箱',
      dataIndex: ['user', 'email'],
      key: 'email',
      width: 200,
      render: (email?: string) =>
        email ? (
          <Space size={4}>
            <MailOutlined style={{ color: '#8c8c8c' }} />
            <Text type="secondary">{email}</Text>
          </Space>
        ) : (
          <Text type="secondary">-</Text>
        ),
    },
    {
      title: '职务 / Title',
      dataIndex: 'title',
      key: 'title',
      width: 160,
      render: (title?: string) =>
        title ? (
          <Space size={4}>
            <IdcardOutlined style={{ color: '#fa8c16' }} />
            <Text>{title}</Text>
          </Space>
        ) : (
          <Text type="secondary" style={{ color: '#bfbfbf' }}>
            未设置
          </Text>
        ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 180,
      render: (_, record) => {
        const isLeader = department?.managerUserId === record.userId;
        return (
          <Space size={4}>
            {!isLeader && department && (
              <Button
                type="link"
                size="small"
                icon={<CrownOutlined />}
                onClick={() => onSetLeader(record.userId)}
              >
                设为主管
              </Button>
            )}
            {department && (
              <Popconfirm
                title="确认移出部门？"
                description="移出后该用户将处于未分配部门状态。"
                onConfirm={() => onRemoveMember(record.userId)}
                okText="移出"
                cancelText="取消"
                okButtonProps={{ danger: true }}
              >
                <Button type="link" size="small" danger icon={<UserDeleteOutlined />}>
                  移出
                </Button>
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  if (!department) {
    return (
      <Card
        style={{
          borderRadius: 14,
          border: '1px solid var(--bg-secondary)',
          background: 'var(--bg-card)',
          minHeight: 520,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="请在左侧选择一个部门以查看并管理其下属成员"
        />
      </Card>
    );
  }

  return (
    <Card
      title={
        <Space size={10}>
          <ApartmentOutlined style={{ color: '#1890ff', fontSize: 18 }} />
          <span>{department.name}</span>
          {department.code && <Tag color="blue">{department.code}</Tag>}
          <Tag color="cyan">{deptMembers.length} 名直属成员</Tag>
        </Space>
      }
      extra={
        <Button
          type="primary"
          icon={<UserAddOutlined />}
          size="small"
          onClick={() => setAddModalOpen(true)}
        >
          添加成员到本部门
        </Button>
      }
      style={{
        borderRadius: 14,
        border: '1px solid var(--bg-secondary)',
        background: 'var(--bg-card)',
        minHeight: 520,
      }}
      styles={{ body: { padding: '16px 20px' } }}
    >
      <Descriptions size="small" column={{ xxl: 3, xl: 3, lg: 2, md: 2, sm: 1, xs: 1 }} style={{ marginBottom: 16 }}>
        <Descriptions.Item label="所属上级">
          {parentDeptName ? <Tag color="geekblue">{parentDeptName}</Tag> : <Text type="secondary">企业直属顶级部门</Text>}
        </Descriptions.Item>
        <Descriptions.Item label="部门编码">
          {department.code ? <Text code>{department.code}</Text> : <Text type="secondary">无</Text>}
        </Descriptions.Item>
        <Descriptions.Item label="部门主管">
          {department.managerUserId ? (
            <Tag color="gold" icon={<CrownOutlined />}>
              {members.find((m) => m.userId === department.managerUserId)?.user?.username || '已指定'}
            </Tag>
          ) : (
            <Text type="secondary">暂未设定</Text>
          )}
        </Descriptions.Item>
      </Descriptions>

      <Table
        columns={columns}
        dataSource={deptMembers}
        rowKey="id"
        loading={loading}
        locale={{ emptyText: '该部门暂无成员，点击右上角添加成员' }}
        pagination={{ pageSize: 8, showSizeChanger: false }}
        scroll={{ x: 'max-content' }}
      />

      <Modal
        title={`添加成员至 [${department.name}]`}
        open={addModalOpen}
        onOk={handleAddSubmit}
        onCancel={() => {
          form.resetFields();
          setAddModalOpen(false);
        }}
        destroyOnClose
        width={440}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="userId"
            label="选择企业人员"
            rules={[{ required: true, message: '请选择需要加入该部门的人员' }]}
          >
            <Select
              showSearch
              placeholder="搜索人员姓名或邮箱..."
              optionFilterProp="children"
            >
              {candidateUsers.map((u) => (
                <Option key={u.id} value={u.id}>
                  {u.username} {u.email ? `(${u.email})` : ''} {u.department ? `[原: ${u.department.name}]` : '[未分配]'}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="title" label="分配职务 / 头衔 (可选)">
            <Input placeholder="例如：架构师 / 资深工程师" prefix={<IdcardOutlined style={{ color: '#bfbfbf' }} />} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};
