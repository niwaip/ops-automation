import React, { useState, useMemo } from 'react';
import {
  Card,
  Tree,
  Input,
  Button,
  Space,
  Typography,
  Tooltip,
  Popconfirm,
  Empty,
} from 'antd';
import {
  ApartmentOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  ClusterOutlined,
} from '@ant-design/icons';

import type { OrganizationDepartment } from '@/api/organization';
import type { DataNode } from 'antd/es/tree';

const { Text } = Typography;

interface DepartmentTreeCardProps {
  departments: OrganizationDepartment[];
  selectedDeptId: string | null;
  onSelectDept: (dept: OrganizationDepartment | null) => void;
  onCreateTopDept: () => void;
  onCreateSubDept: (parentId: string) => void;
  onEditDept: (dept: OrganizationDepartment) => void;
  onDeleteDept: (deptId: string) => void;
}

export const DepartmentTreeCard: React.FC<DepartmentTreeCardProps> = ({
  departments,
  selectedDeptId,
  onSelectDept,
  onCreateTopDept,
  onCreateSubDept,
  onEditDept,
  onDeleteDept,
}) => {
  const [searchValue, setSearchValue] = useState('');

  // 构建树节点并渲染标题与悬浮动作
  const treeData = useMemo(() => {
    const map = new Map<string, DataNode & { rawDept: OrganizationDepartment }>();
    const roots: (DataNode & { rawDept: OrganizationDepartment })[] = [];

    departments.forEach((d) => {
      const isMatch = searchValue && d.name.toLowerCase().includes(searchValue.toLowerCase());
      const isSelected = d.id === selectedDeptId;

      map.set(d.id, {
        key: d.id,
        rawDept: d,
        title: (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '2px 4px',
              width: '100%',
            }}
          >
            <Space size={6} style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
              <ApartmentOutlined style={{ color: isSelected ? '#1890ff' : '#8c8c8c' }} />
              <Text
                strong={isSelected}
                style={{
                  color: isMatch ? '#fa8c16' : undefined,
                  fontSize: 13,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {d.name}
              </Text>
              {d.code && (
                <Text type="secondary" style={{ fontSize: 11 }}>
                  ({d.code})
                </Text>
              )}
            </Space>

            <Space size={2} onClick={(e) => e.stopPropagation()}>

              <Tooltip title="新增子部门">
                <Button
                  type="text"
                  size="small"
                  icon={<PlusOutlined style={{ fontSize: 11 }} />}
                  onClick={() => onCreateSubDept(d.id)}
                />
              </Tooltip>
              <Tooltip title="编辑部门">
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined style={{ fontSize: 11 }} />}
                  onClick={() => onEditDept(d)}
                />
              </Tooltip>
              <Popconfirm
                title="确认删除该部门？"
                description="若存在子部门需先移除，成员将被设为未分配部门。"
                onConfirm={() => onDeleteDept(d.id)}
                okText="删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
              >
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined style={{ fontSize: 11 }} />}
                />
              </Popconfirm>
            </Space>
          </div>
        ),
        children: [],
      });
    });

    departments.forEach((d) => {
      const node = map.get(d.id);
      if (node) {
        if (d.parentId && map.has(d.parentId)) {
          map.get(d.parentId)!.children!.push(node);
        } else {
          roots.push(node);
        }
      }
    });

    return roots;
  }, [departments, selectedDeptId, searchValue, onCreateSubDept, onEditDept, onDeleteDept]);

  return (
    <Card
      title={
        <Space size={8}>
          <ClusterOutlined style={{ color: '#1890ff' }} />
          <span>部门层级树</span>
          <Text type="secondary" style={{ fontSize: 12, fontWeight: 'normal' }}>
            ({departments.length} 个部门)
          </Text>
        </Space>
      }
      extra={
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined />}
          onClick={onCreateTopDept}
        >
          新建一级部门
        </Button>
      }
      style={{
        borderRadius: 14,
        border: '1px solid var(--bg-secondary)',
        background: 'var(--bg-card)',
        height: '100%',
        minHeight: 520,
      }}
      styles={{ body: { padding: '16px 14px' } }}
    >
      <div style={{ marginBottom: 12 }}>
        <Input
          placeholder="搜索部门名称..."
          prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          allowClear
          size="small"
        />
      </div>

      {departments.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="暂无部门架构"
          style={{ margin: '40px 0' }}
        >
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={onCreateTopDept}>
            立即创建第一个部门
          </Button>
        </Empty>
      ) : (
        <div style={{ maxHeight: 600, overflowY: 'auto' }}>
          <Tree
            showIcon={false}
            blockNode
            defaultExpandAll
            selectedKeys={selectedDeptId ? [selectedDeptId] : []}
            treeData={treeData}
            onSelect={(selectedKeys) => {
              if (selectedKeys.length > 0) {
                const key = selectedKeys[0] as string;
                const found = departments.find((d) => d.id === key);
                onSelectDept(found || null);
              } else {
                onSelectDept(null);
              }
            }}
          />
        </div>
      )}
    </Card>
  );
};
