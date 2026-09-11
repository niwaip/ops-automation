import React, { useState } from 'react';
import { Row, Col, Card, Space, Button, Typography, Tag, message, Alert } from 'antd';
import {
  BankOutlined,
  ReloadOutlined,
  UserOutlined,
} from '@ant-design/icons';

import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { organizationApi, type OrganizationDepartment } from '@/api/organization';
import { userApi } from '@/api/auth';
import { useAuthStore } from '@/shared/store/authStore';
import { ListSectionHeader } from '@/components/page/PageScaffold';
import { DepartmentTreeCard } from '../components/DepartmentTreeCard';
import { DepartmentMemberCard } from '../components/DepartmentMemberCard';
import { DepartmentFormModal } from '../components/DepartmentFormModal';

const { Text, Title } = Typography;

const DepartmentAdminPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const authUser = useAuthStore((state) => state.user);

  const [selectedDept, setSelectedDept] = useState<OrganizationDepartment | null>(null);
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<OrganizationDepartment | null>(null);
  const [parentDeptIdForCreate, setParentDeptIdForCreate] = useState<string | null>(null);

  // 1. 获取组织列表（优先接口列表，其次降级到当前用户已绑定的组织）
  const orgsQuery = useQuery('admin-organizations', () =>
    organizationApi.listOrganizations()
  );

  const activeOrg = orgsQuery.data?.[0] || authUser?.organization || null;
  const activeOrgId = activeOrg?.id;

  // 2. 获取当前组织的架构数据（部门、团队、成员）
  const structureQuery = useQuery(
    ['admin-org-structure', activeOrgId],
    () => organizationApi.getOrganizationStructure(activeOrgId!),
    {
      enabled: !!activeOrgId,
      onSuccess: (data) => {
        // 如果当前选中的部门被更新或删除，同步更新 selectedDept
        if (selectedDept) {
          const updated = data.departments.find((d) => d.id === selectedDept.id);
          setSelectedDept(updated || (data.departments.length > 0 ? data.departments[0] : null));
        } else if (data.departments.length > 0) {
          setSelectedDept(data.departments[0]);
        }
      },
    }
  );

  // 3. 获取所有全量用户列表（用于成员选择器）
  const usersQuery = useQuery('admin-all-users', () =>
    userApi.list({ page: 1 })
  );

  const departments = structureQuery.data?.departments || [];
  const members = structureQuery.data?.memberships || [];
  const allUsers = usersQuery.data?.users || [];

  // Mutations
  const initOrgMutation = useMutation(
    () => organizationApi.ensureDefaultOrganization(),
    {
      onSuccess: () => {
        message.success('企业根组织初始化成功');
        queryClient.invalidateQueries('admin-organizations');
        queryClient.invalidateQueries(['admin-org-structure']);
      },
      onError: (err: any) => {
        message.error(err?.response?.data?.message || err?.message || '初始化企业组织失败');
      },
    }
  );

  const createDeptMutation = useMutation(
    async (values: { name: string; code?: string; parentId?: string | null }) => {
      let targetOrgId = activeOrgId;
      if (!targetOrgId) {
        // 自动自愈：若当前未选定或组织列表未就绪，自动获取/创建默认根组织
        const defaultOrg = await organizationApi.ensureDefaultOrganization();
        targetOrgId = defaultOrg.id;
        queryClient.invalidateQueries('admin-organizations');
      }

      if (!targetOrgId) {
        throw new Error('当前未找到有效企业组织，请点击页面上方初始化根组织重试');
      }

      return organizationApi.createDepartment(targetOrgId, {
        name: values.name,
        code: values.code,
        parentId: values.parentId || undefined,
      });
    },
    {
      onSuccess: (newDept) => {
        message.success('部门创建成功');
        queryClient.invalidateQueries(['admin-org-structure']);
        queryClient.invalidateQueries(['users']);
        setSelectedDept(newDept);
        setFormModalOpen(false);
      },
      onError: (err: any) => {
        message.error(err?.response?.data?.message || err?.message || '创建部门失败');
      },
    }
  );

  const updateDeptMutation = useMutation(
    (values: { name: string; code?: string; parentId?: string | null; managerUserId?: string | null }) => {
      if (!activeOrgId || !editingDept) {
        throw new Error('未指定有效组织或待编辑部门');
      }
      return organizationApi.updateDepartment(activeOrgId, editingDept.id, values);
    },
    {
      onSuccess: (updatedDept) => {
        message.success('部门更新成功');
        queryClient.invalidateQueries(['admin-org-structure']);
        queryClient.invalidateQueries(['users']);
        setSelectedDept(updatedDept);
        setFormModalOpen(false);
      },
      onError: (err: any) => {
        message.error(err?.response?.data?.message || err?.message || '更新部门失败');
      },
    }
  );

  const deleteDeptMutation = useMutation(
    (deptId: string) => {
      if (!activeOrgId) {
        throw new Error('当前未找到有效企业组织');
      }
      return organizationApi.deleteDepartment(activeOrgId, deptId);
    },
    {
      onSuccess: () => {
        message.success('部门已成功删除');
        queryClient.invalidateQueries(['admin-org-structure']);
        queryClient.invalidateQueries(['users']);
        setSelectedDept(null);
      },
      onError: (err: any) => {
        message.error(err?.response?.data?.message || err?.message || '删除部门失败');
      },
    }
  );

  const addMemberMutation = useMutation(
    ({ userId, title }: { userId: string; title?: string }) => {
      if (!activeOrgId || !selectedDept) {
        throw new Error('未选定组织或目标部门');
      }
      return organizationApi.addOrUpdateMember(activeOrgId, {
        userId,
        departmentId: selectedDept.id,
        title,
      });
    },
    {
      onSuccess: () => {
        message.success('成员已成功加入部门');
        queryClient.invalidateQueries(['admin-org-structure']);
        queryClient.invalidateQueries(['users']);
      },
      onError: (err: any) => {
        message.error(err?.response?.data?.message || err?.message || '加入部门失败');
      },
    }
  );

  const removeMemberMutation = useMutation(
    (userId: string) => {
      if (!activeOrgId) {
        throw new Error('未选定组织');
      }
      return organizationApi.addOrUpdateMember(activeOrgId, {
        userId,
        departmentId: undefined,
      });
    },
    {
      onSuccess: () => {
        message.success('成员已移出该部门');
        queryClient.invalidateQueries(['admin-org-structure']);
        queryClient.invalidateQueries(['users']);
      },
      onError: (err: any) => {
        message.error(err?.response?.data?.message || err?.message || '移出部门失败');
      },
    }
  );

  const setLeaderMutation = useMutation(
    (managerUserId: string) => {
      if (!activeOrgId || !selectedDept) {
        throw new Error('未选定组织或目标部门');
      }
      return organizationApi.updateDepartment(activeOrgId, selectedDept.id, {
        managerUserId,
      });
    },
    {
      onSuccess: (updated) => {
        message.success('已指定该成员为部门主管');
        queryClient.invalidateQueries(['admin-org-structure']);
        setSelectedDept(updated);
      },
      onError: (err: any) => {
        message.error(err?.response?.data?.message || err?.message || '设定主管失败');
      },
    }
  );

  const handleCreateTopDept = () => {
    setEditingDept(null);
    setParentDeptIdForCreate(null);
    setFormModalOpen(true);
  };

  const handleCreateSubDept = (parentId: string) => {
    setEditingDept(null);
    setParentDeptIdForCreate(parentId);
    setFormModalOpen(true);
  };

  const handleEditDept = (dept: OrganizationDepartment) => {
    setEditingDept(dept);
    setFormModalOpen(true);
  };

  const handleSaveDept = (values: { name: string; code?: string; parentId?: string | null }) => {
    if (editingDept) {
      updateDeptMutation.mutate(values);
    } else {
      createDeptMutation.mutate(values);
    }
  };

  const parentDeptName = selectedDept?.parentId
    ? departments.find((d) => d.id === selectedDept.parentId)?.name
    : null;

  return (
    <div style={{ width: '100%', padding: '0 4px' }}>
      <ListSectionHeader
        title="组织架构与部门管理"
        subtitle="可视化管理企业层级组织树、维护部门主管，为工作流审批与部门知识空间提供组织支撑"
        extra={
          <Space wrap size={12}>
            <Button
              icon={<UserOutlined />}
              onClick={() => navigate('/admin/users')}
            >
              用户账号管理
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                orgsQuery.refetch();
                structureQuery.refetch();
                usersQuery.refetch();
              }}
              loading={structureQuery.isFetching || orgsQuery.isFetching}
            >
              刷新
            </Button>
          </Space>
        }
      />

      {/* 顶部组织状态概览卡片 */}
      <Card
        style={{
          marginBottom: 16,
          borderRadius: 14,
          border: '1px solid var(--bg-secondary)',
          background: 'var(--bg-card)',
        }}
        styles={{ body: { padding: '16px 20px' } }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <Space size={14}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: 'rgba(24, 144, 255, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <BankOutlined style={{ fontSize: 24, color: '#1890ff' }} />
            </div>
            <div>
              <Space align="center" size={8}>
                <Title level={5} style={{ margin: 0 }}>
                  {activeOrg?.name || (orgsQuery.isLoading ? '正在加载企业组织...' : '未关联企业组织')}
                </Title>
                <Tag color={activeOrg ? 'geekblue' : 'warning'}>
                  {activeOrg?.code || (orgsQuery.isLoading ? 'LOADING' : 'UNINITIALIZED')}
                </Tag>
              </Space>
              <Text type="secondary" style={{ fontSize: 13 }}>
                {(activeOrg as any)?.description ||
                  (orgsQuery.isLoading
                    ? '正在同步企业组织层级与组织架构信息...'
                    : '当前系统尚未检测到有效企业组织，请点击下方初始化按钮创建根企业组织')}
              </Text>
            </div>
          </Space>

          <Space size={24} wrap>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>部门总数</Text>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#1890ff' }}>
                {departments.length}
              </div>
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>在册成员</Text>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#52c41a' }}>
                {allUsers.length} 人
              </div>
            </div>
          </Space>
        </div>
      </Card>

      {!activeOrgId && !orgsQuery.isLoading && (
        <Alert
          style={{ marginBottom: 16 }}
          type="warning"
          showIcon
          message="未检测到有效企业根组织"
          description="系统尚未检测到企业根组织，导致无法正常维护部门。您可以点击右侧按钮一键初始化系统根组织。"
          action={
            <Button
              type="primary"
              size="small"
              loading={initOrgMutation.isLoading}
              onClick={() => initOrgMutation.mutate()}
            >
              一键初始化根组织
            </Button>
          }
        />
      )}

      {orgsQuery.isError && (
        <Alert
          style={{ marginBottom: 16 }}
          type="error"
          showIcon
          message="企业组织信息加载失败"
          description={
            (orgsQuery.error as any)?.response?.data?.message ||
            (orgsQuery.error as Error)?.message ||
            '无法获取企业组织，请检查网络连接或确认当前账号具备管理员权限。'
          }
        />
      )}

      {structureQuery.isError && (
        <Alert
          style={{ marginBottom: 16 }}
          type="error"
          showIcon
          message="组织部门架构加载异常"
          description={
            (structureQuery.error as any)?.response?.data?.message ||
            (structureQuery.error as Error)?.message ||
            '请确保当前账号具备系统管理员权限。'
          }
        />
      )}

      {/* 左右分栏：左树右表 */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={24} md={9} lg={8} xl={7}>
          <DepartmentTreeCard
            departments={departments}
            selectedDeptId={selectedDept?.id || null}
            onSelectDept={(dept) => setSelectedDept(dept)}
            onCreateTopDept={handleCreateTopDept}
            onCreateSubDept={handleCreateSubDept}
            onEditDept={handleEditDept}
            onDeleteDept={(deptId) => deleteDeptMutation.mutate(deptId)}
          />
        </Col>

        <Col xs={24} sm={24} md={15} lg={16} xl={17}>
          <DepartmentMemberCard
            department={selectedDept}
            parentDeptName={parentDeptName}
            members={members}
            allUsers={allUsers}
            loading={structureQuery.isLoading}
            onAddMember={(userId, title) => addMemberMutation.mutate({ userId, title })}
            onRemoveMember={(userId) => removeMemberMutation.mutate(userId)}
            onSetLeader={(userId) => setLeaderMutation.mutate(userId)}
          />
        </Col>
      </Row>

      <DepartmentFormModal
        open={formModalOpen}
        editingDept={editingDept}
        parentDeptId={parentDeptIdForCreate}
        departments={departments}
        loading={createDeptMutation.isLoading || updateDeptMutation.isLoading}
        onCancel={() => setFormModalOpen(false)}
        onSave={handleSaveDept}
      />
    </div>
  );
};

export default DepartmentAdminPage;
