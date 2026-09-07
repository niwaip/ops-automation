import React, { useEffect, useState } from 'react';
import { Modal, Checkbox, Space, Typography, Tag, message, Spin, Alert, theme } from 'antd';
import { KeyOutlined, TeamOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { roleApi } from '@/api/skill';
import { orgWorkflowApi, type OrganizationWorkflowDTO } from '@/api/orgWorkflow';

interface OrgWorkflowPermissionModalProps {
  visible: boolean;
  workflow: OrganizationWorkflowDTO | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const OrgWorkflowPermissionModal: React.FC<OrgWorkflowPermissionModalProps> = ({
  visible,
  workflow,
  onClose,
  onSuccess,
}) => {
  const { token } = theme.useToken();
  const queryClient = useQueryClient();
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);

  const { data: rolesData, isLoading: isRolesLoading } = useQuery(
    ['roles-list'],
    () => roleApi.list(),
    { enabled: visible }
  );

  useEffect(() => {
    if (workflow) {
      setSelectedRoles(workflow.grantedRoleIds || []);
    }
  }, [workflow, visible]);

  const updateMutation = useMutation(
    (roles: string[]) => {
      if (!workflow) throw new Error('No workflow selected');
      return orgWorkflowApi.updatePermissions(workflow.id, roles);
    },
    {
      onSuccess: () => {
        message.success('权限角色配置已更新');
        queryClient.invalidateQueries(['admin-org-workflows']);
        onSuccess();
        onClose();
      },
      onError: (err: any) => {
        message.error(`更新权限失败: ${err.message || '未知错误'}`);
      },
    }
  );

  const availableRoles = rolesData?.roles || [
    { id: 'employee', name: 'employee', description: '普通员工角色' },
    { id: 'admin', name: 'admin', description: '系统管理员角色' },
    { id: 'finance', name: 'finance', description: '财务专员' },
    { id: 'hr', name: 'hr', description: 'HR 人事专员' },
  ];

  const handleToggle = (roleNameOrId: string) => {
    setSelectedRoles((prev) =>
      prev.includes(roleNameOrId)
        ? prev.filter((r) => r !== roleNameOrId)
        : [...prev, roleNameOrId]
    );
  };

  const handleSave = () => {
    updateMutation.mutate(selectedRoles);
  };

  return (
    <Modal
      title={
        <Space>
          <KeyOutlined style={{ color: '#1677ff' }} />
          <span>企业工作流权限角色配置 - {workflow?.name}</span>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      onOk={handleSave}
      confirmLoading={updateMutation.isLoading}
      okText="保存权限设置"
      cancelText="取消"
      width={520}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8 }}>
        <Alert
          message="与普通技能统一的权限模型"
          description="被授权角色的员工在 5174 组织工作流目录中可直接发起提单；未被授权的员工将展示为「未开通 (支持申请)」，提交后由管理员在此审核开通。"
          type="info"
          showIcon
        />

        {isRolesLoading ? (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Spin />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Typography.Text strong>
              <TeamOutlined style={{ marginRight: 6 }} />
              选择有权使用此企业工作流的系统角色：
            </Typography.Text>

            {availableRoles.map((role) => {
              const key = role.name || role.id;
              const isChecked =
                selectedRoles.includes(key) || selectedRoles.includes(role.id);

              return (
                <div
                  key={role.id}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: isChecked
                      ? `1px solid ${token.colorPrimary}`
                      : `1px solid ${token.colorBorderSecondary}`,
                    background: isChecked ? token.colorInfoBg : token.colorBgContainer,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                  }}
                  onClick={() => handleToggle(key)}
                >
                  <Checkbox checked={isChecked}>
                    <Space>
                      <strong style={{ fontSize: 14 }}>{role.name}</strong>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {(role as any).description || '业务角色'}
                      </span>
                    </Space>
                  </Checkbox>
                  <Tag color={isChecked ? 'blue' : 'default'}>
                    {isChecked ? '已授权' : '未授权'}
                  </Tag>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
};
