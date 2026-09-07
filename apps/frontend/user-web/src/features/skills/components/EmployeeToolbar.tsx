import type { FC } from 'react';
import { Button, Input, Select } from 'antd';
import {
  ClearOutlined,
  FilterOutlined,
  SearchOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import styles from './EmployeeManagement.module.css';

interface EmployeeToolbarProps {
  searchText: string;
  onSearchTextChange: (val: string) => void;
  statusFilter?: string;
  onStatusFilterChange: (val?: string) => void;
  totalCount: number;
  filteredCount: number;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}

const STATUS_OPTIONS = [
  { value: 'all', label: '全部状态' },
  { value: 'authorized', label: '已在岗 (已授权)' },
  { value: 'requested', label: '申请中' },
  { value: 'available', label: '待开通' },
  { value: 'rejected', label: '申请未通过' },
  { value: 'scheduled', label: '有定时排班' },
];

export const EmployeeToolbar: FC<EmployeeToolbarProps> = ({
  searchText,
  onSearchTextChange,
  statusFilter,
  onStatusFilterChange,
  totalCount,
  filteredCount,
  hasActiveFilters,
  onClearFilters,
}) => {
  return (
    <div className={styles['employee-toolbar']}>
      <div className={styles['employee-toolbar-header']}>
        <div className={styles['employee-toolbar-title-box']}>
          <span className={styles['employee-toolbar-icon-badge']}>
            <TeamOutlined />
          </span>
          <div>
            <span className={styles['employee-toolbar-title']}>数字员工阵容与调度</span>
            <span className={styles['employee-toolbar-subtitle']}>
              {' '}
              · 统一管理企业数字员工岗位职责、排班执勤与指派协同
            </span>
          </div>
        </div>

        <div className={styles['employee-toolbar-stats-text']}>
          共 <strong>{totalCount}</strong> 位数字员工
          {hasActiveFilters && (
            <span>
              {' '}(当前匹配 <strong>{filteredCount}</strong> 位)
            </span>
          )}
        </div>
      </div>

      <div className={styles['employee-toolbar-controls']}>
        <Input
          className={styles['employee-search-input']}
          placeholder="搜索数字员工名称、岗位职责、关键词或工具..."
          prefix={<SearchOutlined style={{ color: 'var(--text-secondary)' }} />}
          value={searchText}
          onChange={(e) => onSearchTextChange(e.target.value)}
          allowClear
          size="middle"
        />

        <Select
          className={styles['employee-filter-select']}
          placeholder="状态筛选"
          value={statusFilter || 'all'}
          onChange={(val) => onStatusFilterChange(val === 'all' ? undefined : val)}
          suffixIcon={<FilterOutlined style={{ color: 'var(--text-secondary)' }} />}
          size="middle"
          popupMatchSelectWidth={false}
        >
          {STATUS_OPTIONS.map((opt) => (
            <Select.Option key={opt.value} value={opt.value}>
              {opt.label}
            </Select.Option>
          ))}
        </Select>

        {hasActiveFilters && (
          <Button
            size="middle"
            type="dashed"
            icon={<ClearOutlined />}
            onClick={onClearFilters}
            style={{ borderRadius: 999 }}
          >
            清空筛选
          </Button>
        )}
      </div>
    </div>
  );
};
