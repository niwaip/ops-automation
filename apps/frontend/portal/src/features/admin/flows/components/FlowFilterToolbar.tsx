import React from 'react';
import { Space, Input, Segmented, Button, Tooltip } from 'antd';
import {
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
  ImportOutlined,
  AppstoreOutlined,
  FileTextOutlined,
  ThunderboltOutlined,
  ApiOutlined,
  SearchOutlined as QueryIcon,
  BarChartOutlined,
} from '@ant-design/icons';

interface FlowFilterToolbarProps {
  searchText: string;
  onSearchChange: (value: string) => void;
  selectedCategory: string | undefined;
  onCategoryChange: (category: string | undefined) => void;
  onRefresh: () => void;
  onCreate: () => void;
  onImport: () => void;
  loading?: boolean;
}

export const FlowFilterToolbar: React.FC<FlowFilterToolbarProps> = ({
  searchText,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
  onRefresh,
  onCreate,
  onImport,
  loading = false,
}) => {
  const segmentedValue = selectedCategory || 'all';

  const handleSegmentedChange = (val: string) => {
    if (val === 'all') {
      onCategoryChange(undefined);
    } else {
      onCategoryChange(val);
    }
  };

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
        <Segmented
          value={segmentedValue}
          onChange={handleSegmentedChange}
          options={[
            { label: '全部', value: 'all', icon: <AppstoreOutlined /> },
            { label: '文档处理', value: 'document', icon: <FileTextOutlined /> },
            { label: '自动化流程', value: 'automation', icon: <ThunderboltOutlined /> },
            { label: '系统集成', value: 'integration', icon: <ApiOutlined /> },
            { label: '查询服务', value: 'query', icon: <QueryIcon /> },
            { label: '数据分析', value: 'analysis', icon: <BarChartOutlined /> },
          ]}
        />
        <Input
          placeholder="搜索组合名称、目标、说明或关键词..."
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
        <Tooltip title="刷新工作流组合数据">
          <Button
            icon={<ReloadOutlined spin={loading} />}
            onClick={onRefresh}
            className="btn-pill"
          >
            刷新
          </Button>
        </Tooltip>

        <Button
          icon={<ImportOutlined />}
          onClick={onImport}
          className="btn-pill"
        >
          导入 JSON 组合
        </Button>

        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={onCreate}
          className="btn-pill"
        >
          新建工作流组合
        </Button>
      </Space>
    </div>
  );
};

export default FlowFilterToolbar;
