import React from 'react';
import { Space, Input, Segmented, Button, Tooltip } from 'antd';
import {
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
  ThunderboltOutlined,
  BuildOutlined,
  CodeOutlined,
  ApiOutlined,
  ChromeOutlined,
  FileTextOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import type { ActivityQuickFilter } from './ActivityOverviewCards';

interface ActivityFilterToolbarProps {
  searchText: string;
  onSearchChange: (value: string) => void;
  activeFilter: ActivityQuickFilter;
  onFilterChange: (filter: ActivityQuickFilter) => void;
  onRefresh: () => void;
  onCreate: () => void;
  onImportFromSkill: () => void;
  loading?: boolean;
}

export const ActivityFilterToolbar: React.FC<ActivityFilterToolbarProps> = ({
  searchText,
  onSearchChange,
  activeFilter,
  onFilterChange,
  onRefresh,
  onCreate,
  onImportFromSkill,
  loading = false,
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
      <Space wrap size={10}>
        <Segmented<ActivityQuickFilter>
          value={activeFilter}
          onChange={onFilterChange}
          options={[
            { label: '全部', value: 'all', icon: <BuildOutlined /> },
            { label: '自定义', value: 'custom', icon: <ThunderboltOutlined /> },
            { label: '内置驱动', value: 'builtin', icon: <AppstoreOutlined /> },
            { label: '脚本 (Script)', value: 'script', icon: <CodeOutlined /> },
            { label: 'API 接口', value: 'api', icon: <ApiOutlined /> },
            { label: '浏览器', value: 'browser', icon: <ChromeOutlined /> },
            { label: '报表', value: 'carbone', icon: <FileTextOutlined /> },
          ]}
        />
        <Input
          placeholder="搜索 Activity 名称、函数名或描述..."
          prefix={<SearchOutlined style={{ color: 'var(--text-light)' }} />}
          value={searchText}
          onChange={(e) => onSearchChange(e.target.value)}
          allowClear
          style={{
            width: 280,
            borderRadius: 8,
          }}
        />
      </Space>

      <Space wrap size={10}>
        <Tooltip title="刷新 Activity 列表与内置驱动">
          <Button
            icon={<ReloadOutlined spin={loading} />}
            onClick={onRefresh}
            className="btn-pill"
          >
            刷新
          </Button>
        </Tooltip>

        <Button
          icon={<ThunderboltOutlined style={{ color: '#8b5cf6' }} />}
          onClick={onImportFromSkill}
          className="btn-pill"
          style={{ borderColor: 'rgba(139, 92, 246, 0.4)' }}
        >
          从技能库导入生成
        </Button>

        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={onCreate}
          className="btn-pill"
        >
          新建 Activity
        </Button>
      </Space>
    </div>
  );
};

export default ActivityFilterToolbar;
