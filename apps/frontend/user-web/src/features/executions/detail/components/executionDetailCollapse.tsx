import type { CSSProperties, ReactNode } from 'react';
import type { CollapseProps } from 'antd';
import ExecutionDetailPanelLabel from '@/features/executions/detail/components/ExecutionDetailPanelLabel';

export const executionDetailPanelStyle: CSSProperties = {
  marginBottom: 12,
  background: 'var(--bg-card)',
  border: '1px solid var(--bg-secondary)',
  borderRadius: 14,
  boxShadow: 'var(--shadow-sm)',
};

interface BuildExecutionDetailCollapseItemOptions {
  key: string;
  title: string;
  summary?: string;
  children: ReactNode;
  style?: CSSProperties;
}

export function buildExecutionDetailCollapseItem({
  key,
  title,
  summary,
  children,
  style,
}: BuildExecutionDetailCollapseItemOptions): NonNullable<CollapseProps['items']>[number] {
  return {
    key,
    label: <ExecutionDetailPanelLabel title={title} summary={summary} />,
    style: {
      ...executionDetailPanelStyle,
      ...style,
    },
    children,
  };
}
