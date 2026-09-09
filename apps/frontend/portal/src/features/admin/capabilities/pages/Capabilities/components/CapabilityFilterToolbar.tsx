import React from 'react';
import {
  Button,
  Input,
  Segmented,
  Select,
  Space,
  Badge,
} from 'antd';
import {
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
  CloseCircleOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  GlobalOutlined,
  ApartmentOutlined,
  ClearOutlined,
} from '@ant-design/icons';
import type { CapabilitySourceType, CapabilityRelease } from '@/api/capabilities';
import type { CapabilityQuickTab } from './CapabilityOverviewCards';

interface CapabilityFilterToolbarProps {
  searchText: string;
  onSearchChange: (text: string) => void;
  sourceTypeFilter?: CapabilitySourceType;
  onSourceTypeFilterChange: (type?: CapabilitySourceType) => void;
  activeQuickTab: CapabilityQuickTab;
  onQuickTabChange: (tab: CapabilityQuickTab) => void;
  releases: CapabilityRelease[];
  isLoading: boolean;
  onRefresh: () => void;
  onOpenCreateModal: () => void;
  isStudioMode?: boolean;
}

export const CapabilityFilterToolbar: React.FC<CapabilityFilterToolbarProps> = ({
  searchText,
  onSearchChange,
  sourceTypeFilter,
  onSourceTypeFilterChange,
  activeQuickTab,
  onQuickTabChange,
  releases,
  isLoading,
  onRefresh,
  onOpenCreateModal,
  isStudioMode = false,
}) => {
  const deployedCount = releases.filter(
    (r) =>
      r.deploymentStatus === 'deployed' ||
      r.deploymentStatus === 'succeeded' ||
      r.status === 'published' ||
      r.status === 'deployed' ||
      Boolean(r.publishedSkillId)
  ).length;

  const pendingCount = releases.filter(
    (r) =>
      r.approvalStatus === 'pending_approval' ||
      r.status === 'draft' ||
      r.status === 'draft_ready' ||
      r.approvalStatus === 'pending'
  ).length;

  const failedCount = releases.filter(
    (r) =>
      r.status === 'build_failed' ||
      r.status === 'validation_failed' ||
      r.status === 'deploy_failed' ||
      r.deploymentStatus === 'deploy_failed' ||
      r.deploymentStatus === 'failed'
  ).length;

  const browserCount = releases.filter((r) => r.sourceType === 'browser_recording').length;
  const temporalCount = releases.filter((r) => r.sourceType === 'temporal_workflow').length;

  const segmentedOptions = [
    {
      label: (
        <Space size={6} style={{ padding: '2px 4px' }}>
          <span>全部流程</span>
          <Badge count={releases.length} overflowCount={999} style={{ backgroundColor: '#8c8c8c' }} />
        </Space>
      ),
      value: 'all' as CapabilityQuickTab,
    },
    {
      label: (
        <Space size={6} style={{ padding: '2px 4px' }}>
          <CheckCircleOutlined style={{ color: '#52c41a' }} />
          <span>已上线/部署</span>
          <Badge count={deployedCount} overflowCount={999} style={{ backgroundColor: '#52c41a' }} />
        </Space>
      ),
      value: 'deployed' as CapabilityQuickTab,
    },
    {
      label: (
        <Space size={6} style={{ padding: '2px 4px' }}>
          <ExclamationCircleOutlined style={{ color: '#fa8c16' }} />
          <span>待审批/草稿</span>
          {pendingCount > 0 ? (
            <Badge count={pendingCount} overflowCount={999} style={{ backgroundColor: '#fa8c16' }} />
          ) : null}
        </Space>
      ),
      value: 'pending' as CapabilityQuickTab,
    },
    {
      label: (
        <Space size={6} style={{ padding: '2px 4px' }}>
          <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
          <span>异常待排障</span>
          {failedCount > 0 ? (
            <Badge count={failedCount} overflowCount={999} style={{ backgroundColor: '#ff4d4f' }} />
          ) : null}
        </Space>
      ),
      value: 'failed' as CapabilityQuickTab,
    },
    {
      label: (
        <Space size={6} style={{ padding: '2px 4px' }}>
          <GlobalOutlined style={{ color: '#13c2c2' }} />
          <span>浏览器录制</span>
          <Badge count={browserCount} overflowCount={999} style={{ backgroundColor: '#13c2c2' }} />
        </Space>
      ),
      value: 'browser' as CapabilityQuickTab,
    },
    {
      label: (
        <Space size={6} style={{ padding: '2px 4px' }}>
          <ApartmentOutlined style={{ color: '#722ed1' }} />
          <span>编排型工作流</span>
          <Badge count={temporalCount} overflowCount={999} style={{ backgroundColor: '#722ed1' }} />
        </Space>
      ),
      value: 'temporal' as CapabilityQuickTab,
    },
  ];

  const hasActiveFilters = Boolean(
    searchText.trim() || sourceTypeFilter || activeQuickTab !== 'all'
  );

  const handleResetFilters = () => {
    onSearchChange('');
    onSourceTypeFilterChange(undefined);
    onQuickTabChange('all');
  };

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        borderRadius: 12,
        padding: '12px 16px',
        marginBottom: 16,
        border: '1px solid var(--bg-secondary)',
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
      }}
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        {/* 1. 快捷分段工作流筛选栏 */}
        <div style={{ overflowX: 'auto', paddingBottom: 2 }}>
          <Segmented
            options={segmentedOptions}
            value={activeQuickTab}
            onChange={(val) => onQuickTabChange(val as CapabilityQuickTab)}
            style={{ padding: 4 }}
          />
        </div>

        {/* 2. 次级搜索与细分类型筛选 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <Space wrap size={10}>
            <Input
              placeholder="搜索能力名称、源 ID、状态或指引..."
              prefix={<SearchOutlined style={{ color: 'var(--text-secondary)' }} />}
              value={searchText}
              onChange={(e) => onSearchChange(e.target.value)}
              style={{ width: 280 }}
              allowClear
            />

            <Select
              allowClear
              placeholder="资产源类型过滤"
              value={sourceTypeFilter}
              onChange={onSourceTypeFilterChange}
              style={{ width: 170 }}
              options={[
                { label: '全部类型', value: undefined as any },
                { label: '编排型 (Temporal)', value: 'temporal_workflow' },
                { label: '浏览器录制 (Browser)', value: 'browser_recording' },
                { label: '模版型 (Execution Flow)', value: 'execution_flow_template' },
              ]}
            />

            {hasActiveFilters && (
              <Button
                type="text"
                size="small"
                icon={<ClearOutlined />}
                onClick={handleResetFilters}
              >
                重置筛选
              </Button>
            )}
          </Space>

          <Space size={10}>
            <Button
              icon={<ReloadOutlined spin={isLoading} />}
              onClick={onRefresh}
            >
              刷新
            </Button>
            {!isStudioMode && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={onOpenCreateModal}
              >
                新建流程发布
              </Button>
            )}
          </Space>
        </div>
      </Space>
    </div>
  );
};

export default CapabilityFilterToolbar;
