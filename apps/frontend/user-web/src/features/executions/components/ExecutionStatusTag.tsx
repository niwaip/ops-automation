import React from 'react';
import { Tag } from 'antd';
import type { TagProps } from 'antd';

interface ExecutionStatusTagProps {
  color?: TagProps['color'];
  children: React.ReactNode;
  style?: React.CSSProperties;
}

const ExecutionStatusTag: React.FC<ExecutionStatusTagProps> = ({ color, children, style }) => {
  return (
    <Tag color={color} style={style}>
      {children}
    </Tag>
  );
};

export default ExecutionStatusTag;
