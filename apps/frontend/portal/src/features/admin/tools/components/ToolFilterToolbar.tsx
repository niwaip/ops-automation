import React from 'react';
import { Button, Input, Select, Space } from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import type { ToolCatalogFilters } from '@/api/tool-catalog';
import { TOOL_STATUS_OPTIONS } from '../constants/toolConstants';

const { Option } = Select;

interface ToolFilterToolbarProps {
  searchInput: string;
  onSearchInputChange: (val: string) => void;
  filters: ToolCatalogFilters;
  onApplyFilters: (next: Partial<ToolCatalogFilters>) => void;
  onReset: () => void;
  onRefresh: () => void;
  categories: string[];
  runtimeTypes: string[];
  loading?: boolean;
}

export const ToolFilterToolbar: React.FC<ToolFilterToolbarProps> = ({
  searchInput,
  onSearchInputChange,
  filters,
  onApplyFilters,
  onReset,
  onRefresh,
  categories,
  runtimeTypes,
  loading,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 16,
      }}
    >
      <Space wrap size="middle">
        <Input
          placeholder="搜索能力标识 / 显示名称 / 描述..."
          prefix={<SearchOutlined style={{ color: 'var(--text-secondary)' }} />}
          value={searchInput}
          onChange={(e) => onSearchInputChange(e.target.value)}
          onPressEnter={() => onApplyFilters({ keyword: searchInput.trim() || undefined })}
          allowClear
          style={{ width: 280, borderRadius: 8 }}
        />
        <Button
          type="primary"
          ghost
          icon={<SearchOutlined />}
          style={{ borderRadius: 8 }}
          onClick={() => onApplyFilters({ keyword: searchInput.trim() || undefined })}
        >
          搜索
        </Button>

        <Select
          allowClear
          placeholder="启用状态"
          style={{ width: 130 }}
          value={filters.status}
          onChange={(value) => onApplyFilters({ status: value })}
        >
          {TOOL_STATUS_OPTIONS.map((option) => (
            <Option key={option.value} value={option.value}>
              {option.label}
            </Option>
          ))}
        </Select>

        <Select
          allowClear
          placeholder="能力类别"
          style={{ width: 140 }}
          value={filters.category}
          onChange={(value) => onApplyFilters({ category: value })}
        >
          {categories.map((category) => (
            <Option key={category} value={category}>
              {category}
            </Option>
          ))}
        </Select>

        <Select
          allowClear
          placeholder="运行类型"
          style={{ width: 140 }}
          value={filters.runtimeType}
          onChange={(value) => onApplyFilters({ runtimeType: value })}
        >
          {runtimeTypes.map((runtimeType) => (
            <Option key={runtimeType} value={runtimeType}>
              {runtimeType}
            </Option>
          ))}
        </Select>

        <Select
          allowClear
          placeholder="Skill 绑定策略"
          style={{ width: 150 }}
          value={filters.allowSkillBinding}
          onChange={(value) => onApplyFilters({ allowSkillBinding: value })}
        >
          <Option value={true}>允许绑定</Option>
          <Option value={false}>禁止绑定</Option>
        </Select>
      </Space>

      <Space>
        <Button onClick={onReset} style={{ borderRadius: 8 }}>
          重置
        </Button>
        <Button
          icon={<ReloadOutlined spin={loading} />}
          onClick={onRefresh}
          style={{ borderRadius: 8 }}
        >
          刷新
        </Button>
      </Space>
    </div>
  );
};
