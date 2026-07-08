import React from 'react';
import { Space, Tag, Typography } from 'antd';

const { Text } = Typography;

interface ExecutionResultHeaderProps {
  title: React.ReactNode;
  typeLabel?: React.ReactNode;
}

const ExecutionResultHeader: React.FC<ExecutionResultHeaderProps> = ({ title, typeLabel }) => {
  return (
    <Space wrap size={[8, 8]}>
      <Text strong>{title}</Text>
      {typeLabel ? <Tag>{typeLabel}</Tag> : null}
    </Space>
  );
};

export default ExecutionResultHeader;
