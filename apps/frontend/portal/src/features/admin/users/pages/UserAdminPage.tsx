import React, { useState, useMemo } from 'react';
import {
  Table,
  Card,
  Button,
  Input,
  Space,
  Tag,
  Modal,
  message,
  Form,
  Select,
  Alert,
  Typography,
  Avatar,
  Badge,
  Tooltip,
  Popconfirm,
} from 'antd';
import {
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
  EditOutlined,
  CheckOutlined,
  StopOutlined,
  TeamOutlined,
  UserOutlined,
  SafetyCertificateOutlined,
  RobotOutlined,
  MailOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { authApi, userApi, UserDto } from '@/api/auth';
import type { ColumnsType } from 'antd/es/table';
import {
  OverviewStatGrid,
  ListSectionHeader,
} from '@/components/page/PageScaffold';

const { Option } = Select;
const { Text } = Typography;

const UserAdminPage: React.FC = () => {
  const { t } = useTranslation(['common', 'admin']);
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [roleFilter, setRoleFilter] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<boolean | undefined>();
  const [searchText, setSearchText] = useState('');
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<UserDto | null>(null);
  const [form] = Form.useForm();
  const [createForm] = Form.useForm();

  const usersQuery = useQuery(['users', { page, role: roleFilter }], () =>
    userApi.list({ page, role: roleFilter })
  );

  const activateMutation = useMutation(userApi.activate, {
    onSuccess: () => {
      message.success(t('common:success'));
      queryClient.invalidateQueries(['users']);
    },
    onError: () => {
      message.error(t('common:error'));
    },
  });

  const deactivateMutation = useMutation(userApi.deactivate, {
    onSuccess: () => {
      message.success(t('common:success'));
      queryClient.invalidateQueries(['users']);
    },
    onError: () => {
      message.error(t('common:error'));
    },
  });

  const updateRolesMutation = useMutation(
    ({ id, roles }: { id: string; roles: string[] }) => userApi.updateRoles(id, roles),
    {
      onSuccess: () => {
        message.success(t('common:success'));
        queryClient.invalidateQueries(['users']);
        setEditModalVisible(false);
      },
      onError: () => {
        message.error(t('common:error'));
      },
    }
  );

  const createUserMutation = useMutation(authApi.register, {
    onSuccess: () => {
      message.success('用户创建成功');
      queryClient.invalidateQueries(['users']);
      setCreateModalVisible(false);
      createForm.resetFields();
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { message?: string } } };
      const backendMessage = err?.response?.data?.message || '用户创建失败';
      if (backendMessage.includes('Username already exists')) {
        message.warning('用户名已存在，请在列表中搜索该用户并直接管理（如启用/改角色）');
        return;
      }
      message.error(backendMessage);
    },
  });

  const handleActivate = (id: string) => {
    activateMutation.mutate(id);
  };

  const handleDeactivate = (id: string) => {
    deactivateMutation.mutate(id);
  };

  const handleEditRoles = (user: UserDto) => {
    setEditingUser(user);
    form.setFieldsValue({ roles: [user.role] });
    setEditModalVisible(true);
  };

  const handleSaveRoles = () => {
    form.validateFields().then((values) => {
      if (editingUser) {
        updateRolesMutation.mutate({ id: editingUser.id, roles: values.roles });
      }
    });
  };

  const handleCreateUser = () => {
    createForm.validateFields().then((values) => {
      createUserMutation.mutate({
        username: values.username,
        password: values.password,
        email: values.email,
        role: values.role,
      });
    });
  };

  const roleOptions = ['employee', 'admin', 'agent'];

  const filteredUsers = (usersQuery.data?.users || []).filter((u) => {
    const keyword = searchText.trim().toLowerCase();
    const matchesSearch =
      !keyword ||
      u.username.toLowerCase().includes(keyword) ||
      (u.email || '').toLowerCase().includes(keyword);

    const matchesStatus = statusFilter === undefined || u.isActive === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const getAvatarColor = (name: string) => {
    const colors = ['#1890ff', '#52c41a', '#722ed1', '#fa8c16', '#eb2f96', '#13c2c2'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const columns: ColumnsType<UserDto> = [
    {
      title: t('admin:userName'),
      dataIndex: 'username',
      key: 'username',
      width: 220,
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
      title: t('admin:userEmail'),
      dataIndex: 'email',
      key: 'email',
      width: 240,
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
      width: 160,
      render: (role: string) => {
        const roleMeta: Record<
          string,
          { color: string; icon: React.ReactNode; label: string }
        > = {
          admin: {
            color: 'magenta',
            icon: <SafetyCertificateOutlined />,
            label: t('auth:roleAdmin') || '管理员',
          },
          agent: {
            color: 'purple',
            icon: <RobotOutlined />,
            label: t('auth:roleAgent') || '系统 Agent',
          },
          employee: {
            color: 'blue',
            icon: <UserOutlined />,
            label: t('auth:roleEmployee') || '普通员工',
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
      width: 140,
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
      width: 200,
      render: (date: string) => (
        <Text type="secondary" style={{ fontSize: 13 }}>
          {new Date(date).toLocaleString()}
        </Text>
      ),
    },
    {
      title: t('common:actions'),
      key: 'actions',
      width: 180,
      fixed: 'right',
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title={t('admin:updateRoles')}>
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEditRoles(record)}
            >
              角色配置
            </Button>
          </Tooltip>
          {record.isActive ? (
            <Popconfirm
              title="确认禁用此用户？"
              description="禁用后该用户将无法登录系统。"
              onConfirm={() => handleDeactivate(record.id)}
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
              onClick={() => handleActivate(record.id)}
            >
              {t('admin:activateUser')}
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const statItems = useMemo(() => {
    const users = usersQuery.data?.users || [];
    const total = usersQuery.data?.total || 0;
    const activeCount = users.filter((u) => u.isActive).length;
    const inactiveCount = users.length - activeCount;
    const adminCount = users.filter((u) => u.role === 'admin').length;
    const agentCount = users.filter((u) => u.role === 'agent').length;
    const activeRate = total > 0 ? Math.round((activeCount / users.length) * 100) : 100;

    return [
      {
        key: 'total',
        label: '总用户数',
        value: total,
        icon: <TeamOutlined style={{ color: '#1890ff', fontSize: 20 }} />,
        color: '#1890ff',
      },
      {
        key: 'active',
        label: '活跃账号',
        value: `${activeCount} (${activeRate}%)`,
        icon: <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 20 }} />,
        color: '#52c41a',
      },
      {
        key: 'inactive',
        label: '已禁用账号',
        value: inactiveCount,
        icon: <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 20 }} />,
        color: inactiveCount > 0 ? '#ff4d4f' : 'var(--text-tertiary)',
      },
      {
        key: 'admin',
        label: '管理员 / Agent',
        value: `${adminCount} 管理员 / ${agentCount} Agent`,
        icon: <SafetyCertificateOutlined style={{ color: '#722ed1', fontSize: 20 }} />,
        color: '#722ed1',
      },
    ];
  }, [usersQuery.data]);

  return (
    <div style={{ width: '100%', padding: '0 4px' }}>
      <ListSectionHeader
        title={t('admin:userManagement')}
        subtitle="统一管理系统中的所有用户账号、角色权限与登录状态"
        extra={
          <Space wrap size={12}>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => usersQuery.refetch()}
              loading={usersQuery.isFetching}
            >
              {t('common:refresh')}
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateModalVisible(true)}
            >
              创建用户
            </Button>
          </Space>
        }
      />

      <OverviewStatGrid items={statItems} />

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
              placeholder="搜索用户名 / 邮箱..."
              prefix={<SearchOutlined style={{ color: 'var(--text-light, #bfbfbf)' }} />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
              style={{ width: 280 }}
            />
            <Select
              placeholder="角色筛选"
              value={roleFilter}
              onChange={(value) => setRoleFilter(value)}
              allowClear
              style={{ width: 150 }}
            >
              {roleOptions.map((role) => (
                <Option key={role} value={role}>
                  {t(`auth:role${role.charAt(0).toUpperCase() + role.slice(1)}`)}
                </Option>
              ))}
            </Select>
            <Select
              placeholder="状态筛选"
              value={statusFilter}
              onChange={(value) => setStatusFilter(value)}
              allowClear
              style={{ width: 130 }}
            >
              <Option value={true}>已启用</Option>
              <Option value={false}>已禁用</Option>
            </Select>
            {(searchText || roleFilter !== undefined || statusFilter !== undefined) && (
              <Button
                type="link"
                size="small"
                onClick={() => {
                  setSearchText('');
                  setRoleFilter(undefined);
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

        {usersQuery.isError && (
          <Alert
            style={{ marginBottom: 16 }}
            type="error"
            showIcon
            message="用户列表加载失败"
            description="请确认当前账号是管理员，或点击刷新重试。"
          />
        )}

        <Table
          columns={columns}
          dataSource={filteredUsers}
          rowKey="id"
          loading={usersQuery.isLoading}
          locale={{
            emptyText: searchText || roleFilter || statusFilter !== undefined ? '未找到匹配的用户' : '暂无用户数据',
          }}
          pagination={{
            current: page,
            pageSize,
            total: usersQuery.data?.total || 0,
            showSizeChanger: true,
            showTotal: (total) => t('common:pagination.total', { total }),
            onChange: (newPage, newPageSize) => {
              setPage(newPage);
              setPageSize(newPageSize);
            },
          }}
          scroll={{ x: 'max-content' }}
        />
      </Card>

      <Modal
        title={t('admin:updateRoles')}
        open={editModalVisible}
        onOk={handleSaveRoles}
        onCancel={() => setEditModalVisible(false)}
        confirmLoading={updateRolesMutation.isLoading}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          {editingUser && (
            <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--bg-secondary, #fafafa)', borderRadius: 8 }}>
              <Space>
                <Avatar style={{ backgroundColor: getAvatarColor(editingUser.username) }} size="small">
                  {editingUser.username.charAt(0).toUpperCase()}
                </Avatar>
                <Text strong>{editingUser.username}</Text>
                {editingUser.email && <Text type="secondary">({editingUser.email})</Text>}
              </Space>
            </div>
          )}
          <Form.Item
            name="roles"
            label={t('admin:userRole')}
            rules={[{ required: true, message: '请至少选择一个角色' }]}
          >
            <Select mode="multiple" placeholder="选择角色">
              {roleOptions.map((role) => (
                <Option key={role} value={role}>
                  {t(`auth:role${role.charAt(0).toUpperCase() + role.slice(1)}`)}
                </Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="创建新用户"
        open={createModalVisible}
        onOk={handleCreateUser}
        onCancel={() => setCreateModalVisible(false)}
        confirmLoading={createUserMutation.isLoading}
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="username"
            label="用户名"
            rules={[
              { required: true, message: '请输入用户名' },
              { min: 3, message: '用户名至少 3 位' },
            ]}
          >
            <Input placeholder="请输入用户名" prefix={<UserOutlined style={{ color: '#bfbfbf' }} />} />
          </Form.Item>
          <Form.Item
            name="password"
            label="初始密码"
            rules={[
              { required: true, message: '请输入初始密码' },
              { min: 6, message: '密码至少 6 位' },
            ]}
          >
            <Input.Password placeholder="请输入初始密码" />
          </Form.Item>
          <Form.Item
            name="email"
            label="邮箱"
            rules={[{ type: 'email', message: '请输入合法邮箱' }]}
          >
            <Input placeholder="user@example.com (可选)" prefix={<MailOutlined style={{ color: '#bfbfbf' }} />} />
          </Form.Item>
          <Form.Item
            name="role"
            label="角色"
            initialValue="employee"
            rules={[{ required: true, message: '请选择角色' }]}
          >
            <Select>
              {roleOptions.map((role) => (
                <Option key={role} value={role}>
                  {t(`auth:role${role.charAt(0).toUpperCase() + role.slice(1)}`)}
                </Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default UserAdminPage;

