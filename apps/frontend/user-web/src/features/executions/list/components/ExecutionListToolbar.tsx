import React from 'react';
import styles from '../../pages/ExecutionListPage.module.css';
import { Button, DatePicker, Input, Select, Typography } from 'antd';
import {
  CarryOutOutlined,
  DeleteOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import type { ExecutionStatus } from '@/api/execution';

const { Text } = Typography;

interface ExecutionListToolbarProps {
  filteredCount: number;
  total: number;
  searchText: string;
  onSearchTextChange: (value: string) => void;
  statusFilter?: ExecutionStatus;
  onStatusFilterChange: (value?: ExecutionStatus) => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  isFetching: boolean;
  onRefresh: () => void;
  onCreate: () => void;
  clearBeforeDate: Dayjs;
  onClearBeforeDateChange: (value: Dayjs | null) => void;
  onCleanup: () => void;
  cleanupLoading: boolean;
  statusOptions: Array<{ value?: ExecutionStatus; label: string }>;
}

const ExecutionListToolbar: React.FC<ExecutionListToolbarProps> = ({
  filteredCount,
  total,
  searchText,
  onSearchTextChange,
  statusFilter,
  onStatusFilterChange,
  hasActiveFilters,
  onClearFilters,
  isFetching,
  onRefresh,
  onCreate,
  clearBeforeDate,
  onClearBeforeDateChange,
  onCleanup,
  cleanupLoading,
  statusOptions,
}) => {
  return (
    <div className={styles['execution-list-toolbar']}>
      <div className={styles['execution-list-toolbar-heading']}>
        <div className={styles['execution-list-toolbar-title-row']}>
          <span className={styles['execution-list-toolbar-icon-badge']}>
            <CarryOutOutlined />
          </span>
          <Text strong className={styles['execution-list-toolbar-title']}>
            任务中心
          </Text>
        </div>
        <Text type="secondary" className={styles['execution-list-toolbar-subtitle']}>
          实时追踪指派给数字员工的任务执行进度、目标产出与耗时指标 (显示 {filteredCount} / 共 {total} 项)
        </Text>
      </div>
      <div className={styles['execution-list-toolbar-row']}>
        <div className={styles['execution-list-toolbar-main']}>
          <div className={styles['execution-list-toolbar-controls']}>
            <Input
              className={`${styles['execution-search-input']} ${styles['execution-list-filter-control']}`}
              size="middle"
              placeholder="搜索员工名称、任务单号、输入目标或交付成果..."
              prefix={<SearchOutlined style={{ color: 'var(--text-secondary)' }} />}
              value={searchText}
              onChange={(e) => onSearchTextChange(e.target.value)}
              allowClear
            />
            <Select
              className={`${styles['execution-status-filter']} ${styles['execution-list-filter-control']}`}
              size="middle"
              placeholder="全部状态"
              allowClear
              value={statusFilter}
              onChange={(value) => onStatusFilterChange(value)}
              popupMatchSelectWidth={false}
            >
              {statusOptions.map((option) => (
                <Select.Option key={option.value ?? 'all'} value={option.value}>
                  {option.label}
                </Select.Option>
              ))}
            </Select>
            {hasActiveFilters ? (
              <Button
                size="small"
                type="text"
                className={styles['execution-list-clear-chip']}
                onClick={onClearFilters}
              >
                清空筛选
              </Button>
            ) : null}
          </div>
        </div>
        <div className={styles['execution-list-toolbar-actions']}>
          <Button
            size="middle"
            icon={<ReloadOutlined />}
            onClick={onRefresh}
            loading={isFetching}
            className={styles['btn-pill']}
          >
            刷新
          </Button>
          <Button
            size="middle"
            type="primary"
            icon={<PlusOutlined />}
            onClick={onCreate}
            className={styles['btn-pill']}
          >
            新建
          </Button>
          <DatePicker
            size="middle"
            value={clearBeforeDate}
            onChange={onClearBeforeDateChange}
            allowClear={false}
            format="YYYY-MM-DD"
            className={styles['execution-list-date-picker']}
          />
          <Button
            size="middle"
            danger
            icon={<DeleteOutlined />}
            onClick={onCleanup}
            loading={cleanupLoading}
            className={styles['btn-pill']}
          >
            清理
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ExecutionListToolbar;
