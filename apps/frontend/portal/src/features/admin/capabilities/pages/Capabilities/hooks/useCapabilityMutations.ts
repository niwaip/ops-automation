import { useMutation, useQuery, useQueryClient } from 'react-query';
import { message } from 'antd';
import { capabilityReleaseApi } from '@/api/capabilities';
import { temporalWorkflowApi } from '@/api/temporal';
import { executionFlowApi } from '@/api/flows';
import { skillApi } from '@/api/skill';
import type { DeploymentEnvironment } from '../utils/capabilitiesHelpers';

export function useCapabilityMutations({
  selectedReleaseId,
  wizardReleaseId,
  createVisible,
  setSelectedReleaseId,
  setSearchParams,
  setWizardReleaseId,
  setCreateWizardStep,
  setDeployVisible,
  setDeployOverridesDraft,
  setWizardValidationExecuted,
  setWizardAssistExplanation,
  setWizardValidationCasesDraft,
  setWizardValidationUserInput,
  setIsEditingSource,
  setSourceNameDraft,
  setSourcePayloadDraft,
  setIsEditingSkillDraft,
  setAnalysisResult,
  setAnalysisVisible,
}: {
  selectedReleaseId: string | null;
  wizardReleaseId: string | null;
  createVisible: boolean;
  setSelectedReleaseId: (id: string | null) => void;
  setSearchParams: (params: any) => void;
  setWizardReleaseId: (id: string | null) => void;
  setCreateWizardStep: (step: number) => void;
  setDeployVisible: (visible: boolean) => void;
  setDeployOverridesDraft: (draft: string) => void;
  setWizardValidationExecuted: (executed: boolean) => void;
  setWizardAssistExplanation: (exp: string) => void;
  setWizardValidationCasesDraft: (fn: (prev: string) => string) => void;
  setWizardValidationUserInput: (val: string) => void;
  setIsEditingSource: (editing: boolean) => void;
  setSourceNameDraft: (name: string) => void;
  setSourcePayloadDraft: (draft: string) => void;
  setIsEditingSkillDraft: (editing: boolean) => void;
  setAnalysisResult: (res: any) => void;
  setAnalysisVisible: (visible: boolean) => void;
}) {
  const queryClient = useQueryClient();

  const releasesQuery = useQuery(['capabilities'], capabilityReleaseApi.list);

  const temporalWorkflowOptionsQuery = useQuery(
    ['temporal-options'],
    () => temporalWorkflowApi.list(),
    { staleTime: 30_000 }
  );

  const executionFlowOptionsQuery = useQuery(
    ['flow-options'],
    () => executionFlowApi.list({ limit: 200, isActive: true }),
    { staleTime: 30_000 }
  );

  const detailQuery = useQuery(
    ['capability-detail', selectedReleaseId],
    () => capabilityReleaseApi.getById(selectedReleaseId as string),
    { enabled: Boolean(selectedReleaseId) }
  );

  const wizardDetailQuery = useQuery(
    ['capability-wizard-detail', wizardReleaseId],
    () => capabilityReleaseApi.getById(wizardReleaseId as string),
    { enabled: Boolean(wizardReleaseId && createVisible) }
  );

  const refreshQueries = async (releaseId?: string) => {
    await queryClient.invalidateQueries(['capabilities']);
    if (releaseId) {
      await queryClient.invalidateQueries(['capability-detail', releaseId]);
      await queryClient.invalidateQueries(['capability-wizard-detail', releaseId]);
    }
  };

  const createMutation = useMutation(capabilityReleaseApi.create, {
    onSuccess: async (result) => {
      message.success('Capability Release 已创建');
      const createdId = result.release.release.id;
      setWizardReleaseId(createdId);
      setCreateWizardStep(1);
      await refreshQueries(createdId);
    },
    onError: (error: any) => {
      message.error(error?.message || '创建失败');
    },
  });

  const validateStaticMutation = useMutation(
    ({ id }: { id: string }) => capabilityReleaseApi.validateStatic(id),
    {
      onSuccess: async (result, variables) => {
        message.success(result.validation.success ? '静态校验通过' : '静态校验未通过');
        await refreshQueries(variables.id);
      },
      onError: (error: any) => {
        message.error(error?.message || '静态校验失败');
      },
    }
  );

  const generateDraftMutation = useMutation(
    ({ id }: { id: string }) => capabilityReleaseApi.generateSkillDraft(id),
    {
      onSuccess: async (result, variables) => {
        message.success(`Skill 草案已生成: ${result.skillDraft.name}`);
        await refreshQueries(variables.id);
      },
      onError: (error: any) => {
        message.error(error?.message || '生成 Skill 草案失败');
      },
    }
  );

  const publishMutation = useMutation(
    async ({
      id,
      currentSkillDraftId,
      approvalStatus,
    }: {
      id: string;
      currentSkillDraftId?: string | null;
      approvalStatus?: string | null;
    }) => {
      let draftId = currentSkillDraftId;
      if (!draftId) {
        try {
          const draftRes = await capabilityReleaseApi.generateSkillDraft(id);
          draftId = draftRes.skillDraft.id;
        } catch {
          // generate draft fallback
        }
      }

      if (approvalStatus !== 'approved') {
        try {
          await capabilityReleaseApi.approveRelease(id, {
            decision: 'approved',
            comment: '发布向导自动审批通过',
          });
        } catch {
          // already approved or auto-approve fallback
        }
      }

      return capabilityReleaseApi.publishSkill(id);
    },
    {
      onSuccess: async (result, variables) => {
        message.success(`Skill 发布成功: ${result.publishedSkillId}`);
        if (wizardReleaseId === variables.id) {
          setCreateWizardStep(3);
        }
        await refreshQueries(variables.id);
      },
      onError: (error: any) => {
        const detailMsg = error?.response?.data?.message || error?.message || '发布 Skill 失败';
        message.error(`发布 Skill 失败: ${detailMsg}`);
      },
    }
  );

  const approveMutation = useMutation(
    ({ id }: { id: string }) =>
      capabilityReleaseApi.approveRelease(id, { decision: 'approved', comment: 'Portal 审批通过' }),
    {
      onSuccess: async (result, variables) => {
        message.success(`Release 已审批: ${result.release.release.status}`);
        await refreshQueries(variables.id);
      },
      onError: (error: any) => {
        message.error(error?.message || '审批失败');
      },
    }
  );

  const deployMutation = useMutation(
    ({
      id,
      environment,
      strategy,
      configOverrides,
    }: {
      id: string;
      environment: DeploymentEnvironment;
      strategy: 'hot_reload' | 'rolling_restart' | 'full_restart';
      configOverrides?: Record<string, unknown>;
    }) => capabilityReleaseApi.deploy(id, { environment, strategy, configOverrides }),
    {
      onSuccess: async (result, variables) => {
        message.success(`部署完成: ${result.deployment.status}`);
        setDeployVisible(false);
        setDeployOverridesDraft('{}');
        if (wizardReleaseId === variables.id) {
          setCreateWizardStep(2);
        }
        await refreshQueries(variables.id);
      },
      onError: (error: any) => {
        message.error(error?.message || '部署失败');
      },
    }
  );

  const validateSkillMutation = useMutation(
    ({ skillId }: { skillId: string }) => skillApi.validate(skillId),
    {
      onSuccess: async (result) => {
        const score = result.validation.score;
        message.success(`Skill 校验完成，分数 ${score}`);
      },
      onError: (error: any) => {
        message.error(error?.message || 'Skill 校验失败');
      },
    }
  );

  const realValidateMutation = useMutation(
    ({
      id,
      input,
      testUserInput,
      testCases,
      fn,
    }: {
      id: string;
      input?: Record<string, unknown>;
      testUserInput?: string;
      testCases?: string[];
      fn?: string;
    }) => capabilityReleaseApi.validateSandbox(id, { input, testUserInput, testCases, fn }),
    {
      onSuccess: async (result, variables) => {
        message.success(result.validation.success ? '真实校验通过' : '真实校验未通过');
        setWizardValidationExecuted(true);
        await refreshQueries(variables.id);
      },
      onError: (error: any) => {
        message.error(error?.message || '真实校验失败');
      },
    }
  );

  const wizardAssistMutation = useMutation(
    ({ id, environment }: { id: string; environment: DeploymentEnvironment }) =>
      capabilityReleaseApi.suggestWizardAssist(id, { environment }),
    {
      onSuccess: (result) => {
        setWizardAssistExplanation(result.explanation);
        if (Object.keys(result.deployConfig || {}).length > 0) {
          setDeployOverridesDraft(JSON.stringify(result.deployConfig, null, 2));
        }
        if (result.testUserInput) {
          setWizardValidationCasesDraft((prev) =>
            [prev, result.testUserInput].filter((item) => item && item.trim()).join('\n')
          );
          setWizardValidationUserInput(result.testUserInput);
        }
        message.success('AI 已生成部署与测试建议');
      },
      onError: (error: any) => {
        message.error(error?.message || 'AI 辅助建议生成失败');
      },
    }
  );

  const archiveReleaseMutation = useMutation(
    ({ id }: { id: string }) => capabilityReleaseApi.archive(id),
    {
      onSuccess: async (_, variables) => {
        message.success('Release 已删除');
        if (selectedReleaseId === variables.id) {
          setSelectedReleaseId(null);
          setSearchParams({});
        }
        await refreshQueries();
      },
      onError: (error: any) => {
        message.error(error?.message || '删除 Release 失败');
      },
    }
  );

  const updateSourceMutation = useMutation(
    ({
      id,
      sourceName,
      sourcePayload,
    }: {
      id: string;
      sourceName?: string;
      sourcePayload: Record<string, unknown>;
    }) => capabilityReleaseApi.updateSource(id, { sourceName, sourcePayload }),
    {
      onSuccess: async (result, variables) => {
        message.success('源定义已保存为新快照');
        setIsEditingSource(false);
        setSourceNameDraft(result.release.release.sourceName || '');
        setSourcePayloadDraft(
          JSON.stringify(result.release.currentSourceSnapshot?.sourcePayload || {}, null, 2)
        );
        await refreshQueries(variables.id);
      },
      onError: (error: any) => {
        message.error(error?.message || '保存源定义失败');
      },
    }
  );

  const updateSkillDraftMutation = useMutation(
    ({
      id,
      payload,
    }: {
      id: string;
      payload: Parameters<typeof capabilityReleaseApi.updateSkillDraft>[1];
    }) => capabilityReleaseApi.updateSkillDraft(id, payload),
    {
      onSuccess: async (_, variables) => {
        message.success('Skill 草案已更新');
        setIsEditingSkillDraft(false);
        await refreshQueries(variables.id);
      },
      onError: (error: any) => {
        message.error(error?.message || '更新 Skill 草案失败');
      },
    }
  );

  const analyzeFailureMutation = useMutation(
    (data: { id: string; recordId: string; recordType: 'build' | 'validation' | 'deployment' }) =>
      capabilityReleaseApi.analyzeFailure(data.id, {
        recordId: data.recordId,
        recordType: data.recordType,
      }),
    {
      onSuccess: (result) => {
        setAnalysisResult(result);
        setAnalysisVisible(true);
      },
      onError: (error: any) => {
        message.error(error?.message || 'AI 分析失败');
      },
    }
  );

  return {
    releasesQuery,
    temporalWorkflowOptionsQuery,
    executionFlowOptionsQuery,
    detailQuery,
    wizardDetailQuery,
    refreshQueries,
    createMutation,
    validateStaticMutation,
    generateDraftMutation,
    publishMutation,
    approveMutation,
    deployMutation,
    validateSkillMutation,
    realValidateMutation,
    wizardAssistMutation,
    archiveReleaseMutation,
    updateSourceMutation,
    updateSkillDraftMutation,
    analyzeFailureMutation,
  };
}
