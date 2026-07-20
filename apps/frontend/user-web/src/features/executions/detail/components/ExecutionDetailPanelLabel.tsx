import React from 'react';
import { Typography } from 'antd';

const { Text } = Typography;

interface ExecutionDetailPanelLabelProps {
  title: string;
  summary?: string;
}

const ExecutionDetailPanelLabel: React.FC<ExecutionDetailPanelLabelProps> = ({
  title,
  summary,
}) => {
  return (
    <div className="execution-detail-panel-label">
      <Text strong className="execution-detail-panel-title">
        {title}
      </Text>
      {summary ? (
        <Text type="secondary" className="execution-detail-panel-summary">
          {summary}
        </Text>
      ) : null}
    </div>
  );
};

export default ExecutionDetailPanelLabel;
