import React, { useMemo, useState } from 'react';
import {
  Modal,
  Tabs,
  Table,
  Button,
  Space,
  Card,
  Alert,
  Input,
  Tag,
  Tooltip,
  Divider,
} from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import {
  SkillConfigDTO,
  SkillPermissionDTO,
  SkillAccessRequestReviewDTO,
} from '@/api/skill';
import { SkillAccessRequestReviewTab } from './SkillAccessRequestReviewTab';
import type { ColumnsType } from 'antd/es/table';

const { TabPane } = Tabs;

interface SkillPermissionModalProps {
  open: boolean;
  selectedSkill: SkillConfigDTO | null;
  onClose: () => void;
  permissions?: SkillPermissionDTO[];
  permissionsLoading?: boolean;
  roles?: Array<{ id: string; name: string }>;
  rolesLoading?: boolean;
  permissionUsers?: Array<{
    id: string;
    username: string;
    email?: string | null;
    role: string;
    isActive: boolean;
  }>;
  permissionUsersLoading?: boolean;
  accessRequests?: SkillAccessRequestReviewDTO[];
  accessRequestsLoading?: boolean;
  approvedAccessRequests?: SkillAccessRequestReviewDTO[];
  approvedAccessRequestsLoading?: boolean;
  rejectedAccessRequests?: SkillAccessRequestReviewDTO[];
  rejectedAccessRequestsLoading?: boolean;
  processingAccessRequestId?: string | null;
  processingAccessRequestAction?: 'approve' | 'reject' | null;
  grantLoading?: boolean;
  onGrantRole: (roleId: string) => void;
  onRevokeRole: (roleId: string) => void;
  onApproveAccessRequest: (
    request: SkillAccessRequestReviewDTO,
    responseNote?: string
  ) => void;
  onRejectAccessRequest: (
    request: SkillAccessRequestReviewDTO,
    responseNote?: string
  ) => void;
}

