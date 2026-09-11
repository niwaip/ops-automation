import React, { useState } from 'react';
import {
  Table,
  Card,
  Input,
  Select,
  Space,
  Tag,
  Button,
  Avatar,
  Badge,
  Tooltip,
  Popconfirm,
  Typography,
} from 'antd';
import {
  SearchOutlined,
  EditOutlined,
  StopOutlined,
  CheckOutlined,
  MailOutlined,
  UserOutlined,
  SafetyCertificateOutlined,
  RobotOutlined,
  ApartmentOutlined,
  IdcardOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { ColumnsType } from 'antd/es/table';
import type { UserDto } from '@/api/auth';
import type { OrganizationDepartment } from '@/api/organization';

const { Option } = Select;
const { Text } = Typography;

interface UserTableProps {
  users: UserDto[];
  total: number;
  loading: boolean;
  page: number;
  pageSize: number;
  departments: OrganizationDepartment[];
  onPageChange: (page: number, pageSize: number) => void;
  onEditUser: (user: UserDto) => void;
  onActivateUser: (id: string) => void;
  onDeactivateUser: (id: string) => void;
}

const getAvatarColor = (name: string) => {
  const colors = ['#1890ff', '#52c41a', '#722ed1', '#fa8c16', '#eb2f96', '#13c2c2'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

export const UserTable: React.FC<UserTableProps> = ({
  users,
  total,
  loading,
  page,
  pageSize,
  departments,
  onPageChange,
  onEditUser,
  onActivateUser,
  onDeactivateUser,
}) => {
  const { t } = useTranslation(['common', 'admin']);
  const [searchText, setSearchText] = useState('');
  const [roleFilter, setRoleFilter] = useState<string | undefined>();
  const [deptFilter, setDeptFilter] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<boolean | undefined>();

  const filteredUsers = users.filter((u) => {
    const keyword = searchText.trim().toLowerCase();
    const matchesSearch =
      !keyword ||
      u.username.toLowerCase().includes(keyword) ||
      (u.email || '').toLowerCase().includes(keyword) ||
      (u.title || '').toLowerCase().includes(keyword) ||
      (u.department?.name || '').toLowerCase().includes(keyword);

    const matchesRole = roleFilter === undefined || u.role === roleFilter;
    const matchesDept =
      deptFilter === undefined ||
      (deptFilter === '__none__' ? !u.department : u.department?.id === deptFilter);
    const matchesStatus = statusFilter === undefined || u.isActive === statusFilter;

    return matchesSearch && matchesRole && matchesDept && matchesStatus;
  });

  const columns: ColumnsType<UserDto> = [
    {
      title: t('admin:userName'),
      dataIndex: 'username',
      key: 'username',
      width: 200,
      render: (text: string) => (
        <Space size={10}>
          <Avatar
            style={{
              backgroundColor: getAvatarColor(text),
              verticalAlign: 'middle',
              fontWeight: 600,
            }}
            size="small"
          >
            {text.charAt(0).toUpperCase()}
          </Avatar>
          <Text strong style={{ fontSize: 14 }}>
            {text}
          </Text>
        </Space>
      ),
    },
    {
      title: '所属部门',
      dataIndex: 'department',
      key: 'department',
      width: 170,
      render: (dept: UserDto['department']) =>
        dept ? (
          <Tag color="cyan" icon={<ApartmentOutlined />} style={{ borderRadius: 6, padding: '2px 8px' }}>
            {dept.name}
          </Tag>
        ) : (
          <Tag color="default" style={{ borderRadius: 6, color: '#8c8c8c' }}>
            未分配
          </Tag>
        ),
    },
    {
      title: '职位/职务',
      dataIndex: 'title',
      key: 'title',
      width: 150,
      render: (title: string | null | undefined) =>
        title ? (
          <Space size={4}>
            <IdcardOutlined style={{ color: '#fa8c16' }} />
            <Text style={{ fontSize: 13 }}>{title}</Text>
          </Space>
        ) : (
          <Text type="secondary" style={{ color: '#bfbfbf' }}>
            -
          </Text>
        ),
    },
    {
      title: t('admin:userEmail'),
      dataIndex: 'email',
      key: 'email',
      width: 210,
      render: (email: string) =>
        email ? (
          <Space size={6}>
            <MailOutlined style={{ color: 'var(--text-tertiary, #8c8c8c)' }} />
            <Text type="secondary">{email}</Text>
          </Space>
        ) : (
          <Text type="secondary" style={{ color: '#bfbfbf' }}>
            -
          </Text>
        ),
    },
    {
      title: t('admin:userRole'),
      dataIndex: 'role',
      key: 'role',
      width: 140,
      render: (role: string) => {
        const roleMeta: Record<
          string,
          { color: string; icon: React.ReactNode; label: string }
        > = {
          admin: {
            color: 'magenta',
            icon: <SafetyCertificateOutlined />,
            label: '管理员',
          },
          agent: {
            color: 'purple',
            icon: <RobotOutlined />,
            label: '系统 Agent',
          },
          employee: {
            color: 'blue',
            icon: <UserOutlined />,
            label: '普通员工',
          },
        };

        const meta = roleMeta[role] || {
          color: 'default',
          icon: <UserOutlined />,
          label: role,
        };

        return (
          <Tag color={meta.color} icon={meta.icon} style={{ borderRadius: 6, padding: '2px 8px' }}>
            {meta.label}
          </Tag>
        );
      },
    },
    {
      title: t('admin:userStatus'),
      dataIndex: 'isActive',
      key: 'isActive',
      width: 120,
      render: (isActive: boolean) => (
        <Badge
          status={isActive ? 'success' : 'error'}
          text={
            <Text style={{ fontSize: 13, color: isActive ? 'var(--success-color)' : 'var(--error-color)' }}>
              {isActive ? t('admin:userActive') : t('admin:userInactive')}
            </Text>
          }
        />
      ),
    },
    {
      title: t('common:createdAt'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (date: string) => (
        <Text type="secondary" style={{ fontSize: 13 }}>
          {new Date(date).toLocaleString()}
        </Text>
      ),
    },
    {
      title: t('common:actions'),
      key: 'actions',
      width: 170,
      fixed: 'right',
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title="配置角色、所属部门与职务">
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => onEditUser(record)}
            >
              配置
            </Button>
          </Tooltip>
          {record.isActive ? (
            <Popconfirm
              title="确认禁用此用户？"
              description="禁用后该用户将无法登录系统。"
              onConfirm={() => onDeactivateUser(record.id)}
              okText="禁用"
              cancelText="取消"
              okButtonProps={{ danger: true }}
            >
              <Button type="link" size="small" danger icon={<StopOutlined />}>
                {t('admin:deactivateUser')}
              </Button>
            </Popconfirm>
          ) : (
            <Button
              type="link"
              size="small"
              icon={<CheckOutlined />}
              onClick={() => onActivateUser(record.id)}
            >
              {t('admin:activateUser')}
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const roleOptions = ['employee', 'admin', 'agent'];

  return (
    <Card
      styles={{ body: { padding: '16px 20px' } }}
      style={{
        borderRadius: 14,
        border: '1px solid var(--bg-secondary)',
        background: 'var(--bg-card)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <Space wrap size={12}>
          <Input
            placeholder="搜索用户名 / 邮箱 / 部门 / 职位..."
            prefix={<SearchOutlined style={{ color: 'var(--text-light, #bfbfbf)' }} />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
            style={{ width: 280 }}
          />
          <Select
            placeholder="部门筛选"
            value={deptFilter}
            onChange={(value) => setDeptFilter(value)}
            allowClear
            style={{ width: 170 }}
          >
            <Option value="__none__">未分配部门</Option>
            {departments.map((dept) => (
              <Option key={dept.id} value={dept.id}>
                {dept.name}
              </Option>
            ))}
          </Select>
          <Select
            placeholder="角色筛选"
            value={roleFilter}
            onChange={(value) => setRoleFilter(value)}
            allowClear
            style={{ width: 140 }}
          >
            {roleOptions.map((role) => (
              <Option key={role} value={role}>
                {role === 'admin' ? '管理员' : role === 'agent' ? '系统 Agent' : '普通员工'}
              </Option>
            ))}
          </Select>
          <Select
            placeholder="状态筛选"
            value={statusFilter}
            onChange={(value) => setStatusFilter(value)}
            allowClear
            style={{ width: 120 }}
          >
            <Option value={true}>已启用</Option>
            <Option value={false}>已禁用</Option>
          </Select>
          {(searchText || roleFilter !== undefined || deptFilter !== undefined || statusFilter !== undefined) && (
            <Button
              type="link"
              size="small"
              onClick={() => {
                setSearchText('');
                setRoleFilter(undefined);
                setDeptFilter(undefined);
                setStatusFilter(undefined);
              }}
            >
              重置筛选
            </Button>
          )}
        </Space>
        <Text type="secondary" style={{ fontSize: 13 }}>
          共计 {filteredUsers.length} 位用户
        </Text>
      </div>

      <Table
        columns={columns}
        dataSource={filteredUsers}
        rowKey="id"
        loading={loading}
        locale={{
          emptyText:
            searchText || roleFilter || deptFilter || statusFilter !== undefined
              ? '未找到匹配的用户'
              : '暂无用户数据',
        }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (tTotal) => t('common:pagination.total', { total: tTotal }),
          onChange: onPageChange,
        }}
        scroll={{ x: 'max-content' }}
      />
    </Card>
  );
};
