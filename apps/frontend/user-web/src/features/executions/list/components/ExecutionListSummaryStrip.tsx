import React from 'react';
import type { ExecutionListSummaryItem } from '@/features/executions/list/components/executionListView';

interface ExecutionListSummaryStripProps {
  items: ExecutionListSummaryItem[];
}

const ExecutionListSummaryStrip: React.FC<ExecutionListSummaryStripProps> = ({ items }) => {
  return (
    <div className="execution-list-summary-strip">
      {items.map((item) => (
        <div key={item.key} className={`execution-list-summary-item ${item.accentClassName}`}>
          <div className="execution-list-summary-icon">{item.icon}</div>
          <div className="execution-list-summary-body">
            <span className="execution-list-summary-key">{item.label}</span>
            <span className="execution-list-summary-value">{item.value}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ExecutionListSummaryStrip;
