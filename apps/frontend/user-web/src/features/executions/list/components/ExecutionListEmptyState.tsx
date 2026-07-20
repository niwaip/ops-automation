import React from 'react';
import { Button, Empty, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

interface ExecutionListEmptyStateProps {
  description: string;
  hasActiveFilters: boolean;
  onCreate: () => void;
  onViewPublishedSkills: () => void;
  onClearFilters: () => void;
}

const ExecutionListEmptyState: React.FC<ExecutionListEmptyStateProps> = ({
  description,
  hasActiveFilters,
  onCreate,
  onViewPublishedSkills,
  onClearFilters,
}) => {
  return (
    <div className="execution-list-empty-state">
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={description}>
        <Space wrap size={12} style={{ justifyContent: 'center' }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>
            去新建执行
          </Button>
          <Button onClick={onViewPublishedSkills}>查看已发布技能</Button>
          {hasActiveFilters ? (
            <Button type="link" onClick={onClearFilters}>
              清空筛选条件
            </Button>
          ) : null}
        </Space>
      </Empty>
    </div>
  );
};

export default ExecutionListEmptyState;
