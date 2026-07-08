import React from 'react';
import { Card } from 'antd';
import type { CardProps } from 'antd';
import { executionCreatePanelCardStyle } from '@/features/executions/components/executionCreateStyles';

const ExecutionCreatePanelCard: React.FC<CardProps> = ({ style, children, ...props }) => {
  return (
    <Card {...props} style={{ ...executionCreatePanelCardStyle, ...style }}>
      {children}
    </Card>
  );
};

export default ExecutionCreatePanelCard;