export const SkillPermissionModal: React.FC<SkillPermissionModalProps> = ({
  open,
  selectedSkill,
  onClose,
  permissions = [],
  permissionsLoading = false,
  roles = [],
  rolesLoading = false,
  permissionUsers = [],
  permissionUsersLoading = false,
  accessRequests = [],
  accessRequestsLoading = false,
  approvedAccessRequests = [],
  approvedAccessRequestsLoading = false,
  rejectedAccessRequests = [],
  rejectedAccessRequestsLoading = false,
  processingAccessRequestId = null,
  processingAccessRequestAction = null,
  grantLoading = false,
  onGrantRole,
  onRevokeRole,
  onApproveAccessRequest,
  onRejectAccessRequest,
}) => {
  const { t } = useTranslation(['common', 'admin']);
  const [permissionUserSearch, setPermissionUserSearch] = useState('');

  const grantedRoleIds = useMemo(
    () => permissions.map((p) => p.roleId),
    [permissions]
  );

  const roleNameToRoleIdMap = useMemo(
    () =>
      new Map(roles.map((role) => [role.name.trim().toLowerCase(), role.id])),
    [roles]
  );

  const availableRoles = useMemo(
    () => roles.filter((r) => !grantedRoleIds.includes(r.id)),
    [roles, grantedRoleIds]
  );

  const filteredPermissionUsers = useMemo(() => {
    const keyword = permissionUserSearch.trim().toLowerCase();
    if (!keyword) return permissionUsers;
    return permissionUsers.filter((user) => {
      return (
        user.username.toLowerCase().includes(keyword) ||
        (user.email || '').toLowerCase().includes(keyword) ||
        user.role.toLowerCase().includes(keyword)
      );
    });
  }, [permissionUsers, permissionUserSearch]);

  const handledAccessRequests = useMemo(
    () =>
      [...approvedAccessRequests, ...rejectedAccessRequests].sort(
        (left, right) => {
          const leftTime = new Date(
            left.processedAt || left.updatedAt
          ).getTime();
          const rightTime = new Date(
            right.processedAt || right.updatedAt
          ).getTime();
          return rightTime - leftTime;
        }
      ),
    [approvedAccessRequests, rejectedAccessRequests]
  );

  const permissionColumns: ColumnsType<SkillPermissionDTO> = [
    {
      title: t('admin:roleName'),
      dataIndex: 'roleName',
      key: 'roleName',
    },
    {
      title: t('admin:grantedAt'),
      dataIndex: 'grantedAt',
      key: 'grantedAt',
      render: (date: string) => new Date(date).toLocaleString(),
    },
    {
      title: t('common:actions'),
      key: 'actions',
      render: (_, record) => (
        <Button
          type="link"
          size="small"
          danger
          onClick={() => onRevokeRole(record.roleId)}
        >
          {t('admin:revoke')}
        </Button>
      ),
    },
  ];

  if (!selectedSkill) return null;

  return (
    <Modal
      title={`${t('admin:permissionManagement')} - ${selectedSkill.name}`}
      open={open}
      onCancel={onClose}
      footer={null}
      width={980}
      styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
    >
      <Tabs defaultActiveKey="granted">
        <TabPane tab={t('admin:grantedRoles')} key="granted">
          <Table
            columns={permissionColumns}
            dataSource={permissions}
            rowKey="roleId"
            loading={permissionsLoading}
            pagination={false}
          />
        </TabPane>
        <TabPane tab={t('admin:availableRoles')} key="available">
          <Space direction="vertical" style={{ width: '100%' }}>
            {availableRoles.map((role) => (
              <Card
                key={role.id}
                size="small"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>{role.name}</span>
                <Button
                  type="primary"
                  size="small"
                  onClick={() => onGrantRole(role.id)}
                  loading={grantLoading}
                >
                  {t('admin:grant')}
                </Button>
              </Card>
            ))}
            {availableRoles.length === 0 && (
              <div
                style={{
                  textAlign: 'center',
                  color: 'var(--text-light)',
                  padding: 20,
                }}
              >
                {t('admin:noAvailableRoles')}
              </div>
            )}
          </Space>
        </TabPane>
        <TabPane tab="用户视图" key="users">
          <Space direction="vertical" style={{ width: '100%' }}>
            <Alert
              type="info"
              showIcon
              message="说明"
              description="当前技能权限按角色生效。点击某个用户的“授权该用户角色”，会给该用户所属角色授权。"
            />
            <Input
              placeholder="搜索用户（用户名/邮箱/角色）"
              prefix={<SearchOutlined />}
              value={permissionUserSearch}
              onChange={(e) => setPermissionUserSearch(e.target.value)}
              allowClear
            />
            <Table
              rowKey="id"
              loading={permissionUsersLoading || rolesLoading}
              dataSource={filteredPermissionUsers}
              pagination={{ pageSize: 8 }}
              locale={{ emptyText: '暂无可展示用户' }}
              scroll={{ x: 920 }}
              columns={[
                {
                  title: '用户名',
                  dataIndex: 'username',
                  key: 'username',
                },
                {
                  title: '邮箱',
                  dataIndex: 'email',
                  key: 'email',
                  render: (email: string) => email || '-',
                },
                {
                  title: '角色',
                  dataIndex: 'role',
                  key: 'role',
                  render: (role: string) => <Tag>{role}</Tag>,
                },
                {
                  title: '状态',
                  dataIndex: 'isActive',
                  key: 'isActive',
                  render: (isActive: boolean) => (
                    <Tag color={isActive ? 'success' : 'error'}>
                      {isActive ? '启用' : '停用'}
                    </Tag>
                  ),
                },
                {
                  title: '技能可用',
                  key: 'permission',
                  render: (_: unknown, record: { role: string }) => {
                    const normalizedRole = (record.role || '').trim().toLowerCase();
                    const roleId = roleNameToRoleIdMap.get(normalizedRole);
                    const granted = !!roleId && grantedRoleIds.includes(roleId);
                    return (
                      <Tag color={granted ? 'success' : 'default'}>
                        {granted ? '已可用' : '未授权'}
                      </Tag>
                    );
                  },
                },
                {
                  title: '操作',
                  key: 'actions',
                  render: (
                    _: unknown,
                    record: { role: string; isActive: boolean }
                  ) => {
                    const normalizedRole = (record.role || '').trim().toLowerCase();
                    const roleId = roleNameToRoleIdMap.get(normalizedRole);
                    const granted = !!roleId && grantedRoleIds.includes(roleId);
                    const cannotMapRole = !roleId;
                    return (
                      <Tooltip
                        title={
                          cannotMapRole
                            ? `未找到角色映射：${record.role}`
                            : undefined
                        }
                      >
                        <Button
                          type="primary"
                          size="small"
                          disabled={!record.isActive || granted || cannotMapRole}
                          loading={grantLoading}
                          onClick={() => roleId && onGrantRole(roleId)}
                        >
                          授权该用户角色
                        </Button>
                      </Tooltip>
                    );
                  },
                },
              ]}
            />
          </Space>
        </TabPane>
        <TabPane
          tab={`授权申请 (${accessRequests.length})`}
          key="requests"
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            <Alert
              type="info"
              showIcon
              message="待处理申请"
              description="批准后会按申请人的当前角色授予该技能权限；拒绝后仅关闭本次申请，不会影响已有权限。"
            />
            <SkillAccessRequestReviewTab
              requests={accessRequests}
              loading={accessRequestsLoading}
              processingRequestId={processingAccessRequestId}
              processingAction={processingAccessRequestAction}
              onApprove={onApproveAccessRequest}
              onReject={onRejectAccessRequest}
            />
            <Divider style={{ margin: '8px 0' }}>最近已处理</Divider>
            <SkillAccessRequestReviewTab
              requests={handledAccessRequests}
              loading={approvedAccessRequestsLoading || rejectedAccessRequestsLoading}
              enableReviewActions={false}
              emptyText="当前没有已处理的授权申请"
            />
          </Space>
        </TabPane>
      </Tabs>
    </Modal>
  );
};
