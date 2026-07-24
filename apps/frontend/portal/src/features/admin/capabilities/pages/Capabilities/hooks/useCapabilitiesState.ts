import { useState } from 'react';
import type { ReleaseAuditEvent } from '@/api/capabilities';
import type { ParamSchemaFieldDraft } from '@/components/capability-release/ParamSchemaEditor';
import type { ApiEndpointDraft, DeploymentEnvironment } from '../utils/capabilitiesHelpers';

export function useCapabilitiesState() {
  const [searchText, setSearchText] = useState('');
  const [createVisible, setCreateVisible] = useState(false);
  const [selectedReleaseId, setSelectedReleaseId] = useState<string | null>(null);
  const [diffLeftSnapshotId, setDiffLeftSnapshotId] = useState<string | null>(null);
  const [diffRightSnapshotId, setDiffRightSnapshotId] = useState<string | null>(null);
  const [showOnlyDiff, setShowOnlyDiff] = useState(true);
  const [isEditingSource, setIsEditingSource] = useState(false);
  const [sourceNameDraft, setSourceNameDraft] = useState('');
  const [sourcePayloadDraft, setSourcePayloadDraft] = useState('{}');
  const [deployVisible, setDeployVisible] = useState(false);
  const [deployTargetReleaseId, setDeployTargetReleaseId] = useState<string | null>(null);
  const [deployEnvironment, setDeployEnvironment] = useState<DeploymentEnvironment>('staging');
  const [deployStrategy, setDeployStrategy] = useState<
    'hot_reload' | 'rolling_restart' | 'full_restart'
  >('rolling_restart');
  const [deployOverridesDraft, setDeployOverridesDraft] = useState('{}');
  const [createWizardStep, setCreateWizardStep] = useState(0);
  const [wizardReleaseId, setWizardReleaseId] = useState<string | null>(null);
  const [wizardValidationCasesDraft, setWizardValidationCasesDraft] = useState('');
  const [wizardValidationUserInput, setWizardValidationUserInput] = useState('');
  const [wizardAssistExplanation, setWizardAssistExplanation] = useState('');
  const [wizardValidationExecuted, setWizardValidationExecuted] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'view' | 'edit' | null>(null);

  const [selectedAuditEvent, setSelectedAuditEvent] = useState<ReleaseAuditEvent | null>(null);
  const [isAuditModalVisible, setIsAuditModalVisible] = useState(false);

  const [jsonViewVisible, setJsonViewVisible] = useState(false);
  const [jsonViewTitle, setJsonViewTitle] = useState('');
  const [jsonViewData, setJsonViewData] = useState<any>(null);

  const [analysisResult, setAnalysisResult] = useState<{
    analysis: string;
    explanation: string;
    isParameterIssue: boolean;
    suggestedParams?: Record<string, unknown> | null;
    suggestedAction?: string | null;
  } | null>(null);
  const [analysisVisible, setAnalysisVisible] = useState(false);

  const [isEditingSkillDraft, setIsEditingSkillDraft] = useState(false);
  const [skillDraftName, setSkillDraftName] = useState('');
  const [skillDraftDescription, setSkillDraftDescription] = useState('');
  const [skillDraftTriggerKeywords, setSkillDraftTriggerKeywords] = useState<string[]>([]);
  const [skillDraftTools, setSkillDraftTools] = useState<string[]>([]);
  const [skillDraftTemplateIds, setSkillDraftTemplateIds] = useState<string[]>([]);
  const [skillDraftParamFields, setSkillDraftParamFields] = useState<ParamSchemaFieldDraft[]>([]);
  const [skillDraftParamSchemaExtras, setSkillDraftParamSchemaExtras] = useState<
    Record<string, unknown>
  >({
    type: 'object',
  });
  const [skillDraftApiEndpointFields, setSkillDraftApiEndpointFields] = useState<
    ApiEndpointDraft[]
  >([]);

  return {
    searchText,
    setSearchText,
    createVisible,
    setCreateVisible,
    selectedReleaseId,
    setSelectedReleaseId,
    diffLeftSnapshotId,
    setDiffLeftSnapshotId,
    diffRightSnapshotId,
    setDiffRightSnapshotId,
    showOnlyDiff,
    setShowOnlyDiff,
    isEditingSource,
    setIsEditingSource,
    sourceNameDraft,
    setSourceNameDraft,
    sourcePayloadDraft,
    setSourcePayloadDraft,
    deployVisible,
    setDeployVisible,
    deployTargetReleaseId,
    setDeployTargetReleaseId,
    deployEnvironment,
    setDeployEnvironment,
    deployStrategy,
    setDeployStrategy,
    deployOverridesDraft,
    setDeployOverridesDraft,
    createWizardStep,
    setCreateWizardStep,
    wizardReleaseId,
    setWizardReleaseId,
    wizardValidationCasesDraft,
    setWizardValidationCasesDraft,
    wizardValidationUserInput,
    setWizardValidationUserInput,
    wizardAssistExplanation,
    setWizardAssistExplanation,
    wizardValidationExecuted,
    setWizardValidationExecuted,
    drawerMode,
    setDrawerMode,
    selectedAuditEvent,
    setSelectedAuditEvent,
    isAuditModalVisible,
    setIsAuditModalVisible,
    jsonViewVisible,
    setJsonViewVisible,
    jsonViewTitle,
    setJsonViewTitle,
    jsonViewData,
    setJsonViewData,
    analysisResult,
    setAnalysisResult,
    analysisVisible,
    setAnalysisVisible,
    isEditingSkillDraft,
    setIsEditingSkillDraft,
    skillDraftName,
    setSkillDraftName,
    skillDraftDescription,
    setSkillDraftDescription,
    skillDraftTriggerKeywords,
    setSkillDraftTriggerKeywords,
    skillDraftTools,
    setSkillDraftTools,
    skillDraftTemplateIds,
    setSkillDraftTemplateIds,
    skillDraftParamFields,
    setSkillDraftParamFields,
    skillDraftParamSchemaExtras,
    setSkillDraftParamSchemaExtras,
    skillDraftApiEndpointFields,
    setSkillDraftApiEndpointFields,
  };
}
