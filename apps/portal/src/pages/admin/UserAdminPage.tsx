import React, { useState } from 'react';
import {
  Table,
  Card,
  Button,
  Input,
  Space,
  Tag,
  Typography,
  Modal,
  message,
  Form,
  Select,
  Alert,
} from 'antd';
import {
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
  EditOutlined,
  CheckOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { authApi, userApi, UserDto } from '../../api/auth';
import type { ColumnsType } from 'antd/es/table';

const { Title } = Typography;
const { Option } = Select;

const UserAdminPage: React.FC = () => {
  const { t } = useTranslation(['common', 'admin']);
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [roleFilter, setRoleFilter] = useState<string | undefined>();
  const [searchText, setSearchText] = useState('');
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<UserDto | null>(null);
  const [form] = Form.useForm();
  const [createForm] = Form.useForm();

  const usersQuery = useQuery(
    ['users', { page, role: roleFilter }],
    () => userApi.list({ page, role: roleFilter })
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

  const columns: ColumnsType<UserDto> = [
    {
      title: t('admin:userName'),
      dataIndex: 'username',
      key: 'username',
    },
    {
      title: t('admin:userEmail'),
      dataIndex: 'email',
      key: 'email',
      render: (email: string) => email || '-',
    },
    {
      title: t('admin:userRole'),
      dataIndex: 'role',
      key: 'role',
      render: (role: string) => {
        const colorMap: Record<string, string> = {
          employee: 'blue',
          admin: 'red',
          agent: 'green',
        };
        return <Tag color={colorMap[role]}>{t(`auth:role${role.charAt(0).toUpperCase() + role.slice(1)}`)}</Tag>;
      },
    },
    {
      title: t('admin:userStatus'),
      dataIndex: 'isActive',
      key: 'isActive',
      render: (isActive: boolean) => (
        <Tag color={isActive ? 'success' : 'error'}>
          {isActive ? t('admin:userActive') : t('admin:userInactive')}
        </Tag>
      ),
    },
    {
      title: t('common:createdAt'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string) => new Date(date).toLocaleString(),
    },
    {
      title: t('common:actions'),
      key: 'actions',
      width: 180,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEditRoles(record)}
          >
            {t('admin:updateRoles')}
          </Button>
          {record.isActive ? (
            <Button
              type="link"
              size="small"
              danger
              icon={<StopOutlined />}
              onClick={() => handleDeactivate(record.id)}
            >
              {t('admin:deactivateUser')}
            </Button>
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

  const roleOptions = ['employee', 'admin', 'agent'];
  const filteredUsers = (usersQuery.data?.users || []).filter((u) => {
    const keyword = searchText.trim().toLowerCase();
    if (!keyword) return true;
    return (
      u.username.toLowerCase().includes(keyword) ||
      (u.email || '').toLowerCase().includes(keyword)
    );
  });

  return (
    <div>
      <Title level={4}>{t('admin:userManagement')}</Title>

      <Card style={{ marginTop: 16 }}>
        <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
          <Space>
            <Input
              placeholder={t('common:search')}
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 200 }}
              allowClear
            />
            <Select
              placeholder={t('admin:userRole')}
              style={{ width: 150 }}
              value={roleFilter}
              onChange={(value) => setRoleFilter(value)}
              allowClear
            >
              {roleOptions.map((role) => (
                <Option key={role} value={role}>
                  {t(`auth:role${role.charAt(0).toUpperCase() + role.slice(1)}`)}
                </Option>
              ))}
            </Select>
          </Space>
          <Space>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateModalVisible(true)}
            >
              创建用户
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => usersQuery.refetch()}
            >
              {t('common:refresh')}
            </Button>
          </Space>
        </Space>

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
            emptyText: searchText ? '未找到匹配的用户' : '暂无用户数据',
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
        />
      </Card>

      <Modal
        title={t('admin:updateRoles')}
        open={editModalVisible}
        onOk={handleSaveRoles}
        onCancel={() => setEditModalVisible(false)}
        confirmLoading={updateRolesMutation.isLoading}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="roles"
            label={t('admin:userRole')}
            rules={[{ required: true, message: 'Please select at least one role' }]}
          >
            <Select mode="multiple" placeholder="Select roles">
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
        title="创建用户"
        open={createModalVisible}
        onOk={handleCreateUser}
        onCancel={() => setCreateModalVisible(false)}
        confirmLoading={createUserMutation.isLoading}
      >
        <Form form={createForm} layout="vertical">
          <Form.Item
            name="username"
            label="用户名"
            rules={[
              { required: true, message: '请输入用户名' },
              { min: 3, message: '用户名至少 3 位' },
            ]}
          >
            <Input placeholder="请输入用户名" />
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
            <Input placeholder="可选" />
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
