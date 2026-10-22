import React from 'react';
import styles from '../../pages/ExecutionListPage.module.css';
import { Button, Empty, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

interface ExecutionListEmptyStateProps {
  description: string;
  hasActiveFilters: boolean;
  isError?: boolean;
  onRetry?: () => void;
  onCreate: () => void;
  onViewPublishedSkills: () => void;
  onClearFilters: () => void;
}

const ExecutionListEmptyState: React.FC<ExecutionListEmptyStateProps> = ({
  description,
  hasActiveFilters,
  isError,
  onRetry,
  onCreate,
  onViewPublishedSkills,
  onClearFilters,
}) => {
  if (isError) {
    return (
      <div className={styles['execution-list-empty-state']}>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="任务列表加载失败，后台服务未响应或网络异常，请重试。"
        >
          <Space wrap size={12} style={{ justifyContent: 'center' }}>
            {onRetry ? (
              <Button type="primary" onClick={onRetry}>
                重试加载
              </Button>
            ) : null}
            {hasActiveFilters ? (
              <Button onClick={onClearFilters}>
                清空筛选条件
              </Button>
            ) : null}
          </Space>
        </Empty>
      </div>
    );
  }

  return (
    <div className={styles['execution-list-empty-state']}>
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={description}>
        <Space wrap size={12} style={{ justifyContent: 'center' }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>
            新建任务
          </Button>
          <Button onClick={onViewPublishedSkills}>查看数字员工</Button>
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
