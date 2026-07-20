import React from 'react';
import ExecutionBrowserDetailSections from '@/features/executions/shared/components/ExecutionBrowserDetailSections';
import ExecutionNonBrowserDetailSections from '@/features/executions/shared/components/ExecutionNonBrowserDetailSections';
import type { ExecutionDetailSectionsProps } from '@/features/executions/detail/components/ExecutionDetailSections.types';

const ExecutionDetailSections: React.FC<ExecutionDetailSectionsProps> = (props) => {
  if (!props.execution) {
    return null;
  }

  return props.isBrowserExecution ? (
    <ExecutionBrowserDetailSections {...props} />
  ) : (
    <ExecutionNonBrowserDetailSections {...props} />
  );
};

export default ExecutionDetailSections;
