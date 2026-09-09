import React, { useMemo, useState } from 'react';
import { Form, message } from 'antd';
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
import { CapabilityOverviewCards, CapabilityQuickTab } from './Capabilities/components/CapabilityOverviewCards';
import { CapabilityFilterToolbar } from './Capabilities/components/CapabilityFilterToolbar';
import { findMissingRequiredSmokeFields } from './Capabilities/components/DeploymentSmokeInputEditor';

export interface CapabilitiesPageProps {
  mode?: 'manager' | 'studio';
}

export const CapabilitiesPage: React.FC<CapabilitiesPageProps> = ({ mode = 'manager' }) => {
  const [, setSearchParams] = useSearchParams();
  const isStudioMode = mode === 'studio';
  const state = useCapabilitiesState();
  const [createForm] = Form.useForm();
  const createSourceType = Form.useWatch('sourceType', createForm);
  const [activeQuickTab, setActiveQuickTab] = useState<CapabilityQuickTab>('all');
  const [sourceTypeFilter, setSourceTypeFilter] = useState<CapabilitySourceType | undefined>();

  const mutations = useCapabilityMutations({
    selectedReleaseId: state.selectedReleaseId,
    deployTargetReleaseId: state.deployTargetReleaseId,
    wizardReleaseId: state.wizardReleaseId,
    createVisible: state.createVisible,
    setSelectedReleaseId: state.setSelectedReleaseId,
    setSearchParams,
    setWizardReleaseId: state.setWizardReleaseId,
    setCreateWizardStep: state.setCreateWizardStep,
    setDeployVisible: state.setDeployVisible,
    setDeployOverridesDraft: state.setDeployOverridesDraft,
    setDeploySmokeInputDraft: state.setDeploySmokeInputDraft,
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
    let list = [...releases];

    // 1. 快捷分段工作流筛选
    if (activeQuickTab === 'deployed') {
      list = list.filter(
        (r) =>
          r.deploymentStatus === 'deployed' ||
          r.deploymentStatus === 'succeeded' ||
          r.status === 'published' ||
          r.status === 'deployed' ||
          Boolean(r.publishedSkillId)
      );
    } else if (activeQuickTab === 'pending') {
      list = list.filter(
        (r) =>
          r.approvalStatus === 'pending_approval' ||
          r.status === 'draft' ||
          r.status === 'draft_ready' ||
          r.approvalStatus === 'pending'
      );
    } else if (activeQuickTab === 'failed') {
      list = list.filter(
        (r) =>
          r.status === 'build_failed' ||
          r.status === 'validation_failed' ||
          r.status === 'deploy_failed' ||
          r.deploymentStatus === 'deploy_failed' ||
          r.deploymentStatus === 'failed'
      );
    } else if (activeQuickTab === 'browser') {
      list = list.filter((r) => r.sourceType === 'browser_recording');
    } else if (activeQuickTab === 'temporal') {
      list = list.filter((r) => r.sourceType === 'temporal_workflow');
    }

    // 2. 源类型下拉筛选
    if (sourceTypeFilter) {
      list = list.filter((r) => r.sourceType === sourceTypeFilter);
    }

    // 3. 关键字搜索
    if (state.searchText.trim()) {
      const keyword = state.searchText.toLowerCase().trim();
      list = list.filter((release) => {
        const nextStepHint = getNextStepHint(release);
        return (
          release.id.toLowerCase().includes(keyword) ||
          String(release.sourceName || '').toLowerCase().includes(keyword) ||
          release.sourceType.toLowerCase().includes(keyword) ||
          release.status.toLowerCase().includes(keyword) ||
          nextStepHint.label.toLowerCase().includes(keyword)
        );
      });
    }

    return list;
  }, [releases, activeQuickTab, sourceTypeFilter, state.searchText]);

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
    <div style={{ padding: isStudioMode ? 0 : '16px 20px 24px', maxWidth: 1440, margin: '0 auto' }}>
      {!isStudioMode && (
        <ListSectionHeader
          title="流程发布中心"
          subtitle="全天候管理编排型流程 (Temporal)、浏览器录制与执行流模板的能力发布生命周期、审批流转与运行环境部署"
        />
      )}

      {/* 1. 顶部全局概览指标看板 */}
      <CapabilityOverviewCards
        releases={releases}
        activeTab={activeQuickTab}
        onSelectTab={setActiveQuickTab}
      />

      {/* 2. 场景化快捷分流与过滤栏 */}
      <CapabilityFilterToolbar
        searchText={state.searchText}
        onSearchChange={state.setSearchText}
        sourceTypeFilter={sourceTypeFilter}
        onSourceTypeFilterChange={setSourceTypeFilter}
        activeQuickTab={activeQuickTab}
        onQuickTabChange={setActiveQuickTab}
        releases={releases}
        isLoading={mutations.releasesQuery.isLoading}
        onRefresh={() => void mutations.refreshQueries()}
        onOpenCreateModal={() => state.setCreateVisible(true)}
        isStudioMode={isStudioMode}
      />

      {/* 3. 流程发布资产列表表格 */}
      <CapabilityListTable
        filteredReleases={filteredReleases}
        isLoading={mutations.releasesQuery.isLoading}
        onSelectRelease={handleSelectRelease}
        onOpenDeployModal={(id) => {
          state.setDeployTargetReleaseId(id);
          state.setDeployVisible(true);
        }}
        onArchiveRelease={(id) => mutations.archiveReleaseMutation.mutate({ id })}
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
        deploySmokeInputDraft={state.deploySmokeInputDraft}
        setDeploySmokeInputDraft={state.setDeploySmokeInputDraft}
        handleWizardDeploy={() => {
          if (state.wizardReleaseId) {
            let smokeTestInput: Record<string, unknown> | undefined;
            try {
              smokeTestInput = JSON.parse(state.deploySmokeInputDraft || '{}');
            } catch {
              message.error('部署后验证输入格式不正确');
              return;
            }
            const wizardSourcePayload =
              mutations.wizardDetailQuery.data?.release?.currentSourceSnapshot?.sourcePayload;
            const missingFields = findMissingRequiredSmokeFields(
              wizardSourcePayload,
              smokeTestInput
            );
            if (missingFields.length > 0) {
              message.error(`请填写必填验证参数：${missingFields.join('、')}`);
              return;
            }
            mutations.deployMutation.mutate({
              id: state.wizardReleaseId,
              environment: state.deployEnvironment,
              strategy: state.deployStrategy,
              smokeTestInput,
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
        sourcePayload={mutations.deployDetailQuery.data?.release?.currentSourceSnapshot?.sourcePayload}
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
