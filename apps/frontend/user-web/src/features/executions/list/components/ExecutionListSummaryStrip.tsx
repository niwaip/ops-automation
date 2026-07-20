import React from 'react';
import styles from '../../pages/ExecutionListPage.module.css';
import type { ExecutionListSummaryItem } from '@/features/executions/list/components/executionListView';

interface ExecutionListSummaryStripProps {
  items: ExecutionListSummaryItem[];
}

const ExecutionListSummaryStrip: React.FC<ExecutionListSummaryStripProps> = ({ items }) => {
  return (
    <div className={styles['execution-list-summary-strip']}>
      {items.map((item) => (
        <div key={item.key} className={`${styles['execution-list-summary-item']} ${item.accentClassName}`}>
          <div className={styles['execution-list-summary-icon']}>{item.icon}</div>
          <div className={styles['execution-list-summary-body']}>
            <span className={styles['execution-list-summary-key']}>{item.label}</span>
            <span className={styles['execution-list-summary-value']}>{item.value}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ExecutionListSummaryStrip;
