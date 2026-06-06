import React from 'react';
import { ErrorBoundary } from '../../../../shared/ui/ErrorBoundary';
import { FlowLogPanel } from '../../../../debug';
import { ExcelWorkbookSourceLoader } from '../../../document-load/excel';
import { ExcelWorkflowPanel } from '../ExcelWorkflowPanel';

export const ExcelWorkspace: React.FC = () => (
  <main className='content-area'>
    <div className='excel-workspace'>
      <ExcelWorkbookSourceLoader />
      <ExcelWorkflowPanel />
    </div>
    <ErrorBoundary>
      <FlowLogPanel />
    </ErrorBoundary>
  </main>
);
