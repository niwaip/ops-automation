import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Form,
  Select,
  Input,
  TreeSelect,
  Space,
  Avatar,
  Typography,
  Tag,
  Badge,
  Button,
  Alert,
  Tooltip,
} from 'antd';
import {
  SafetyCertificateOutlined,
  ApartmentOutlined,
  IdcardOutlined,
  UserOutlined,
  RobotOutlined,
  KeyOutlined,
  MailOutlined,
  CheckCircleFilled,
  UserSwitchOutlined,
  BankOutlined,
} from '@ant-design/icons';
import type { UserDto } from '@/api/auth';
import type { OrganizationDepartment, OrganizationSummary } from '@/api/organization';

const { Option } = Select;
const { Text } = Typography;

interface UserEditModalProps {
  open: boolean;
  user: UserDto | null;
  departments: OrganizationDepartment[];
  organizations: OrganizationSummary[];
  activeOrgId?: string;
  loading: boolean;
  onCancel: () => void;
  onSave: (values: {
    roles: string[];
    departmentId?: string | null;
    title?: string | null;
    orgId?: string;
  }) => void;
  onOpenResetPassword?: (user: UserDto) => void;
}

const getAvatarColor = (name: string) => {
  const colors = ['#1890ff', '#52c41a', '#722ed1', '#fa8c16', '#eb2f96', '#13c2c2'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

export const buildDepartmentTreeData = (departments: OrganizationDepartment[]) => {
  const map = new Map<
    string,
    { title: string; value: string; key: string; parentId?: string | null; children: any[] }
  >();
  const roots: any[] = [];

  departments.forEach((d) => {
    map.set(d.id, {
      title: d.name,
      value: d.id,
      key: d.id,
      parentId: d.parentId,
      children: [],
    });
  });

  departments.forEach((d) => {
    const node = map.get(d.id);
    if (node) {
      if (d.parentId && map.has(d.parentId)) {
        map.get(d.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
  });

  return roots;
};

// 预设常见职务建议标签
const COMMON_TITLES = [
  '系统架构师',
  '运维工程师',
  '全栈工程师',
  '研发负责人',
  '产品经理',
  '安全审计员',
];

interface RoleOptionConfig {
  value: string;
  label: string;
  badge: string;
  color: string;
  icon: React.ReactNode;
  desc: string;
}

const ROLE_CONFIGS: RoleOptionConfig[] = [
  {
    value: 'employee',
    label: '普通员工',
    badge: '标准访问',
    color: '#1890ff',
    icon: <UserOutlined style={{ fontSize: 16, color: '#1890ff' }} />,
    desc: '具备平台基础权限，可发起审批、运行工作流及查看协作报表。',
  },
  {
    value: 'admin',
    label: '系统管理员',
    badge: '完全控制',
    color: '#eb2f96',
    icon: <SafetyCertificateOutlined style={{ fontSize: 16, color: '#eb2f96' }} />,
    desc: '拥有全系统最高管理权限，包括账号角色、组织架构、发布管控与审计。',
  },
  {
    value: 'agent',
    label: '系统 Agent',
    badge: '机器人身份',
    color: '#722ed1',
    icon: <RobotOutlined style={{ fontSize: 16, color: '#722ed1' }} />,
    desc: '自动化任务与调度运行凭证，用于系统间自动化触发与 API 调用。',
  },
];

export const UserEditModal: React.FC<UserEditModalProps> = ({
  open,
  user,
  departments,
  organizations,
  activeOrgId,
  loading,
  onCancel,
  onSave,
  onOpenResetPassword,
}) => {
  const [form] = Form.useForm();
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);

  useEffect(() => {
    if (open && user) {
      const initialRoles = [user.role];
      setSelectedRoles(initialRoles);
      form.setFieldsValue({
        roles: initialRoles,
        departmentId: user.department?.id || undefined,
        title: user.title || '',
        orgId: user.organization?.id || activeOrgId || organizations[0]?.id,
      });
    }
  }, [open, user, form, activeOrgId, organizations]);

  const treeData = useMemo(() => buildDepartmentTreeData(departments), [departments]);

  const toggleRole = (roleValue: string) => {
    let next: string[];
    if (selectedRoles.includes(roleValue)) {
      if (selectedRoles.length === 1) {
        // 至少保留一个角色
        return;
      }
      next = selectedRoles.filter((r) => r !== roleValue);
    } else {
      next = [...selectedRoles, roleValue];
    }
    setSelectedRoles(next);
    form.setFieldsValue({ roles: next });
  };

  const handleSelectQuickTitle = (t: string) => {
    form.setFieldsValue({ title: t });
  };

  const handleOk = () => {
    form.validateFields().then((values) => {
      onSave({
        roles: values.roles,
        departmentId: values.departmentId || null,
        title: values.title?.trim() || null,
        orgId: values.orgId || activeOrgId || organizations[0]?.id,
      });
    });
  };

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 4 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #1890ff 0%, #36cfc9 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 20,
              boxShadow: '0 4px 12px rgba(24, 144, 255, 0.25)',
            }}
          >
            <UserSwitchOutlined />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary, #1f2937)' }}>
              配置用户角色与部门架构
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary, #6b7280)', fontWeight: 400 }}>
              分配所属组织部门、职务头衔以及系统全局访问角色
            </div>
          </div>
        </div>
      }
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      confirmLoading={loading}
      okText="保存配置"
      cancelText="取消"
      destroyOnClose
      width={640}
      styles={{
        content: {
          borderRadius: 16,
          overflow: 'hidden',
          padding: '24px 28px',
        },
      }}
    >
      {/* 用户基本信息卡片 */}
      {user && (
        <div
          style={{
            margin: '16px 0 20px',
            padding: '16px 20px',
            background: 'linear-gradient(135deg, rgba(24, 144, 255, 0.05) 0%, rgba(114, 46, 209, 0.04) 100%)',
            borderRadius: 12,
            border: '1px solid rgba(24, 144, 255, 0.16)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <Space size={14}>
            <Avatar
              style={{
                backgroundColor: getAvatarColor(user.username),
                fontWeight: 600,
                fontSize: 18,
              }}
              size={48}
            >
              {user.username.charAt(0).toUpperCase()}
            </Avatar>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary, #1f2937)' }}>
                  {user.username}
                </span>
                <Badge
                  status={user.isActive ? 'success' : 'error'}
                  text={
                    <span style={{ fontSize: 12, color: user.isActive ? '#52c41a' : '#ff4d4f' }}>
                      {user.isActive ? '状态正常' : '已禁用'}
                    </span>
                  }
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                {user.email ? (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    <MailOutlined style={{ marginRight: 4 }} />
                    {user.email}
                  </Text>
                ) : (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    未绑定邮箱
                  </Text>
                )}
                {user.department && (
                  <Tag color="cyan" style={{ borderRadius: 4, margin: 0, fontSize: 11 }}>
                    <ApartmentOutlined style={{ marginRight: 4 }} />
                    {user.department.name}
                  </Tag>
                )}
              </div>
            </div>
          </Space>

          {onOpenResetPassword && (
            <Tooltip title="快捷重置该用户的系统登录密码">
              <Button
                icon={<KeyOutlined />}
                size="small"
                onClick={() => onOpenResetPassword(user)}
                style={{ borderRadius: 6 }}
              >
                重置密码
              </Button>
            </Tooltip>
          )}
        </div>
      )}

      <Form form={form} layout="vertical" requiredMark={false}>
        {/* 区域一：所属部门与职务 */}
        <div
          style={{
            background: 'var(--bg-secondary, #fafafa)',
            borderRadius: 12,
            padding: '16px 18px 8px',
            marginBottom: 20,
            border: '1px solid var(--border-color, #f0f0f0)',
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text-primary, #1f2937)',
              marginBottom: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <ApartmentOutlined style={{ color: '#1890ff' }} />
            组织部门与职务架构
          </div>

          {organizations.length > 1 && (
            <Form.Item name="orgId" label={<span style={{ fontSize: 13, fontWeight: 500 }}>所属企业组织</span>}>
              <Select placeholder="选择企业组织" suffixIcon={<BankOutlined />}>
                {organizations.map((org) => (
                  <Option key={org.id} value={org.id}>
                    {org.name}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          )}

          <Form.Item
            name="departmentId"
            label={<span style={{ fontSize: 13, fontWeight: 500 }}>所属部门</span>}
            tooltip="分配后用于工作流审批流转（如主管审核）、部门知识库访问与权限隔离。"
          >
            <TreeSelect
              showSearch
              allowClear
              placeholder="请选择所属组织部门（留空则为未分配）"
              treeData={treeData}
              treeDefaultExpandAll
              prefix={<ApartmentOutlined style={{ color: '#1890ff', marginRight: 6 }} />}
              style={{ width: '100%' }}
            />
          </Form.Item>

          <Form.Item
            name="title"
            label={<span style={{ fontSize: 13, fontWeight: 500 }}>职务 / 头衔</span>}
            tooltip="标识该用户在当前部门内的具体职责分工，例如：系统架构师、运维主管等。"
            style={{ marginBottom: 8 }}
          >
            <Input
              placeholder="例如：高级运维工程师"
              prefix={<IdcardOutlined style={{ color: 'var(--text-tertiary, #bfbfbf)' }} />}
              maxLength={100}
              allowClear
              style={{ borderRadius: 8 }}
            />
          </Form.Item>

          {/* 常用头衔快捷标签 */}
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary, #8c8c8c)' }}>快捷标签：</span>
            {COMMON_TITLES.map((t) => (
              <Tag
                key={t}
                onClick={() => handleSelectQuickTitle(t)}
                style={{
                  cursor: 'pointer',
                  borderRadius: 4,
                  fontSize: 12,
                  padding: '1px 8px',
                  background: 'var(--bg-card, #fff)',
                  border: '1px dashed var(--border-color, #d9d9d9)',
                }}
              >
                {t}
              </Tag>
            ))}
          </div>
        </div>

        {/* 区域二：系统全局角色 */}
        <div
          style={{
            background: 'var(--bg-secondary, #fafafa)',
            borderRadius: 12,
            padding: '16px 18px 12px',
            marginBottom: 16,
            border: '1px solid var(--border-color, #f0f0f0)',
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text-primary, #1f2937)',
              marginBottom: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <SafetyCertificateOutlined style={{ color: '#52c41a' }} />
            系统全局访问角色
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary, #8c8c8c)', marginBottom: 14 }}>
            决定该用户在运维自动化平台上的功能模块访问权限与控制中心操作范围（支持多选）
          </div>

          <Form.Item
            name="roles"
            rules={[{ required: true, message: '请至少选择一个系统角色' }]}
            style={{ marginBottom: 4 }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {ROLE_CONFIGS.map((cfg) => {
                const isSelected = selectedRoles.includes(cfg.value);
                return (
                  <div
                    key={cfg.value}
                    onClick={() => toggleRole(cfg.value)}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      borderRadius: 10,
                      cursor: 'pointer',
                      border: isSelected
                        ? `2px solid ${cfg.color}`
                        : '1px solid var(--border-color, #e5e7eb)',
                      background: isSelected
                        ? `linear-gradient(135deg, ${cfg.color}0a 0%, #ffffff 100%)`
                        : 'var(--bg-card, #ffffff)',
                      boxShadow: isSelected ? `0 2px 8px ${cfg.color}25` : 'none',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          background: `${cfg.color}15`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginTop: 2,
                        }}
                      >
                        {cfg.icon}
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary, #1f2937)' }}>
                            {cfg.label}
                          </span>
                          <Tag
                            style={{
                              borderRadius: 4,
                              fontSize: 11,
                              padding: '0 6px',
                              color: cfg.color,
                              borderColor: `${cfg.color}40`,
                              background: `${cfg.color}10`,
                            }}
                          >
                            {cfg.badge}
                          </Tag>
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: 'var(--text-secondary, #6b7280)',
                            marginTop: 4,
                            lineHeight: 1.5,
                          }}
                        >
                          {cfg.desc}
                        </div>
                      </div>
                    </div>

                    <div style={{ marginTop: 4 }}>
                      {isSelected ? (
                        <CheckCircleFilled style={{ color: cfg.color, fontSize: 18 }} />
                      ) : (
                        <div
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: '50%',
                            border: '2px solid #d9d9d9',
                          }}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Form.Item>
        </div>
      </Form>

      <Alert
        type="info"
        showIcon
        style={{ borderRadius: 8, fontSize: 12 }}
        message="配置生效说明"
        description="角色与部门信息保存后即刻在全平台生效。若关联了工作流或部门审核节点，下一次审批路由将直接依据最新组织架构派发。"
      />
    </Modal>
  );
};
