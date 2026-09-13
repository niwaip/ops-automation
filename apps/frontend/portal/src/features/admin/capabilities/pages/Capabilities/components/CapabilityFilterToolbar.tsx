import React, { useMemo } from 'react';
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
  ClockCircleOutlined,
  SendOutlined,
  ClearOutlined,
} from '@ant-design/icons';
import type { CapabilitySourceType, CapabilityRelease } from '@/api/capabilities';
import type { CapabilityQuickTab } from './CapabilityOverviewCards';
import { resolvePipelineInfo } from '../utils/capabilitiesHelpers';

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
  const stats = useMemo(() => {
    let pendingDeploy = 0;
    let pendingPublish = 0;
    let published = 0;
    let failed = 0;

    for (const r of releases) {
      const info = resolvePipelineInfo(r);
      if (info.stage === 'failed') {
        failed++;
      } else if (info.stage === 'published') {
        published++;
      } else if (info.stage === 'deployed_pending') {
        pendingPublish++;
      } else {
        pendingDeploy++;
      }
    }

    return {
      total: releases.length,
      pendingDeploy,
      pendingPublish,
      published,
      failed,
    };
  }, [releases]);

  const segmentedOptions = [
    {
      label: (
        <Space size={6} style={{ padding: '2px 4px' }}>
          <span>全部流程</span>
          <Badge count={stats.total} overflowCount={999} style={{ backgroundColor: '#8c8c8c' }} />
        </Space>
      ),
      value: 'all' as CapabilityQuickTab,
    },
    {
      label: (
        <Space size={6} style={{ padding: '2px 4px' }}>
          <ClockCircleOutlined style={{ color: '#fa8c16' }} />
          <span>待部署验证</span>
          {stats.pendingDeploy > 0 && (
            <Badge count={stats.pendingDeploy} overflowCount={999} style={{ backgroundColor: '#fa8c16' }} />
          )}
        </Space>
      ),
      value: 'pending_deploy' as CapabilityQuickTab,
    },
    {
      label: (
        <Space size={6} style={{ padding: '2px 4px' }}>
          <SendOutlined style={{ color: '#13c2c2' }} />
          <span>待发布技能</span>
          {stats.pendingPublish > 0 && (
            <Badge count={stats.pendingPublish} overflowCount={999} style={{ backgroundColor: '#13c2c2' }} />
          )}
        </Space>
      ),
      value: 'pending_publish' as CapabilityQuickTab,
    },
    {
      label: (
        <Space size={6} style={{ padding: '2px 4px' }}>
          <CheckCircleOutlined style={{ color: '#52c41a' }} />
          <span>已发布上线</span>
          <Badge count={stats.published} overflowCount={999} style={{ backgroundColor: '#52c41a' }} />
        </Space>
      ),
      value: 'published' as CapabilityQuickTab,
    },
    {
      label: (
        <Space size={6} style={{ padding: '2px 4px' }}>
          <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
          <span>异常待排障</span>
          {stats.failed > 0 && (
            <Badge count={stats.failed} overflowCount={999} style={{ backgroundColor: '#ff4d4f' }} />
          )}
        </Space>
      ),
      value: 'failed' as CapabilityQuickTab,
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
