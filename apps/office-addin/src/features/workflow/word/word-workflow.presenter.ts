import type React from 'react';
import type { AISuggestion } from '../../../app/store';
import type { WordDraftSection } from '../../draft/word';
import type { WordPublishSection } from '../../publish/word';
import {
  buildWordSectionSuggestionDisplayGroups,
} from '../../parameter-identify/word/identify-suggestion.helpers';
import type { CompareCandidateSection } from './word-workflow.section.helpers';
import { buildSuggestionGroupSummary } from './word-workflow.debug';
import type { WordSectionGenerationResult } from './word-workflow.cache';

export function buildWordWorkflowStepStatus(args: {
  sampleUploaded: boolean;
  hasCompare: boolean;
  recognitionReady: boolean;
}) {
  return {
    upload: args.sampleUploaded,
    compare: args.hasCompare,
    recognition: args.recognitionReady,
  };
}

export function shouldShowEmptyWordRecognitionState(args: {
  recognitionBlocked: boolean;
  recognitionReady: boolean;
  totalSuggestions: number;
}): boolean {
  return !args.recognitionBlocked && args.recognitionReady && args.totalSuggestions === 0;
}

export function buildWordRecognitionFollowupProps(args: {
  recognitionReady: boolean;
  suggestions: AISuggestion[];
  isAnalyzing: boolean;
  aiSkillGuide: unknown;
  draftId: string | null;
  draftInfo: { templateType: string; parameterCount: number; savedAt: string } | null;
  latestBackendDraftInfo: { id: string; fileName: string; savedAt: string } | null;
  draftWorkflowNotice: { type: 'success' | 'error' | 'info'; message: string; lines?: string[] } | null;
  isGeneratingGuide: boolean;
  isVerifying: boolean;
  isSavingDraft: boolean;
  draftWorkflowCollapsed: boolean;
  guidePreviewCollapsed: boolean;
  setDraftWorkflowCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  setGuidePreviewCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  handleGenerateAISkillGuide: () => void;
  handleVerifyTemplate: () => void;
  handleSaveDraft: () => void;
  handleLoadDraft: () => void;
  handleClearDraft: () => void;
  aiGeneratedData: unknown;
  previewResult: unknown;
  saveResult: unknown;
  verifySaveCollapsed: boolean;
  setVerifySaveCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  isGeneratingParams: boolean;
  analysisThinkingEnabled: boolean;
  setAnalysisThinkingEnabled: (enabled: boolean) => void;
  aiDescription: string;
  handleAiDescriptionChange: (value: string) => void;
  handleGenerateParameters: () => void;
  aiGenerateResult: { success: boolean; message: string } | null;
  isPreviewing: boolean;
  handlePreviewWithAIParams: () => void;
  previewInlineSupported: boolean;
  apiBaseUrl: string;
  getDownloadLabel: () => string;
  templateName: string;
  setTemplateName: (name: string) => void;
  selectedTemplateType: string;
  isSaving: boolean;
  handleSaveTemplateAndGuide: () => void;
}): {
  draftSectionProps: React.ComponentProps<typeof WordDraftSection>;
  publishSectionProps: React.ComponentProps<typeof WordPublishSection>;
} {
  return {
    draftSectionProps: {
      suggestions: args.suggestions,
      isAnalyzing: args.isAnalyzing,
      aiSkillGuide: args.aiSkillGuide as React.ComponentProps<typeof WordDraftSection>['aiSkillGuide'],
      draftId: args.draftId,
      draftInfo: args.draftInfo,
      latestBackendDraftInfo: args.latestBackendDraftInfo,
      templateAssetNotice: args.draftWorkflowNotice,
      isGeneratingGuide: args.isGeneratingGuide,
      isVerifying: args.isVerifying,
      isSavingDraft: args.isSavingDraft,
      draftWorkflowCollapsed: args.draftWorkflowCollapsed,
      guidePreviewCollapsed: args.guidePreviewCollapsed,
      setDraftWorkflowCollapsed: args.setDraftWorkflowCollapsed,
      setGuidePreviewCollapsed: args.setGuidePreviewCollapsed,
      handleGenerateAISkillGuide: args.handleGenerateAISkillGuide,
      handleVerifyTemplate: args.handleVerifyTemplate,
      handleSaveDraft: args.handleSaveDraft,
      handleLoadDraft: args.handleLoadDraft,
      handleClearDraft: args.handleClearDraft,
    },
    publishSectionProps: {
      suggestions: args.suggestions,
      aiSkillGuide: args.aiSkillGuide as React.ComponentProps<typeof WordPublishSection>['aiSkillGuide'],
      aiGeneratedData: args.aiGeneratedData,
      previewResult: args.previewResult as React.ComponentProps<typeof WordPublishSection>['previewResult'],
      draftId: args.draftId,
      saveResult: args.saveResult as React.ComponentProps<typeof WordPublishSection>['saveResult'],
      verifySaveCollapsed: args.verifySaveCollapsed,
      setVerifySaveCollapsed: args.setVerifySaveCollapsed,
      isGeneratingParams: args.isGeneratingParams,
      analysisThinkingEnabled: args.analysisThinkingEnabled,
      setAnalysisThinkingEnabled: args.setAnalysisThinkingEnabled,
      aiDescription: args.aiDescription,
      handleAiDescriptionChange: args.handleAiDescriptionChange,
      handleGenerateParameters: args.handleGenerateParameters,
      aiGenerateResult: args.aiGenerateResult,
      isPreviewing: args.isPreviewing,
      handlePreviewWithAIParams: args.handlePreviewWithAIParams,
      previewInlineSupported: args.previewInlineSupported,
      apiBaseUrl: args.apiBaseUrl,
      getDownloadLabel: args.getDownloadLabel,
      templateName: args.templateName,
      setTemplateName: args.setTemplateName,
      selectedTemplateType: args.selectedTemplateType,
      isSaving: args.isSaving,
      handleSaveTemplateAndGuide: args.handleSaveTemplateAndGuide,
    },
  };
}

export function buildWordRecognitionSectionViewModel(args: {
  section: CompareCandidateSection;
  sectionGenerationResultMap: Map<string, WordSectionGenerationResult>;
  sectionSuggestionMap: Map<string, AISuggestion[]>;
  collapsedRecognitionSections: Record<string, boolean>;
  recognitionReady: boolean;
}) {
  const sectionResult = args.sectionGenerationResultMap.get(args.section.sectionKey);
  const sectionSuggestions = args.sectionSuggestionMap.get(args.section.sectionKey) || [];

  if (!sectionResult && !args.recognitionReady) {
    return null;
  }

  const pendingCount = sectionSuggestions.filter((suggestion) => !suggestion.applied).length;
  const appliedCount = sectionSuggestions.filter((suggestion) => suggestion.applied).length;

  return {
    sectionResult,
    sectionSuggestions,
    sectionSuggestionGroups: buildWordSectionSuggestionDisplayGroups(args.section, sectionSuggestions),
    groupName: sectionSuggestions[0]?.details?.chapter || args.section.sectionTitle,
    sectionCollapsed: args.collapsedRecognitionSections[args.section.sectionKey] ?? false,
    pendingCount,
    appliedCount,
    groupSummary: sectionSuggestions.length > 0
      ? buildSuggestionGroupSummary(sectionSuggestions)
      : null,
  };
}
