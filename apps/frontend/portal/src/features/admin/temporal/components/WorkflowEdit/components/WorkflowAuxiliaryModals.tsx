import React from 'react';
import { SelectActivityModal } from './SelectActivityModal';
import { WorkflowTemplatePickerModal } from './WorkflowTemplatePickerModal';
import { WorkflowAiDraftDrawer } from './WorkflowAiDraftDrawer';
import { WorkflowApplyDraftConfirmModal } from './WorkflowApplyDraftConfirmModal';
import { WorkflowDetailModal } from './WorkflowDetailModal';
import type { WorkflowSelectableActivity } from '../hooks/useWorkflowEditState';
import type { TemplateModalMode } from '../hooks/useWorkflowDraftTemplates';
import type { TemporalWorkflowDTO } from '@/api/temporal';

export interface WorkflowAuxiliaryModalsProps {
  selectActivityModalVisible: boolean;
  setSelectActivityModalVisible: (visible: boolean) => void;
  setSelectingStepIndex: (index: number | null) => void;
  activityResources: WorkflowSelectableActivity[];
  handleSelectActivity: (activity: WorkflowSelectableActivity) => void;

  templateModalVisible: boolean;
  setTemplateModalVisible: (visible: boolean) => void;
  templateModalMode: TemplateModalMode;
  handleTemplateModeChange: (mode: any) => void;
  templateSearch: string;
  setTemplateSearch: (val: string) => void;
  templatesLoading: boolean;
  generatingTemplateId: string | null;
  templates: any[];
  handleSelectTemplate: (tpl: any) => void;
  browserTemplateSearch: string;
  setBrowserTemplateSearch: (val: string) => void;
  browserTemplatesLoading: boolean;
  generatingBrowserTemplateId: string | null;
  browserTemplates: any[];
  handleSelectBrowserTemplate: (tpl: any) => void;

  aiDraftDrawerVisible: boolean;
  setAiDraftDrawerVisible: (visible: boolean) => void;
  currentAiDraft: any;
  handleApplyCurrentDraft: () => void;
  aiDraftMessages: any[];
  aiDraftDescription: string;
  setAiDraftDescription: (val: string) => void;
  aiDraftReferenceUrl: string;
  setAiDraftReferenceUrl: (val: string) => void;
  skillFileName?: string;
  setSkillFileContent?: (val: string | undefined) => void;
  setSkillFileType?: (val: string | undefined) => void;
  setSkillFileName?: (val: string | undefined) => void;
  handleClearSkillFile?: () => void;
  generateAiDraftMutationLoading: boolean;

  handleGenerateAiDraft: () => void;
  aiDraftSessionsQuery: any;
  resolveApiErrorMessage: (err: unknown, fallback: string) => string;
  deleteAiDraftSessionMutation: any;
  handleDeleteAiDraftSession: (id: string) => void;
  handleResumeAiDraftSession: (session: any) => void;
  latestDraftMessageIndex: number;
  beautifyText: (text: string) => string;
  renderDraftDiffSummary: (diff: any) => React.ReactNode;
  renderDraftContractCard: (draft: any) => React.ReactNode;
  renderDraftInputParamSummary: (params: any) => React.ReactNode;
  renderDraftOutputParamSummary: (params: any) => React.ReactNode;
  renderDraftStepSummary: (steps: any) => React.ReactNode;
  refineAiDraftMutationLoading: boolean;
  aiDraftInput: string;
  setAiDraftInput: (val: string) => void;
  handleRefineAiDraft: () => void;

  applyDraftConfirmVisible: boolean;
  setApplyDraftConfirmVisible: (visible: boolean) => void;
  handleConfirmApplyCurrentDraft: () => Promise<void>;
  currentDraftApplyDiff: any;
  SECTION_CARD_STYLE: React.CSSProperties;

  detailModalVisible: boolean;
  setDetailModalVisible: (visible: boolean) => void;
  selectedWorkflow: TemporalWorkflowDTO | null;
  resolveWorkflowSourceSkillId: (wf?: TemporalWorkflowDTO | null) => string;
  handleCreateExecutionFromWorkflow: () => void | Promise<void>;
  creatingExecutionWorkflowId: string | null;
  getActivitySourceMeta: (step?: any) => any;
}

