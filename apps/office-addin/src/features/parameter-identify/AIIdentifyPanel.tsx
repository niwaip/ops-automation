import React from 'react';
import { useAppStore } from '../../app/store';
import { WordWorkflowPanel } from '../workflow/word/WordWorkflowPanel';
import { ExcelIdentifyPanel } from './excel/ExcelIdentifyPanel';

interface Props {
  onApplyComplete?: () => void;
}

export const AIIdentifyPanel: React.FC<Props> = ({ onApplyComplete }) => {
  const { officeType } = useAppStore();
  return officeType === 'excel' ? (
    <ExcelIdentifyPanel onApplyComplete={onApplyComplete} />
  ) : (
    <WordWorkflowPanel onApplyComplete={onApplyComplete} />
  );
};

export default AIIdentifyPanel;
