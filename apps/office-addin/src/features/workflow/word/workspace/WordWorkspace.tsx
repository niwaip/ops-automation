import React from 'react';
import { ErrorBoundary } from '../../../../shared/ui/ErrorBoundary';
import { FlowLogPanel } from '../../../../debug';
import { WordWorkflowPanel } from '../WordWorkflowPanel';

export const WordWorkspace: React.FC = () => (
  <main className="content-area">
    <ErrorBoundary>
      <WordWorkflowPanel />
    </ErrorBoundary>
    <ErrorBoundary>
      <FlowLogPanel />
    </ErrorBoundary>
  </main>
);
