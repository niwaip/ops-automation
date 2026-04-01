import React, { useState } from 'react';
import { Table, Card, Button, Input, Space, Tag, Typography, Modal, message, Form, Select } from 'antd';
import {
  SearchOutlined,
  ReloadOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { userApi, UserDto } from '../../api/auth';
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
  const [editingUser, setEditingUser] = useState<UserDto | null>(null);
  const [form] = Form.useForm();

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

  const deleteMutation = useMutation(userApi.delete, {
    onSuccess: () => {
      message.success(t('common:success'));
      queryClient.invalidateQueries(['users']);
    },
    onError: () => {
      message.error(t('common:error'));
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

  const handleDelete = (id: string) => {
    Modal.confirm({
      title: t('common:confirmDelete'),
      onOk: () => deleteMutation.mutate(id),
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
      width: 200,
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
          <Button
            type="link"
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record.id)}
          >
            {t('common:delete')}
          </Button>
        </Space>
      ),
    },
  ];

  const roleOptions = ['employee', 'admin', 'agent'];

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
          <Button
            icon={<ReloadOutlined />}
            onClick={() => usersQuery.refetch()}
          >
            {t('common:refresh')}
          </Button>
        </Space>

        <Table
          columns={columns}
          dataSource={usersQuery.data?.users || []}
          rowKey="id"
          loading={usersQuery.isLoading}
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
    </div>
  );
};

export default UserAdminPage;