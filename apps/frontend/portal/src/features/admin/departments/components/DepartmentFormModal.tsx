import React, { useEffect, useMemo } from 'react';
import { Modal, Form, Input, TreeSelect } from 'antd';
import { ApartmentOutlined, BarcodeOutlined } from '@ant-design/icons';
import type { OrganizationDepartment } from '@/api/organization';
import { buildDepartmentTreeData } from '@/features/admin/users/components/UserEditModal';


interface DepartmentFormModalProps {
  open: boolean;
  editingDept: OrganizationDepartment | null;
  parentDeptId?: string | null;
  departments: OrganizationDepartment[];
  loading: boolean;
  onCancel: () => void;
  onSave: (values: {
    name: string;
    code?: string;
    parentId?: string | null;
  }) => void;
}

export const DepartmentFormModal: React.FC<DepartmentFormModalProps> = ({
  open,
  editingDept,
  parentDeptId,
  departments,
  loading,
  onCancel,
  onSave,
}) => {
  const [form] = Form.useForm();

  // Exclude current editing dept and its children from parent candidates to avoid cycles
  const availableParentDepts = useMemo(() => {
    if (!editingDept) return departments;
    return departments.filter((d) => d.id !== editingDept.id && d.parentId !== editingDept.id);
  }, [departments, editingDept]);

  const treeData = useMemo(() => buildDepartmentTreeData(availableParentDepts), [availableParentDepts]);

  useEffect(() => {
    if (open) {
      if (editingDept) {
        form.setFieldsValue({
          name: editingDept.name,
          code: editingDept.code || '',
          parentId: editingDept.parentId || undefined,
        });
      } else {
        form.resetFields();
        if (parentDeptId) {
          form.setFieldsValue({ parentId: parentDeptId });
        }
      }
    }
  }, [open, editingDept, parentDeptId, form]);

  const handleOk = () => {
    form.validateFields().then((values) => {
      onSave({
        name: values.name.trim(),
        code: values.code?.trim() || undefined,
        parentId: values.parentId || null,
      });
    });
  };

  return (
    <Modal
      title={editingDept ? '编辑部门信息' : '新建组织部门'}
      open={open}
      onOk={handleOk}
      onCancel={() => {
        form.resetFields();
        onCancel();
      }}
      confirmLoading={loading}
      destroyOnClose
      width={480}
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item
          name="name"
          label="部门名称"
          rules={[
            { required: true, message: '请输入部门名称' },
            { min: 2, message: '部门名称至少 2 位' },
          ]}
        >
          <Input placeholder="例如：技术研发中心 / 市场营销部" prefix={<ApartmentOutlined style={{ color: '#1890ff' }} />} />
        </Form.Item>

        <Form.Item
          name="code"
          label="部门编码"
          tooltip="部门的唯一英文标识，例如：TECH_DEV、MARKETING 等。"
        >
          <Input placeholder="例如：TECH_DEV (可选)" prefix={<BarcodeOutlined style={{ color: '#bfbfbf' }} />} />
        </Form.Item>

        <Form.Item
          name="parentId"
          label="上级部门"
          tooltip="不选则作为企业一级直属部门"
        >
          <TreeSelect
            showSearch
            allowClear
            placeholder="无上级（作为一级顶级部门）"
            treeData={treeData}
            treeDefaultExpandAll
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};
