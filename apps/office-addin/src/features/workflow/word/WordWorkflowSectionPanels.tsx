import React from 'react';
import { AISuggestionItem } from '../../../shared/ui/AISuggestionItem';
import type { TemplateFieldCandidate } from '../../../api/carbone-api';
import type { AISuggestion } from '../../../app/store';
import {
  buildWordCompareCandidateDisplayGroups,
  getCompareCandidateDisplayName,
  getLanguageHintLabel,
  getWordCandidateLanguageHint,
  sortWordCandidatesByPosition,
  WordCompareCandidateGroups,
} from '../../parameter-query/word';
import { WordIdentifyResultSection } from '../../parameter-identify/word/WordIdentifyResultSection';
import type { CompareCandidateSection } from './word-workflow.section.helpers';
import type { WordSectionGenerationResult } from './word-workflow.cache';
import { buildWordRecognitionSectionViewModel } from './word-workflow.presenter';

interface WordCompareSectionCandidatesPanelProps {
  section: CompareCandidateSection;
  onSaveCandidate: (candidateId: string, patch: Partial<TemplateFieldCandidate>) => void;
  onDeleteCandidate: (candidateId: string) => void;
  isWordLoopCompareCandidate: (candidate: TemplateFieldCandidate) => boolean;
}

export const WordCompareSectionCandidatesPanel: React.FC<WordCompareSectionCandidatesPanelProps> = ({
  section,
  onSaveCandidate,
  onDeleteCandidate,
  isWordLoopCompareCandidate,
}) => (
  <WordCompareCandidateGroups
    groups={buildWordCompareCandidateDisplayGroups(section, {
      sortWordCandidatesByPosition,
      getWordCandidateLanguageHint,
      isWordLoopCompareCandidate,
    })}
    onSaveCandidate={onSaveCandidate}
    onDeleteCandidate={onDeleteCandidate}
    getCandidateDisplayName={getCompareCandidateDisplayName}
    getLanguageHintLabel={getLanguageHintLabel}
  />
);

interface WordRecognitionSectionResultPanelProps {
  section: CompareCandidateSection;
  sectionGenerationResultMap: Map<string, WordSectionGenerationResult>;
  sectionSuggestionMap: Map<string, AISuggestion[]>;
  collapsedRecognitionSections: Record<string, boolean>;
  recognitionReady: boolean;
  toggleRecognitionSectionCollapse: (sectionKey: string) => void;
  applyState: any;
  persistAppliedRecognitionCache: () => void;
  formatConfidence: (confidence: number) => string;
}

export const WordRecognitionSectionResultPanel: React.FC<WordRecognitionSectionResultPanelProps> = ({
  section,
  sectionGenerationResultMap,
  sectionSuggestionMap,
  collapsedRecognitionSections,
  recognitionReady,
  toggleRecognitionSectionCollapse,
  applyState,
  persistAppliedRecognitionCache,
  formatConfidence,
}) => {
  const viewModel = buildWordRecognitionSectionViewModel({
    section,
    sectionGenerationResultMap,
    sectionSuggestionMap,
    collapsedRecognitionSections,
    recognitionReady,
  });

  if (!viewModel) {
    return null;
  }

  const renderSuggestionCard = (suggestion: AISuggestion) => (
    <AISuggestionItem
      key={suggestion.id}
      suggestion={suggestion}
      onApply={() => { void applyState.handleApplySingle(suggestion, persistAppliedRecognitionCache); }}
      onDismiss={() => applyState.dismissSuggestion(suggestion.id)}
      onUpdateName={(newName: string) => applyState.updateSuggestionName(suggestion.id, newName)}
      onUpdateDetails={(details: any) => applyState.updateSuggestionDetails(suggestion.id, details)}
    />
  );

  return (
    <WordIdentifyResultSection
      section={section}
      sectionResult={viewModel.sectionResult}
      sectionSuggestions={viewModel.sectionSuggestions}
      sectionSuggestionGroups={viewModel.sectionSuggestionGroups}
      recognitionReady={recognitionReady}
      sectionCollapsed={viewModel.sectionCollapsed}
      onToggleCollapse={() => toggleRecognitionSectionCollapse(section.sectionKey)}
      groupName={viewModel.groupName}
      groupSummary={viewModel.groupSummary}
      pendingCount={viewModel.pendingCount}
      appliedCount={viewModel.appliedCount}
      applyState={applyState}
      onApplyGroup={() => { void applyState.handleApplyGroup(viewModel.groupName, persistAppliedRecognitionCache); }}
      onReapplyGroup={() => { void applyState.handleReapplyGroup(viewModel.groupName, persistAppliedRecognitionCache); }}
      renderSuggestionCard={renderSuggestionCard}
      formatConfidence={formatConfidence}
    />
  );
};
