import React from 'react';
import { Space, Tag } from 'antd';

interface ExecutionStatusSummaryTagItem {
  text: React.ReactNode;
  color?: string;
}

interface ExecutionStatusSummaryTagsProps {
  items: Array<ExecutionStatusSummaryTagItem | null | undefined | false>;
}

const ExecutionStatusSummaryTags: React.FC<ExecutionStatusSummaryTagsProps> = ({ items }) => {
  const visibleItems = items.filter(Boolean) as ExecutionStatusSummaryTagItem[];

  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <Space wrap size={[8, 8]}>
      {visibleItems.map((item, index) => (
        <Tag key={index} color={item.color}>
          {item.text}
        </Tag>
      ))}
    </Space>
  );
};

export default ExecutionStatusSummaryTags;
