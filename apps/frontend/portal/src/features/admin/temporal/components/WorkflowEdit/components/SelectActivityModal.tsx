import React from 'react';
import { Modal, Alert, Card, Space, Tag, Typography } from 'antd';

const { Text } = Typography;

export interface SelectActivityModalProps {
  visible: boolean;
  onCancel: () => void;
  activityResources: Array<{
    ref: string;
    handler: string;
    source: string;
    name: string;
    fn: string;
    [key: string]: any;
  }>;
  onSelectActivity: (activity: any) => void;
}

export const SelectActivityModal: React.FC<SelectActivityModalProps> = ({
  visible,
  onCancel,
  activityResources,
  onSelectActivity,
}) => {
  return (
    <Modal
      title="选择工作单元"
      open={visible}
      onCancel={onCancel}
      footer={null}
      width={600}
    >
      <Alert
        message="选择一个工作单元关联到工作流步骤"
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />
      <div style={{ maxHeight: 400, overflow: 'auto' }}>
        {activityResources.map((activity) => (
          <Card
            key={activity.ref}
            size="small"
            style={{ marginBottom: 8, cursor: 'pointer' }}
            onClick={() => onSelectActivity(activity)}
          >
            <Space>
              <Tag
                color={
                  activity.handler === 'api'
                    ? 'green'
                    : activity.handler === 'script'
                      ? 'orange'
                      : 'blue'
                }
              >
                {activity.handler.toUpperCase()}
              </Tag>
              {activity.source === 'builtin' ? <Tag color="gold">内置</Tag> : <Tag>自定义</Tag>}
              <Text strong>{activity.name}</Text>
              <Text type="secondary">({activity.fn})</Text>
            </Space>
          </Card>
        ))}
        {activityResources.length === 0 && (
          <Alert message="暂无工作单元，请先创建" type="warning" showIcon />
        )}
      </div>
    </Modal>
  );
};
