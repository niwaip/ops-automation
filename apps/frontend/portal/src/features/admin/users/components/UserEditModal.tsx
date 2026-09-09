import React, { useEffect, useMemo } from 'react';
import {
  Modal,
  Form,
  Select,
  Input,
  TreeSelect,
  Space,
  Avatar,
  Typography,
} from 'antd';
import {
  SafetyCertificateOutlined,
  ApartmentOutlined,
  IdcardOutlined,
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
}

export const buildDepartmentTreeData = (departments: OrganizationDepartment[]) => {
  const map = new Map<string, { title: string; value: string; key: string; parentId?: string | null; children: any[] }>();
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

export const UserEditModal: React.FC<UserEditModalProps> = ({
  open,
  user,
  departments,
  organizations,
  activeOrgId,
  loading,
  onCancel,
  onSave,
}) => {
  const [form] = Form.useForm();

  useEffect(() => {
    if (open && user) {
      form.setFieldsValue({
        roles: [user.role],
        departmentId: user.department?.id || undefined,
        title: user.title || '',
        orgId: user.organization?.id || activeOrgId || organizations[0]?.id,
      });
    }
  }, [open, user, form, activeOrgId, organizations]);

  const treeData = useMemo(() => buildDepartmentTreeData(departments), [departments]);

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

  const roleOptions = [
    { value: 'employee', label: '普通员工' },
    { value: 'admin', label: '管理员' },
    { value: 'agent', label: '系统 Agent' },
  ];

  return (
    <Modal
      title="配置用户角色与部门架构"
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      confirmLoading={loading}
      destroyOnClose
      width={520}
    >
      {user && (
        <div
          style={{
            margin: '16px 0',
            padding: '12px 16px',
            background: 'var(--bg-secondary, #fafafa)',
            borderRadius: 8,
            border: '1px solid var(--border-color, #f0f0f0)',
          }}
        >
          <Space>
            <Avatar style={{ backgroundColor: '#1890ff', fontWeight: 600 }} size="small">
              {user.username.charAt(0).toUpperCase()}
            </Avatar>
            <Text strong>{user.username}</Text>
            {user.email && <Text type="secondary">({user.email})</Text>}
          </Space>
        </div>
      )}

      <Form form={form} layout="vertical">
        <Form.Item
          name="roles"
          label="系统全局角色"
          rules={[{ required: true, message: '请选择至少一个角色' }]}
        >
          <Select mode="multiple" placeholder="选择角色" suffixIcon={<SafetyCertificateOutlined />}>
            {roleOptions.map((role) => (
              <Option key={role.value} value={role.value}>
                {role.label}
              </Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item
          name="departmentId"
          label="所属部门"
          tooltip="选择该用户所在的组织部门。分配后将用于工作流审批（如部门主管审核）与部门知识库隔离。"
        >
          <TreeSelect
            showSearch
            allowClear
            placeholder="请选择所属部门（可选）"
            treeData={treeData}
            treeDefaultExpandAll
            prefix={<ApartmentOutlined style={{ color: '#1890ff', marginRight: 6 }} />}
          />
        </Form.Item>

        <Form.Item
          name="title"
          label="职务 / 头衔"
          tooltip="例如：研发总监、自动化工程师、产品经理等。"
        >
          <Input
            placeholder="例如：高级运维工程师"
            prefix={<IdcardOutlined style={{ color: '#bfbfbf' }} />}
            maxLength={100}
            allowClear
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};
