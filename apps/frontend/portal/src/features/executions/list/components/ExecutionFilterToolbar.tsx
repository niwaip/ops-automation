import React from 'react';
import { Card, Space, Input, Select, Button, Badge, Segmented } from 'antd';
import {
  SearchOutlined,
  DeleteOutlined,
  CloseCircleOutlined,
  CheckCircleOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import type { ExecutionStatus } from '@/api/execution';
import type { ExecutionQuickTab } from './ExecutionOverviewCards';

const { Option } = Select;

interface ExecutionFilterToolbarProps {
  searchText: string;
  onSearchChange: (value: string) => void;
  statusFilter: ExecutionStatus | undefined;
  onStatusFilterChange: (status?: ExecutionStatus) => void;
  activeQuickTab: ExecutionQuickTab;
  onQuickTabChange: (tab: ExecutionQuickTab) => void;
  runningCount?: number;
  attentionCount?: number;
  failedCount: number;
  succeededCount: number;
  onOpenCleanupModal: () => void;
}

const EXECUTION_STATUS_OPTIONS: Array<{ value?: ExecutionStatus; label: string }> = [
  { value: undefined, label: '全部细分状态' },
  { value: 'running', label: '执行中 (Running)' },
  { value: 'waiting_input', label: '待补输入 (Waiting Input)' },
  { value: 'pending_approval', label: '待审批 (Pending Approval)' },
  { value: 'human_control', label: '人工接管 (Human Takeover)' },
  { value: 'succeeded', label: '已完成 (Succeeded)' },
  { value: 'failed', label: '失败 (Failed)' },
  { value: 'cancelled', label: '已取消 (Cancelled)' },
];

export const ExecutionFilterToolbar: React.FC<ExecutionFilterToolbarProps> = ({
  searchText,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  activeQuickTab,
  onQuickTabChange,
  failedCount,
  succeededCount,
  onOpenCleanupModal,
}) => {
  const segmentedOptions = [
    {
      value: 'all',
      label: (
        <Space size={6} style={{ padding: '2px 4px' }}>
          <AppstoreOutlined />
          <span>全部历史</span>
        </Space>
      ),
    },
    {
      value: 'failed',
      label: (
        <Space size={6} style={{ padding: '2px 4px' }}>
          <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
          <span>异常故障</span>
          {failedCount > 0 && (
            <Badge
              count={failedCount}
              overflowCount={99}
              style={{ backgroundColor: '#ff4d4f', boxShadow: 'none' }}
            />
          )}
        </Space>
      ),
    },
    {
      value: 'succeeded',
      label: (
        <Space size={6} style={{ padding: '2px 4px' }}>
          <CheckCircleOutlined style={{ color: '#52c41a' }} />
          <span>成功</span>
          {succeededCount > 0 && (
            <Badge
              count={succeededCount}
              overflowCount={999}
              style={{ backgroundColor: '#52c41a', boxShadow: 'none' }}
            />
          )}
        </Space>
      ),
    },
  ];

  return (
    <Card
      style={{
        marginBottom: 16,
        borderRadius: 14,
        border: '1px solid var(--bg-secondary)',
        background: 'var(--bg-card)',
      }}
      styles={{ body: { padding: '12px 18px' } }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <Space wrap size={12} align="center" style={{ flex: 1 }}>
          <Segmented
            value={activeQuickTab}
            onChange={(val) => onQuickTabChange(val as ExecutionQuickTab)}
            options={segmentedOptions}
            size="middle"
            style={{ padding: 3, background: 'var(--bg-secondary, #f0f2f5)' }}
          />

          <Input
            placeholder="按执行 ID 精准查询 (如 e4c9...) / 技能名 / 参数..."
            prefix={<SearchOutlined style={{ color: '#1890ff' }} />}
            value={searchText}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{ minWidth: 260, maxWidth: 360, flex: 1 }}
            allowClear
          />

          <Select
            placeholder="细分状态"
            value={statusFilter}
            onChange={(val) => onStatusFilterChange(val)}
            allowClear
            style={{ width: 140 }}
          >
            {EXECUTION_STATUS_OPTIONS.map((opt) => (
              <Option key={opt.value || 'all'} value={opt.value}>
                {opt.label}
              </Option>
            ))}
          </Select>

          {(searchText || statusFilter !== undefined || activeQuickTab !== 'all') && (
            <Button
              type="link"
              size="small"
              onClick={() => {
                onSearchChange('');
                onStatusFilterChange(undefined);
                onQuickTabChange('all');
              }}
            >
              重置筛选
            </Button>
          )}
        </Space>

        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          size="small"
          onClick={onOpenCleanupModal}
        >
          清理历史记录
        </Button>
      </div>
    </Card>
  );
};
