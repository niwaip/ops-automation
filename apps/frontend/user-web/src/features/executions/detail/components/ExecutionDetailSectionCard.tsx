import React from 'react';
import { Card } from 'antd';
import type { CardProps } from 'antd';

const ExecutionDetailSectionCard: React.FC<CardProps> = ({ className, size, styles, style, ...props }) => {
  return (
    <Card
      {...props}
      className={className || 'execution-detail-section-card'}
      size={size || 'small'}
      style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box', ...(style || {}) }}
      styles={{
        body: {
          padding: 12,
          maxWidth: '100%',
          boxSizing: 'border-box',
          ...(styles?.body || {}),
        },
      }}
    />
  );
};

export default ExecutionDetailSectionCard;
