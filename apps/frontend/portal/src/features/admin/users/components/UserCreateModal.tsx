import React, { useMemo } from 'react';
import {
  Modal,
  Form,
  Select,
  Input,
  TreeSelect,
} from 'antd';
import {
  UserOutlined,
  MailOutlined,
  ApartmentOutlined,
  IdcardOutlined,
} from '@ant-design/icons';
import type { OrganizationDepartment } from '@/api/organization';
import { buildDepartmentTreeData } from './UserEditModal';

const { Option } = Select;

interface UserCreateModalProps {
  open: boolean;
  departments: OrganizationDepartment[];
  loading: boolean;
  onCancel: () => void;
  onCreate: (values: {
    username: string;
    password: string;
    email?: string;
    role: string;
    departmentId?: string | null;
    title?: string | null;
  }) => void;
}

export const UserCreateModal: React.FC<UserCreateModalProps> = ({
  open,
  departments,
  loading,
  onCancel,
  onCreate,
}) => {
  const [form] = Form.useForm();

  const treeData = useMemo(() => buildDepartmentTreeData(departments), [departments]);

  const handleOk = () => {
    form.validateFields().then((values) => {
      onCreate({
        username: values.username.trim(),
        password: values.password,
        email: values.email?.trim() || undefined,
        role: values.role,
        departmentId: values.departmentId || null,
        title: values.title?.trim() || null,
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
      title="创建新用户"
      open={open}
      onOk={handleOk}
      onCancel={() => {
        form.resetFields();
        onCancel();
      }}
      confirmLoading={loading}
      destroyOnClose
      width={520}
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item
          name="username"
          label="用户名"
          rules={[
            { required: true, message: '请输入用户名' },
            { min: 3, message: '用户名至少 3 位' },
          ]}
        >
          <Input placeholder="请输入登录账号" prefix={<UserOutlined style={{ color: '#bfbfbf' }} />} />
        </Form.Item>

        <Form.Item
          name="password"
          label="初始密码"
          rules={[
            { required: true, message: '请输入初始密码' },
            { min: 6, message: '密码至少 6 位' },
          ]}
        >
          <Input.Password placeholder="请输入初始密码（至少6位）" />
        </Form.Item>

        <Form.Item
          name="email"
          label="电子邮箱"
          rules={[{ type: 'email', message: '请输入合法的邮箱地址' }]}
        >
          <Input placeholder="user@company.com (可选)" prefix={<MailOutlined style={{ color: '#bfbfbf' }} />} />
        </Form.Item>

        <Form.Item
          name="role"
          label="系统角色"
          initialValue="employee"
          rules={[{ required: true, message: '请选择角色' }]}
        >
          <Select>
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
          tooltip="选择该用户所在的组织部门（可选，后续可在列表中随时调整）"
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
        >
          <Input
            placeholder="例如：高级前端开发、业务主管"
            prefix={<IdcardOutlined style={{ color: '#bfbfbf' }} />}
            maxLength={100}
            allowClear
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};
