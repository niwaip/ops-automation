import React from 'react';
import { WordLoadSection } from '../../document-load/word';
import { WordQuerySection } from '../../parameter-query/word';
import { WordWorkflowDebugPanel } from './WordWorkflowDebugPanel';
import { useWordWorkflowPanelController } from './useWordWorkflowPanelController';

interface Props {
  onApplyComplete?: () => void;
}

export const WordWorkflowPanel: React.FC<Props> = ({ onApplyComplete }) => {
  const {
    loadSectionProps,
    querySectionProps,
    debugPanelProps,
  } = useWordWorkflowPanelController({ onApplyComplete });

  return (
    <div className="ai-identify-panel word-identify-panel">
      <WordLoadSection {...loadSectionProps} />
      <WordQuerySection {...querySectionProps} />
      <WordWorkflowDebugPanel {...debugPanelProps} />
    </div>
  );
};

export default WordWorkflowPanel;
