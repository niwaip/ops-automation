import React from 'react';
import { Card } from 'antd';
import type { CardProps } from 'antd';

const ExecutionDetailSectionCard: React.FC<CardProps> = ({ className, size, styles, ...props }) => {
  return (
    <Card
      {...props}
      className={className || 'execution-detail-section-card'}
      size={size || 'small'}
      styles={{
        body: {
          padding: 12,
          ...(styles?.body || {}),
        },
      }}
    />
  );
};

export default ExecutionDetailSectionCard;
