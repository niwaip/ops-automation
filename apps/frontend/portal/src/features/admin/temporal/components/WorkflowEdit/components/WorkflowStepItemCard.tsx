import React from 'react';
import { Card, Tag, Typography, Space, Button, Tooltip } from 'antd';
import { DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { WorkflowDsl } from '@/api/temporal';

const { Text } = Typography;

export interface WorkflowStepItemCardProps {
  step: WorkflowDsl['steps'][number];
  index: number;
  isSelected?: boolean;
  onSelect?: () => void;
  onDelete?: () => void;
}

export const WorkflowStepItemCard: React.FC<WorkflowStepItemCardProps> = ({
  step,
  index,
  isSelected,
  onSelect,
  onDelete,
}) => {
  return (
    <Card
      size="small"
      style={{
        marginBottom: 8,
        border: isSelected ? '2px solid var(--primary-color)' : '1px solid var(--border-color)',
        background: 'var(--bg-card)',
        cursor: 'pointer',
      }}
      onClick={onSelect}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <Tag color="blue">#{index + 1}</Tag>
          <Text strong>{step.name || step.id}</Text>
          <Tag color={step.type === 'activity' ? 'purple' : 'default'}>{step.type}</Tag>
        </Space>
        <Space>
          {onSelect && (
            <Tooltip title="编辑步骤">
              <Button type="text" size="small" icon={<EditOutlined />} onClick={onSelect} />
            </Tooltip>
          )}
          {onDelete && (
            <Tooltip title="删除步骤">
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
              />
            </Tooltip>
          )}
        </Space>
      </div>
    </Card>
  );
};

export default WorkflowStepItemCard;