export const WorkflowAuxiliaryModals: React.FC<WorkflowAuxiliaryModalsProps> = ({
  selectActivityModalVisible,
  setSelectActivityModalVisible,
  setSelectingStepIndex,
  activityResources,
  handleSelectActivity,

  templateModalVisible,
  setTemplateModalVisible,
  templateModalMode,
  handleTemplateModeChange,
  templateSearch,
  setTemplateSearch,
  templatesLoading,
  generatingTemplateId,
  templates,
  handleSelectTemplate,
  browserTemplateSearch,
  setBrowserTemplateSearch,
  browserTemplatesLoading,
  generatingBrowserTemplateId,
  browserTemplates,
  handleSelectBrowserTemplate,

  aiDraftDrawerVisible,
  setAiDraftDrawerVisible,
  currentAiDraft,
  handleApplyCurrentDraft,
  aiDraftMessages,
  aiDraftDescription,
  setAiDraftDescription,
  aiDraftReferenceUrl,
  setAiDraftReferenceUrl,
  skillFileName,
  setSkillFileContent,
  setSkillFileType,
  setSkillFileName,
  handleClearSkillFile,
  generateAiDraftMutationLoading,
  handleGenerateAiDraft,
  aiDraftSessionsQuery,
  resolveApiErrorMessage,
  deleteAiDraftSessionMutation,
  handleDeleteAiDraftSession,
  handleResumeAiDraftSession,
  latestDraftMessageIndex,
  beautifyText,
  renderDraftDiffSummary,
  renderDraftContractCard,
  renderDraftInputParamSummary,
  renderDraftOutputParamSummary,
  renderDraftStepSummary,
  refineAiDraftMutationLoading,
  aiDraftInput,
  setAiDraftInput,
  handleRefineAiDraft,

  applyDraftConfirmVisible,
  setApplyDraftConfirmVisible,
  handleConfirmApplyCurrentDraft,
  currentDraftApplyDiff,
  SECTION_CARD_STYLE,

  detailModalVisible,
  setDetailModalVisible,
  selectedWorkflow,
  resolveWorkflowSourceSkillId,
  handleCreateExecutionFromWorkflow,
  creatingExecutionWorkflowId,
  getActivitySourceMeta,
}) => {
  return (
    <>
      <SelectActivityModal
        visible={selectActivityModalVisible}
        onCancel={() => {
          setSelectActivityModalVisible(false);
          setSelectingStepIndex(null);
        }}
        activityResources={activityResources}
        onSelectActivity={handleSelectActivity}
      />
      <WorkflowTemplatePickerModal
        templateModalVisible={templateModalVisible}
        onCancel={() => setTemplateModalVisible(false)}
        templateModalMode={templateModalMode}
        handleTemplateModeChange={handleTemplateModeChange}
        templateSearch={templateSearch}
        setTemplateSearch={setTemplateSearch}
        loadDocumentTemplates={() => {}}
        templatesLoading={templatesLoading}
        generatingTemplateId={generatingTemplateId}
        templates={templates}
        handleSelectTemplate={handleSelectTemplate}
        browserTemplateSearch={browserTemplateSearch}
        setBrowserTemplateSearch={setBrowserTemplateSearch}
        loadBrowserTemplates={() => {}}
        browserTemplatesLoading={browserTemplatesLoading}
        generatingBrowserTemplateId={generatingBrowserTemplateId}
        browserTemplates={browserTemplates}
        handleSelectBrowserTemplate={handleSelectBrowserTemplate}
      />
      <WorkflowAiDraftDrawer
        visible={aiDraftDrawerVisible}
        onClose={() => setAiDraftDrawerVisible(false)}
        currentAiDraft={currentAiDraft}
        handleApplyCurrentDraft={handleApplyCurrentDraft}
        aiDraftMessages={aiDraftMessages}
        aiDraftDescription={aiDraftDescription}
        setAiDraftDescription={setAiDraftDescription}
        aiDraftReferenceUrl={aiDraftReferenceUrl}
        setAiDraftReferenceUrl={setAiDraftReferenceUrl}
        skillFileName={skillFileName}
        setSkillFileContent={setSkillFileContent}
        setSkillFileType={setSkillFileType}
        setSkillFileName={setSkillFileName}
        handleClearSkillFile={handleClearSkillFile}
        generateAiDraftMutationLoading={generateAiDraftMutationLoading}

        handleGenerateAiDraft={handleGenerateAiDraft}
        aiDraftSessionsQuery={aiDraftSessionsQuery}
        resolveApiErrorMessage={resolveApiErrorMessage}
        deleteAiDraftSessionMutation={deleteAiDraftSessionMutation}
        handleDeleteAiDraftSession={handleDeleteAiDraftSession}
        handleResumeAiDraftSession={handleResumeAiDraftSession}
        latestDraftMessageIndex={latestDraftMessageIndex}
        beautifyText={beautifyText}
        renderDraftDiffSummary={renderDraftDiffSummary}
        renderDraftContractCard={renderDraftContractCard}
        renderDraftInputParamSummary={renderDraftInputParamSummary}
        renderDraftOutputParamSummary={renderDraftOutputParamSummary}
        renderDraftStepSummary={renderDraftStepSummary}
        refineAiDraftMutationLoading={refineAiDraftMutationLoading}
        aiDraftInput={aiDraftInput}
        setAiDraftInput={setAiDraftInput}
        handleRefineAiDraft={handleRefineAiDraft}
      />
      <WorkflowApplyDraftConfirmModal
        applyDraftConfirmVisible={applyDraftConfirmVisible}
        setApplyDraftConfirmVisible={setApplyDraftConfirmVisible}
        handleConfirmApplyCurrentDraft={handleConfirmApplyCurrentDraft}
        currentAiDraft={currentAiDraft}
        currentDraftApplyDiff={currentDraftApplyDiff}
        SECTION_CARD_STYLE={SECTION_CARD_STYLE}
      />
      <WorkflowDetailModal
        visible={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        selectedWorkflow={selectedWorkflow}
        SECTION_CARD_STYLE={SECTION_CARD_STYLE}
        resolveWorkflowSourceSkillId={resolveWorkflowSourceSkillId}
        handleCreateExecutionFromWorkflow={() => {
          void handleCreateExecutionFromWorkflow();
        }}
        creatingExecutionWorkflowId={creatingExecutionWorkflowId}
        getActivitySourceMeta={getActivitySourceMeta}
      />
    </>
  );
};
