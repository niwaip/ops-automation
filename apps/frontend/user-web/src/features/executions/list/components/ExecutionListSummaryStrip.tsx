import React from 'react';
import styles from '../../pages/ExecutionListPage.module.css';
import type { ExecutionListSummaryItem } from '@/features/executions/list/components/executionListView';
import type { ExecutionStatus } from '@/api/execution';

interface ExecutionListSummaryStripProps {
  items: ExecutionListSummaryItem[];
  activeStatusFilter?: ExecutionStatus;
  onSelectFilter?: (status?: ExecutionStatus) => void;
}

const ExecutionListSummaryStrip: React.FC<ExecutionListSummaryStripProps> = ({
  items,
  activeStatusFilter,
  onSelectFilter,
}) => {
  return (
    <div className={styles['execution-list-summary-strip']}>
      {items.map((item) => {
        const isClickable = Boolean(onSelectFilter && item.statusFilterValue !== undefined);
        const isActive =
          item.statusFilterValue === 'all'
            ? !activeStatusFilter
            : Boolean(activeStatusFilter && activeStatusFilter === item.statusFilterValue);

        const handleClick = () => {
          if (!onSelectFilter || item.statusFilterValue === undefined) return;
          if (item.statusFilterValue === 'all') {
            onSelectFilter(undefined);
          } else if (isActive) {
            onSelectFilter(undefined);
          } else {
            onSelectFilter(item.statusFilterValue as ExecutionStatus);
          }
        };

        return (
          <div
            key={item.key}
            className={`${styles['execution-list-summary-item']} ${item.accentClassName} ${
              isClickable ? styles['is-clickable'] : ''
            } ${isActive ? styles['is-active'] : ''}`}
            onClick={isClickable ? handleClick : undefined}
            role={isClickable ? 'button' : undefined}
            tabIndex={isClickable ? 0 : undefined}
            title={isClickable ? `点击筛选: ${item.label}` : undefined}
          >
            <div className={styles['execution-list-summary-icon']}>{item.icon}</div>
            <div className={styles['execution-list-summary-body']}>
              <span className={styles['execution-list-summary-key']}>{item.label}</span>
              <span className={styles['execution-list-summary-value']}>{item.value}</span>
            </div>
            {isClickable && (
              <span className={styles['execution-list-summary-indicator']} />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ExecutionListSummaryStrip;
