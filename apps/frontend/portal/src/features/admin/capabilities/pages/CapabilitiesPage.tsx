import React, { useMemo } from 'react';
import { Form } from 'antd';
import { useSearchParams } from 'react-router-dom';
import type { CapabilitySourceType } from '@/api/capabilities';
import { ListSectionHeader } from '@/components/page/PageScaffold';
import { CreateCapabilityReleaseWizardModal } from './Capabilities/CreateCapabilityReleaseWizardModal';
import { CapabilityDetailDrawer } from './Capabilities/CapabilityDetailDrawer';
import {
  getNextStepHint,
  getSourceTypeLabel,
  statusColor,
  buildBrowserRecordingSourcePayload,
  SOURCE_TYPE_OPTIONS,
  DEPLOY_ENV_OPTIONS,
} from './Capabilities/utils/capabilitiesHelpers';
import { useCapabilitiesState } from './Capabilities/hooks/useCapabilitiesState';
import { useCapabilityMutations } from './Capabilities/hooks/useCapabilityMutations';
import { CapabilityListTable } from './Capabilities/components/CapabilityListTable';
import { CapabilityDeployModal } from './Capabilities/components/CapabilityDeployModal';

export interface CapabilitiesPageProps {
  mode?: 'manager' | 'studio';
}

