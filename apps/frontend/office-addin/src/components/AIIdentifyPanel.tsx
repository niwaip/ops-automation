import React from 'react';
import { useAppStore } from '../taskpane/store';
import { ExcelIdentifyPanel } from './ExcelIdentifyPanel';
import { WordIdentifyPanel } from './WordIdentifyPanel';

interface Props {
  onApplyComplete?: () => void;
}

export const AIIdentifyPanel: React.FC<Props> = ({ onApplyComplete }) => {
  const { officeType } = useAppStore();
  return officeType === 'excel'
    ? <ExcelIdentifyPanel onApplyComplete={onApplyComplete} />
    : <WordIdentifyPanel onApplyComplete={onApplyComplete} />;
};

export default AIIdentifyPanel;
