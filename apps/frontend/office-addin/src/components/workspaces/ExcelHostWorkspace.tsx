import React from 'react';
import { DebugLogPanel } from '../DebugLogPanel';
import { ErrorBoundary } from '../ErrorBoundary';
import { ExcelIdentifyPanel } from '../ExcelIdentifyPanel';
import { ExcelSheetPairsTab } from '../ExcelSheetPairsTab';

export const ExcelHostWorkspace: React.FC = () => {
  return (
    <main className="content-area">
      <div className="excel-workspace">
        <ExcelSheetPairsTab />
        <ExcelIdentifyPanel />
      </div>
      <ErrorBoundary>
        <DebugLogPanel />
      </ErrorBoundary>
    </main>
  );
};
