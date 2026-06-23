import React from 'react';
import { Button, Space, Tag } from 'antd';
import { CompressOutlined, FullscreenOutlined, RobotOutlined } from '@ant-design/icons';

interface RecorderTopActionsProps {
  isBrowserInitialized: boolean;
  hasExecuted: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

const RecorderTopActions: React.FC<RecorderTopActionsProps> = ({
  isBrowserInitialized,
  hasExecuted,
  isExpanded,
  onToggleExpand,
}) => {
  if (!(isBrowserInitialized || hasExecuted || isExpanded)) {
    return null;
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        marginBottom: 6,
        flexShrink: 0,
      }}
    >
      <Space>
        {isBrowserInitialized && (
          <Tag color="processing" icon={<RobotOutlined />}>
            浏览器就绪
          </Tag>
        )}
        {(hasExecuted || isExpanded) && (
          <Button
            type="text"
            icon={isExpanded ? <CompressOutlined /> : <FullscreenOutlined />}
            onClick={onToggleExpand}
            style={{ color: '#6366f1' }}
          >
            {isExpanded ? '收起控制面板' : '展开浏览器'}
          </Button>
        )}
      </Space>
    </div>
  );
};

export default RecorderTopActions;
