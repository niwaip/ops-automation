import React from 'react';
import { Space, Typography } from 'antd';
import type { SpaceProps } from 'antd';

const { Text } = Typography;

interface ExecutionSecondaryTextListProps {
  items: Array<React.ReactNode | null | undefined | false>;
  size?: SpaceProps['size'];
  direction?: 'horizontal' | 'vertical';
}

const ExecutionSecondaryTextList: React.FC<ExecutionSecondaryTextListProps> = ({
  items,
  size = [12, 4],
  direction = 'horizontal',
}) => {
  const visibleItems = items.filter(Boolean);

  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <Space wrap={direction !== 'vertical'} direction={direction} size={size}>
      {visibleItems.map((item, index) => (
        <Text key={index} type="secondary">
          {item}
        </Text>
      ))}
    </Space>
  );
};

export default ExecutionSecondaryTextList;