export const CapabilitiesPage: React.FC<CapabilitiesPageProps> = ({ mode = 'manager' }) => {
  const [, setSearchParams] = useSearchParams();
  const isStudioMode = mode === 'studio';
  const state = useCapabilitiesState();
  const [createForm] = Form.useForm();
  const createSourceType = Form.useWatch('sourceType', createForm);

  const mutations = useCapabilityMutations({
    selectedReleaseId: state.selectedReleaseId,
    wizardReleaseId: state.wizardReleaseId,
    createVisible: state.createVisible,
    setSelectedReleaseId: state.setSelectedReleaseId,
    setSearchParams,
    setWizardReleaseId: state.setWizardReleaseId,
    setCreateWizardStep: state.setCreateWizardStep,
    setDeployVisible: state.setDeployVisible,
    setDeployOverridesDraft: state.setDeployOverridesDraft,
    setWizardValidationExecuted: state.setWizardValidationExecuted,
    setWizardAssistExplanation: state.setWizardAssistExplanation,
    setWizardValidationCasesDraft: state.setWizardValidationCasesDraft,
    setWizardValidationUserInput: state.setWizardValidationUserInput,
    setIsEditingSource: state.setIsEditingSource,
    setSourceNameDraft: state.setSourceNameDraft,
    setSourcePayloadDraft: state.setSourcePayloadDraft,
    setIsEditingSkillDraft: state.setIsEditingSkillDraft,
    setAnalysisResult: state.setAnalysisResult,
    setAnalysisVisible: state.setAnalysisVisible,
  });

  const releases = mutations.releasesQuery.data?.releases || [];

  const filteredReleases = useMemo(() => {
    if (!state.searchText.trim()) {
      return releases;
    }
    const keyword = state.searchText.toLowerCase();
    return releases.filter((release) => {
      const nextStepHint = getNextStepHint(release);
      return (
        release.id.toLowerCase().includes(keyword) ||
        String(release.sourceName || '')
          .toLowerCase()
          .includes(keyword) ||
        release.sourceType.toLowerCase().includes(keyword) ||
        release.status.toLowerCase().includes(keyword) ||
        nextStepHint.label.toLowerCase().includes(keyword)
      );
    });
  }, [releases, state.searchText]);

  const temporalWorkflowOptions = mutations.temporalWorkflowOptionsQuery.data || [];
  const flowOptions = mutations.executionFlowOptionsQuery.data?.templates || [];

  const createSourceOptions = useMemo(() => {
    const publishedSourceIds = new Set<string>();
    for (const rel of releases) {
      if (rel.sourceId && (rel.publishedSkillId || rel.status === 'published' || rel.deploymentStatus === 'deployed')) {
        publishedSourceIds.add(rel.sourceId);
      }
    }

    const options: Array<{
      label: string;
      value: string;
      sourceType: CapabilitySourceType;
      sourceName: string;
      description?: string;
    }> = [];

    // 1. Temporal Workflows (编排型 & 浏览器录制型)
    for (const wf of temporalWorkflowOptions) {
      if (publishedSourceIds.has(wf.id)) continue;
      const isBrowser = wf.sourceContext?.sourceType === 'browser_template';
      if (isBrowser) {
        options.push({
          label: `[浏览器录制] ${wf.name || `Browser Workflow ${wf.id.slice(0, 8)}`}`,
          value: wf.id,
          sourceType: 'browser_recording',
          sourceName: wf.name || `Browser Workflow ${wf.id.slice(0, 8)}`,
          description: wf.description || undefined,
        });
      } else if (wf.validationStatus === 'validated' && Boolean(wf.generatedCode?.trim())) {
        options.push({
          label: `[编排型] ${wf.name || `Workflow ${wf.id.slice(0, 8)}`}`,
          value: wf.id,
          sourceType: 'temporal_workflow',
          sourceName: wf.name || `Workflow ${wf.id.slice(0, 8)}`,
          description: wf.description || undefined,
        });
      }
    }

    // 2. Execution Flow Templates (模版型)
    for (const tpl of flowOptions) {
      if (publishedSourceIds.has(tpl.id)) continue;
      options.push({
        label: `[模版型] ${tpl.name || `Template ${tpl.id.slice(0, 8)}`}`,
        value: tpl.id,
        sourceType: 'execution_flow_template',
        sourceName: tpl.name || `Template ${tpl.id.slice(0, 8)}`,
        description: tpl.description || tpl.goal || undefined,
      });
    }

    return options;
  }, [releases, flowOptions, temporalWorkflowOptions]);

  const temporalWorkflowMap = useMemo(
    () => new Map(temporalWorkflowOptions.map((wf) => [wf.id, wf])),
    [temporalWorkflowOptions]
  );

  const handleSelectRelease = (id: string, drawerMode: 'view' | 'edit') => {
    state.setSelectedReleaseId(id);
    state.setDrawerMode(drawerMode);
    setSearchParams({ releaseId: id, mode: drawerMode });
  };

  const handleCreateSubmit = async (values: any) => {
    if (values.sourceType === 'browser_recording') {
      const sourceWorkflow = temporalWorkflowMap.get(values.sourceId);
      if (sourceWorkflow) {
        const sourcePayload = await buildBrowserRecordingSourcePayload(sourceWorkflow);
        mutations.createMutation.mutate({
          sourceType: 'browser_recording',
          sourceId: values.sourceId,
          sourceName: values.sourceName || sourceWorkflow.name,
          sourcePayload,
        });
        return;
      }
    }
    mutations.createMutation.mutate(values);
  };

  return (
    <div style={{ padding: isStudioMode ? 0 : 24 }}>
      {!isStudioMode && (
        <ListSectionHeader
          title="Capability Release 资产管理"
          subtitle="管理与版本发布编排型 (Temporal)、模版型 (Execution Flow) 与浏览器录制 Capability 资产"
        />
      )}

      <CapabilityListTable
        searchText={state.searchText}
        setSearchText={state.setSearchText}
        filteredReleases={filteredReleases}
        isLoading={mutations.releasesQuery.isLoading}
        onRefresh={() => void mutations.refreshQueries()}
        onOpenCreateModal={() => state.setCreateVisible(true)}
        onSelectRelease={handleSelectRelease}
        onOpenDeployModal={(id) => {
          state.setDeployTargetReleaseId(id);
          state.setDeployVisible(true);
        }}
        onArchiveRelease={(id) => mutations.archiveReleaseMutation.mutate({ id })}
        isStudioMode={isStudioMode}
      />

      <CreateCapabilityReleaseWizardModal
        visible={state.createVisible}
        onCancel={() => {
          state.setCreateVisible(false);
          state.setWizardReleaseId(null);
          state.setCreateWizardStep(0);
        }}
        createWizardStep={state.createWizardStep}
        wizardReleaseId={state.wizardReleaseId}
        wizardRelease={mutations.wizardDetailQuery.data?.release?.release || null}
        wizardDetail={mutations.wizardDetailQuery.data?.release || null}
        createForm={createForm}
        createSourceType={createSourceType}
        SOURCE_TYPE_OPTIONS={SOURCE_TYPE_OPTIONS as any}
        isCreateSourceLoading={mutations.temporalWorkflowOptionsQuery.isLoading}
        createSourceOptions={createSourceOptions}
        handleCreate={() => void handleCreateSubmit(createForm.getFieldsValue())}
        createMutationLoading={mutations.createMutation.isLoading}
        getSourceTypeLabel={getSourceTypeLabel}
        wizardDeployReadiness={{ hasExecutableCode: true }}
        deployEnvironment={state.deployEnvironment}
        setDeployEnvironment={state.setDeployEnvironment}
        DEPLOY_ENV_OPTIONS={DEPLOY_ENV_OPTIONS as any}
        deployStrategy={state.deployStrategy}
        setDeployStrategy={state.setDeployStrategy}
        wizardAssistMutationLoading={mutations.wizardAssistMutation.isLoading}
        onWizardAssist={() => {
          if (state.wizardReleaseId) {
            mutations.wizardAssistMutation.mutate({
              id: state.wizardReleaseId,
              environment: state.deployEnvironment,
            });
          }
        }}
        wizardHasSuccessfulStagingDeployment={false}
        handleWizardDeploy={() => {
          if (state.wizardReleaseId) {
            mutations.deployMutation.mutate({
              id: state.wizardReleaseId,
              environment: state.deployEnvironment,
              strategy: state.deployStrategy,
            });
          }
        }}
        deployMutationLoading={mutations.deployMutation.isLoading}
        publishMutationLoading={mutations.publishMutation.isLoading}
        generateDraftMutationLoading={mutations.generateDraftMutation.isLoading}
        approveMutationLoading={mutations.approveMutation.isLoading}
        handlePublishSkill={(release) => {
          mutations.publishMutation.mutate({
            id: release.id,
            currentSkillDraftId: release.currentSkillDraftId,
            approvalStatus: release.approvalStatus,
          });
        }}
        wizardValidationCasesDraft={state.wizardValidationCasesDraft}
        setWizardValidationCasesDraft={state.setWizardValidationCasesDraft}
        realValidateMutationLoading={mutations.realValidateMutation.isLoading}
        handleWizardValidate={() => {
          if (state.wizardReleaseId) {
            mutations.realValidateMutation.mutate({ id: state.wizardReleaseId });
          }
        }}
      />

      <CapabilityDeployModal
        visible={state.deployVisible}
        onCancel={() => state.setDeployVisible(false)}
        onDeploy={(params) => {
          if (state.deployTargetReleaseId) {
            mutations.deployMutation.mutate({
              id: state.deployTargetReleaseId,
              ...params,
            });
          }
        }}
        loading={mutations.deployMutation.isLoading}
      />

      {state.selectedReleaseId && mutations.detailQuery.data?.release && (
        <CapabilityDetailDrawer
          open={Boolean(state.selectedReleaseId && state.drawerMode)}
          onClose={() => {
            state.setSelectedReleaseId(null);
            state.setDrawerMode(null);
            setSearchParams({});
          }}
          selectedDetail={mutations.detailQuery.data.release}
          drawerMode={state.drawerMode}
          statusColor={statusColor}
          getSourceTypeLabel={getSourceTypeLabel}
          onValidateStatic={(id) => mutations.validateStaticMutation.mutate({ id })}
          validateStaticLoading={mutations.validateStaticMutation.isLoading}
          onOpenDeployModal={(id) => {
            state.setDeployTargetReleaseId(id);
            state.setDeployVisible(true);
          }}
          hasExecutableCode={true}
          onPublishSkill={(rel) => {
            mutations.publishMutation.mutate({
              id: rel.id,
              currentSkillDraftId: rel.currentSkillDraftId,
              approvalStatus: rel.approvalStatus,
            });
          }}
          publishLoading={mutations.publishMutation.isLoading}
          onValidateSkill={(skillId) => mutations.validateSkillMutation.mutate({ skillId })}
          validateSkillLoading={mutations.validateSkillMutation.isLoading}
          onOpenRealValidate={(id) => {
            state.setWizardReleaseId(id);
            state.setCreateWizardStep(3);
            state.setCreateVisible(true);
          }}
        />
      )}
    </div>
  );
};

export default CapabilitiesPage;
