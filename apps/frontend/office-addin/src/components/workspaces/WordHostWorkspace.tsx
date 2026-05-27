import React from 'react';
import { DebugLogPanel } from '../DebugLogPanel';
import { ErrorBoundary } from '../ErrorBoundary';
import { WordIdentifyPanel } from '../WordIdentifyPanel';

export const WordHostWorkspace: React.FC = () => {
  return (
    <main className="content-area">
      <WordIdentifyPanel />
      <ErrorBoundary>
        <DebugLogPanel />
      </ErrorBoundary>
    </main>
  );
};
