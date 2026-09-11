import React, { useState } from 'react';
import { Button, Space, message, Alert } from 'antd';
import { ReloadOutlined, PlusOutlined, ApartmentOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { authApi, userApi, UserDto } from '@/api/auth';
import { organizationApi } from '@/api/organization';
import { useAuthStore } from '@/shared/store/authStore';
import { ListSectionHeader } from '@/components/page/PageScaffold';
import { UserStatCards } from '../components/UserStatCards';
import { UserTable } from '../components/UserTable';
import { UserEditModal } from '../components/UserEditModal';
import { UserCreateModal } from '../components/UserCreateModal';

const UserAdminPage: React.FC = () => {
  const { t } = useTranslation(['common', 'admin']);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const authUser = useAuthStore((state) => state.user);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<UserDto | null>(null);

  // 1. 获取用户列表
  const usersQuery = useQuery(['users', { page, pageSize }], () =>
    userApi.list({ page })
  );

  // 2. 获取组织列表
  const orgsQuery = useQuery('admin-organizations', () =>
    organizationApi.listOrganizations()
  );

  const activeOrgId = orgsQuery.data?.[0]?.id || authUser?.organization?.id;

  // 3. 获取当前激活组织的部门结构
  const structureQuery = useQuery(
    ['admin-org-structure', activeOrgId],
    () => organizationApi.getOrganizationStructure(activeOrgId!),
    { enabled: !!activeOrgId }
  );

  const departments = structureQuery.data?.departments || [];

  // Mutations
  const activateMutation = useMutation((id: string) => userApi.activate(id), {
    onSuccess: () => {
      message.success(t('common:success'));
      queryClient.invalidateQueries(['users']);
    },
    onError: () => {
      message.error(t('common:error'));
    },
  });

  const deactivateMutation = useMutation((id: string) => userApi.deactivate(id), {
    onSuccess: () => {
      message.success(t('common:success'));
      queryClient.invalidateQueries(['users']);
    },
    onError: () => {
      message.error(t('common:error'));
    },
  });

  const updateMutation = useMutation(
    async ({
      userId,
      roles,
      orgId,
      departmentId,
      title,
    }: {
      userId: string;
      roles: string[];
      orgId?: string;
      departmentId?: string | null;
      title?: string | null;
    }) => {
      await userApi.updateRoles(userId, roles);
      if (orgId) {
        await userApi.updateDepartment(userId, { orgId, departmentId, title });
      }
    },
    {
      onSuccess: () => {
        message.success('用户配置已成功更新');
        queryClient.invalidateQueries(['users']);
        queryClient.invalidateQueries(['admin-org-structure']);
        setEditModalVisible(false);
      },
      onError: (err: any) => {
        const errorMsg = err?.response?.data?.message || '更新失败';
        message.error(errorMsg);
      },
    }
  );

  const createUserMutation = useMutation(
    async (values: {
      username: string;
      password: string;
      email?: string;
      role: string;
      departmentId?: string | null;
      title?: string | null;
    }) => {
      const registered = await authApi.register({
        username: values.username,
        password: values.password,
        email: values.email,
        role: values.role as 'employee' | 'admin' | 'agent',
      });


      if (activeOrgId && (values.departmentId || values.title)) {
        await userApi.updateDepartment(registered.user.id, {
          orgId: activeOrgId,
          departmentId: values.departmentId,
          title: values.title,
        });
      }
    },
    {
      onSuccess: () => {
        message.success('用户创建成功并已关联部门');
        queryClient.invalidateQueries(['users']);
        queryClient.invalidateQueries(['admin-org-structure']);
        setCreateModalVisible(false);
      },
      onError: (error: any) => {
        const backendMessage = error?.response?.data?.message || '用户创建失败';
        if (backendMessage.includes('Username already exists')) {
          message.warning('用户名已存在，请直接在列表中管理');
          return;
        }
        message.error(backendMessage);
      },
    }
  );

  const handleEditUser = (user: UserDto) => {
    setEditingUser(user);
    setEditModalVisible(true);
  };

  const handleSaveUser = (values: {
    roles: string[];
    departmentId?: string | null;
    title?: string | null;
    orgId?: string;
  }) => {
    if (editingUser) {
      updateMutation.mutate({
        userId: editingUser.id,
        roles: values.roles,
        orgId: values.orgId || activeOrgId,
        departmentId: values.departmentId,
        title: values.title,
      });
    }
  };

  return (
    <div style={{ width: '100%', padding: '0 4px' }}>
      <ListSectionHeader
        title={t('admin:userManagement')}
        subtitle="统一管理企业用户账号、系统权限、所属部门与职务头衔"
        extra={
          <Space wrap size={12}>
            <Button
              icon={<ApartmentOutlined />}
              onClick={() => navigate('/admin/departments')}
            >
              组织架构管理
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                usersQuery.refetch();
                structureQuery.refetch();
              }}
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

      <UserStatCards
        users={usersQuery.data?.users || []}
        total={usersQuery.data?.total || 0}
      />

      {usersQuery.isError && (
        <Alert
          style={{ marginBottom: 16 }}
          type="error"
          showIcon
          message="用户列表加载失败"
          description="请确认当前账号具备管理员权限，或点击刷新重试。"
        />
      )}

      <UserTable
        users={usersQuery.data?.users || []}
        total={usersQuery.data?.total || 0}
        loading={usersQuery.isLoading}
        page={page}
        pageSize={pageSize}
        departments={departments}
        onPageChange={(newPage, newPageSize) => {
          setPage(newPage);
          setPageSize(newPageSize);
        }}
        onEditUser={handleEditUser}
        onActivateUser={(id) => activateMutation.mutate(id)}
        onDeactivateUser={(id) => deactivateMutation.mutate(id)}
      />

      <UserEditModal
        open={editModalVisible}
        user={editingUser}
        departments={departments}
        organizations={orgsQuery.data || []}
        activeOrgId={activeOrgId}
        loading={updateMutation.isLoading}
        onCancel={() => setEditModalVisible(false)}
        onSave={handleSaveUser}
      />

      <UserCreateModal
        open={createModalVisible}
        departments={departments}
        loading={createUserMutation.isLoading}
        onCancel={() => setCreateModalVisible(false)}
        onCreate={(values) => createUserMutation.mutate(values)}
      />
    </div>
  );
};

export default UserAdminPage;
