import React from 'react';
import { Card, Tag, Button, Space, Typography } from 'antd';
import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ExecutionDto } from '@/api/execution';
import { EXECUTION_STATUS_COLORS, EXECUTION_STATUS_LABELS_ZH } from '@/shared/lib/executionStatusMeta';

const { Title, Text } = Typography;

export interface ExecutionHeaderSectionProps {
  execution: ExecutionDto;
  onBack: () => void;
  onRefresh: () => void;
}

export const ExecutionHeaderSection: React.FC<ExecutionHeaderSectionProps> = ({
  execution,
  onBack,
  onRefresh,
}) => {
  const statusColor = EXECUTION_STATUS_COLORS[execution.status] || 'default';
  const statusLabel = EXECUTION_STATUS_LABELS_ZH[execution.status] || execution.status;
  const displayName = execution.skillId || `Execution ${execution.id.slice(0, 8)}`;

  return (
    <Card style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space size="middle">
          <Button icon={<ArrowLeftOutlined />} onClick={onBack}>
            返回列表
          </Button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Title level={4} style={{ margin: 0 }}>
                {displayName}
              </Title>
              <Tag color={statusColor} style={{ fontSize: 13, padding: '2px 8px' }}>
                {statusLabel}
              </Tag>
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              ID: {execution.id} | 开始时间: {new Date(execution.createdAt).toLocaleString()}
            </Text>
          </div>
        </Space>
        <Button icon={<ReloadOutlined />} onClick={onRefresh}>
          刷新
        </Button>
      </div>
    </Card>
  );
};
