import { useMutation, useQueryClient } from 'react-query';
import { message } from 'antd';
import type { FormInstance } from 'antd';
import {
  temporalWorkflowApi,
  WorkflowDsl,
  ActivityDsl,
  WorkflowCodeResult,
  WorkflowCodeStreamEvent,
  HttpRequestOptimizeResult,
  HttpRequestPreviewResult,
  CreateTemporalWorkflowDTO,
  TemporalWorkflowDTO,
} from '@/api/temporal';
import {
  resolveApiErrorMessage,
  buildSynchronizedWorkflowInputPolicy,
  normalizeValidationInputValue,
  collectTemplateVariablesFromValue,
  getStepInputPublicEntries,
  HttpRequestStepConfig,
} from '../utils/workflowEditHelpers';
import type { WorkflowSelectableActivity } from './useWorkflowEditState';
import { buildInitialWorkflowValidationValues } from '../components/WorkflowValidationInputFields';

export interface UseWorkflowSaveAndValidateProps {
  form: FormInstance;
  workflowDsl: WorkflowDsl;
  activityDsl: ActivityDsl;
  editingWorkflow: TemporalWorkflowDTO | null;
  setEditingWorkflow: (wf: TemporalWorkflowDTO | null) => void;
  generatedCode: string | null;
  setGeneratedCode: (code: string | null) => void;
  lastGeneratedSignature: string | null;
  setLastGeneratedSignature: (sig: string | null) => void;
  isGeneratedCodeStale: boolean;
  setIsGeneratedCodeStale: (stale: boolean) => void;
  currentDraftSignature: string;
  forceAiGeneration: boolean;
  saveSubmitting: boolean;
  setSaveSubmitting: (submitting: boolean) => void;
  loading?: boolean;
  onSave: (
    data: CreateTemporalWorkflowDTO,
    workflowId?: string
  ) => Promise<TemporalWorkflowDTO | void> | void;
  dispatchCodeGeneration: (action: any) => void;
  dispatchRealValidation: (action: any) => void;
  setValidationResult: (res: any) => void;
  setValidateModalVisible: (visible: boolean) => void;
  setCodeModalVisible: (visible: boolean) => void;
  realValidationInputParams: Record<string, string>;
  resolveStepActivity: (step?: WorkflowDsl['steps'][number]) => WorkflowSelectableActivity | undefined;
  isHttpRequestActivity: (activity?: WorkflowSelectableActivity, step?: WorkflowDsl['steps'][number]) => boolean;
  getStepHttpRequestConfig: (step?: WorkflowDsl['steps'][number], activity?: WorkflowSelectableActivity) => HttpRequestStepConfig;
  updateStepHttpRequestConfig: (index: number, config: Partial<HttpRequestStepConfig>) => void;
  selectedStepIndexForConfig: number | null;
  selectedStep: WorkflowDsl['steps'][number] | undefined;
  selectedStepActivity: WorkflowSelectableActivity | undefined;
  selectedStepHttpConfig: HttpRequestStepConfig;
  selectedStepAiPrompt: string;
  setHttpAiErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setHttpAiSuggestedConfigs: React.Dispatch<React.SetStateAction<Record<string, Record<string, any>>>>;
  setHttpAiSuggestedJsonDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setHttpAiPreviewResponses: React.Dispatch<React.SetStateAction<Record<string, Record<string, any>>>>;
  setHttpAiExplanations: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setHttpAiApplySummaries: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  setActiveHttpAiStepId: (id: string | null) => void;
  setResourceSidebarCollapsed: (collapsed: boolean) => void;
  setStepsSidebarCollapsed: (collapsed: boolean) => void;
  httpAiSuggestedJsonDrafts: Record<string, string>;
  setStepConfigActiveKeys: (keys: string[]) => void;
}

export const useWorkflowSaveAndValidate = ({
  form,
  workflowDsl,
  activityDsl,
  editingWorkflow,
  setEditingWorkflow,
  generatedCode,
  setGeneratedCode,
  setLastGeneratedSignature,
  isGeneratedCodeStale,
  setIsGeneratedCodeStale,
  currentDraftSignature,
  forceAiGeneration,
  saveSubmitting,
  setSaveSubmitting,
  loading,
  onSave,
  dispatchCodeGeneration,
  dispatchRealValidation,
  setValidationResult,
  setValidateModalVisible,
  setCodeModalVisible,
  realValidationInputParams,
  resolveStepActivity,
  isHttpRequestActivity,
  getStepHttpRequestConfig,
  updateStepHttpRequestConfig,
  selectedStepIndexForConfig,
  selectedStep,
  selectedStepActivity,
  selectedStepHttpConfig,
  selectedStepAiPrompt,
  setHttpAiErrors,
  setHttpAiSuggestedConfigs,
  setHttpAiSuggestedJsonDrafts,
  setHttpAiPreviewResponses,
  setHttpAiExplanations,
  setHttpAiApplySummaries,
  setActiveHttpAiStepId,
  setResourceSidebarCollapsed,
  setStepsSidebarCollapsed,
  httpAiSuggestedJsonDrafts,
  setStepConfigActiveKeys,
}: UseWorkflowSaveAndValidateProps) => {
  const queryClient = useQueryClient();

  const appendRealValidationLog = (content: string) =>
    dispatchRealValidation({ type: 'APPEND_LOG', payload: content });
  const appendCodeGenerationLog = (content: string) =>
    dispatchCodeGeneration({ type: 'APPEND_LOG', payload: content });

  const validateMutation = useMutation(
    ({
      workflowDsl: wfd,
      activityDsl: ad,
    }: {
      workflowDsl: WorkflowDsl;
      activityDsl: ActivityDsl;
    }) => temporalWorkflowApi.validate(wfd, ad),
    {
      onSuccess: (result) => {
        setValidationResult(result);
        void message.success('验证完成');
      },
      onError: (error: unknown) => {
        void message.error(resolveApiErrorMessage(error, '验证失败'));
      },
    }
  );

  const optimizeHttpConfigMutation = useMutation(
    (variables: {
      stepIndex: number;
      stepId: string;
      stepConfig: Record<string, any>;
      inputParams: Record<string, any>;
      userRequest: string;
    }) =>
      temporalWorkflowApi.optimizeHttpRequestConfig(
        variables.stepConfig,
        variables.inputParams,
        variables.userRequest
      ),
    {
      onSuccess: (result: HttpRequestOptimizeResult, variables) => {
        if (!result.success || !result.optimizedConfig) {
          setHttpAiErrors((prev) => ({
            ...prev,
            [variables.stepId]: result.error || 'AI 优化失败',
          }));
          return;
        }
        setHttpAiErrors((prev) => {
          const next = { ...prev };
          delete next[variables.stepId];
          return next;
        });
        setHttpAiSuggestedConfigs((prev) => ({
          ...prev,
          [variables.stepId]: result.optimizedConfig as Record<string, any>,
        }));
        setHttpAiSuggestedJsonDrafts((prev) => ({
          ...prev,
          [variables.stepId]: JSON.stringify(result.optimizedConfig, null, 2),
        }));
        if (result.previewResponse) {
          setHttpAiPreviewResponses((prev) => ({
            ...prev,
            [variables.stepId]: result.previewResponse as Record<string, any>,
          }));
        }
        setHttpAiExplanations((prev) => ({
          ...prev,
          [variables.stepId]: result.explanation || 'AI 已生成可应用的优化建议',
        }));
      },
      onError: (error: unknown, variables) => {
        setHttpAiErrors((prev) => ({
          ...prev,
          [variables.stepId]: `AI 优化失败: ${resolveApiErrorMessage(error, 'Unknown error')}`,
        }));
      },
    }
  );

  const previewHttpConfigMutation = useMutation(
    (variables: {
      stepId: string;
      stepConfig: Record<string, any>;
      inputParams: Record<string, any>;
    }) => temporalWorkflowApi.previewHttpRequestConfig(variables.stepConfig, variables.inputParams),
    {
      onSuccess: (result: HttpRequestPreviewResult, variables) => {
        if (!result.success || !result.previewResponse) {
          setHttpAiErrors((prev) => ({
            ...prev,
            [variables.stepId]: result.error || '获取当前配置响应失败',
          }));
          return;
        }
        setHttpAiErrors((prev) => {
          const next = { ...prev };
          delete next[variables.stepId];
          return next;
        });
        setHttpAiPreviewResponses((prev) => ({
          ...prev,
          [variables.stepId]: result.previewResponse as Record<string, any>,
        }));
      },
      onError: (error: unknown, variables) => {
        setHttpAiErrors((prev) => ({
          ...prev,
          [variables.stepId]: `获取当前配置响应失败: ${resolveApiErrorMessage(error, 'Unknown error')}`,
        }));
      },
    }
  );

  const collectWorkflowInputParams = (): Record<string, string> => {
    const declaredInputParams = workflowDsl.inputParams || {};
    if (Object.keys(declaredInputParams).length > 0) {
      return buildInitialWorkflowValidationValues(
        declaredInputParams,
        workflowDsl.validation?.scenarios
      );
    }
    const params: Record<string, string> = {};
    workflowDsl.steps.forEach((step) => {
      getStepInputPublicEntries(step).forEach(([key, value]) => {
        if (!params[key]) {
          params[key] = normalizeValidationInputValue(value);
        }
      });
      const activity = resolveStepActivity(step);
      if (isHttpRequestActivity(activity, step)) {
        Array.from(
          collectTemplateVariablesFromValue(getStepHttpRequestConfig(step, activity))
        ).forEach((key) => {
          if (!(key in params)) {
            params[key] = '';
          }
        });
      }
    });
    return params;
  };

  const buildWorkflowPersistenceData = async (): Promise<CreateTemporalWorkflowDTO> => {
    const values = (await form.validateFields()) as {
      name?: string;
      description?: string;
      taskQueue?: string;
    };
    const workflowName = values.name || workflowDsl.name;
    const shouldPersistGeneratedCode =
      Boolean(generatedCode) &&
      (!editingWorkflow || String(editingWorkflow.generatedCode || '') !== generatedCode);
    const persistedGeneratedCode =
      shouldPersistGeneratedCode && typeof generatedCode === 'string' ? generatedCode : undefined;
    const synchronizedInputPolicy = buildSynchronizedWorkflowInputPolicy(
      workflowDsl.inputParams,
      workflowDsl.inputPolicy
    );

    return {
      name: workflowName,
      description: values.description,
      taskQueue: values.taskQueue,
      workflowDsl: {
        ...workflowDsl,
        name: workflowName,
        ...(synchronizedInputPolicy ? { inputPolicy: synchronizedInputPolicy } : {}),
        steps: workflowDsl.steps.map((step) => {
          if (step.type !== 'activity') {
            return step;
          }
          const resolved = resolveStepActivity(step);
          return {
            ...step,
            activityRef: step.activityRef || resolved?.ref,
            activityName: step.activityName || resolved?.name,
          };
        }),
      },
      activityDsl,
      generatedCode: persistedGeneratedCode,
    };
  };

  const handleValidate = () => {
    const formValues = form.getFieldsValue();
    const workflowName = formValues.name || workflowDsl.name;
    setValidationResult(null);
    setValidateModalVisible(true);
    validateMutation.mutate({ workflowDsl: { ...workflowDsl, name: workflowName }, activityDsl });
  };

  const handleGenerateCode = async (errorContext?: string) => {
    const formValues = form.getFieldsValue();
    const workflowName = formValues.name || workflowDsl.name;
    if (!workflowName) {
      message.warning('请先填写工作流名称');
      return;
    }
    if (workflowDsl.steps.length === 0) {
      message.warning('请先添加至少一个步骤');
      return;
    }
    const nextWorkflowDsl = { ...workflowDsl, name: workflowName };
    dispatchCodeGeneration({ type: 'START' });
    try {
      if (editingWorkflow?.id) {
        const synchronizedInputPolicy = buildSynchronizedWorkflowInputPolicy(
          workflowDsl.inputParams,
          workflowDsl.inputPolicy
        );
        appendCodeGenerationLog(
          `[${new Date().toISOString()}] 已保存当前 Workflow 草稿，准备生成并持久化 artifact`
        );
        await temporalWorkflowApi.update(editingWorkflow.id, {
          name: workflowName,
          description: formValues.description,
          taskQueue: formValues.taskQueue,
          workflowDsl: {
            ...nextWorkflowDsl,
            ...(synchronizedInputPolicy ? { inputPolicy: synchronizedInputPolicy } : {}),
          },
          activityDsl,
        });
        appendCodeGenerationLog(
          `[${new Date().toISOString()}] 已同步最新 DSL，开始调用 generate-and-save`
        );
        const persistedGeneration = await temporalWorkflowApi.generateAndSave(editingWorkflow.id, {
          errorContext,
          forceAiGeneration,
        });
        dispatchCodeGeneration({ type: 'SET_RESULT', payload: persistedGeneration.generation });
        if (persistedGeneration.generation.success && persistedGeneration.generation.code) {
          setEditingWorkflow(persistedGeneration.workflow);
          setGeneratedCode(persistedGeneration.generation.code);
          setLastGeneratedSignature(currentDraftSignature);
          setIsGeneratedCodeStale(false);
          setCodeModalVisible(true);
          void queryClient.invalidateQueries(['temporal']);
          message.success('代码已生成并保存为 Workflow artifact');
        } else {
          message.error(persistedGeneration.generation.error || '代码生成失败');
        }
        return;
      }

      await temporalWorkflowApi.generateWorkflowCodeStream(
        nextWorkflowDsl,
        activityDsl,
        errorContext,
        forceAiGeneration,
        (event: WorkflowCodeStreamEvent) => {
          if (event.type === 'log' && event.content) {
            appendCodeGenerationLog(event.content);
            return;
          }
          if (event.type === 'done') {
            const result: WorkflowCodeResult = {
              success: Boolean(event.success),
              code: event.code,
              error: event.error,
              attempts: event.attempts,
              autoRetried: event.autoRetried,
              generationMode: event.generationMode,
            };
            dispatchCodeGeneration({ type: 'SET_RESULT', payload: result });
            if (result.success && result.code) {
              setGeneratedCode(result.code);
              setLastGeneratedSignature(currentDraftSignature);
              setIsGeneratedCodeStale(false);
              setCodeModalVisible(true);
              if (result.autoRetried) {
                message.success(
                  `代码生成成功，已基于编译反馈自动重试 ${Math.max((result.attempts || 1) - 1, 1)} 次`
                );
              } else if (forceAiGeneration && result.generationMode === 'ai') {
                message.success('代码生成成功（已强制使用 AI 生成）');
              } else if (result.generationMode === 'deterministic') {
                message.success('代码生成成功（固定模版模式）');
              } else {
                message.success('代码生成成功');
              }
            } else {
              message.error(result.error || '代码生成失败');
            }
            return;
          }
          if (event.type === 'error') {
            const failure = {
              success: false,
              error: event.content || 'Unknown error',
              score: 0,
              logs: [],
            } as unknown as WorkflowCodeResult;
            dispatchCodeGeneration({ type: 'SET_RESULT', payload: failure });
            message.error(`代码生成失败: ${event.content || 'Unknown error'}`);
          }
        }
      );
    } catch (error: any) {
      appendCodeGenerationLog(`错误: ${error.message || 'Unknown error'}`);
      dispatchCodeGeneration({
        type: 'SET_RESULT',
        payload: {
          success: false,
          error: error.message || 'Unknown error',
        },
      });
      message.error('代码生成失败: ' + (error.message || 'Unknown error'));
    }
  };

  const handleAiOptimizeHttpConfig = () => {
    if (
      selectedStepIndexForConfig === null ||
      !selectedStep ||
      !selectedStep.id ||
      !isHttpRequestActivity(selectedStepActivity, selectedStep)
    ) {
      return;
    }
    const userRequest = selectedStepAiPrompt.trim();
    if (!userRequest) {
      setHttpAiErrors((prev) => ({
        ...prev,
        [selectedStep.id as string]: '请先输入希望 AI 优化的自然语言目标',
      }));
      return;
    }
    setHttpAiErrors((prev) => {
      const next = { ...prev };
      delete next[selectedStep.id as string];
      return next;
    });
    optimizeHttpConfigMutation.mutate({
      stepIndex: selectedStepIndexForConfig,
      stepId: selectedStep.id,
      stepConfig: selectedStepHttpConfig,
      inputParams: collectWorkflowInputParams(),
      userRequest,
    });
  };

  const handleOpenHttpAiPanel = () => {
    if (
      !selectedStep ||
      !selectedStep.id ||
      !isHttpRequestActivity(selectedStepActivity, selectedStep)
    ) {
      return;
    }
    setActiveHttpAiStepId(selectedStep.id);
    setResourceSidebarCollapsed(true);
    setStepsSidebarCollapsed(true);
    setHttpAiSuggestedConfigs((prev) => {
      const next = { ...prev };
      delete next[selectedStep.id as string];
      return next;
    });
    setHttpAiSuggestedJsonDrafts((prev) => {
      const next = { ...prev };
      delete next[selectedStep.id as string];
      return next;
    });
    setHttpAiApplySummaries((prev) => {
      const next = { ...prev };
      delete next[selectedStep.id as string];
      return next;
    });
    setHttpAiExplanations((prev) => {
      const next = { ...prev };
      delete next[selectedStep.id as string];
      return next;
    });
    previewHttpConfigMutation.mutate({
      stepId: selectedStep.id,
      stepConfig: selectedStepHttpConfig,
      inputParams: collectWorkflowInputParams(),
    });
  };

  const handleApplyAiOptimizedHttpConfig = () => {
    if (selectedStepIndexForConfig === null || !selectedStep?.id) {
      return;
    }
    const suggestedDraft = httpAiSuggestedJsonDrafts[selectedStep.id];
    if (!suggestedDraft?.trim()) {
      setHttpAiErrors((prev) => ({
        ...prev,
        [selectedStep.id as string]: '请先生成 AI 优化建议',
      }));
      return;
    }
    let suggestedConfig: Record<string, unknown>;
    try {
      const parsedConfig: unknown = JSON.parse(suggestedDraft);
      if (!parsedConfig || typeof parsedConfig !== 'object' || Array.isArray(parsedConfig)) {
        throw new Error('AI 优化结果不是合法 JSON 对象');
      }
      suggestedConfig = parsedConfig as Record<string, unknown>;
    } catch (error: unknown) {
      setHttpAiErrors((prev) => ({
        ...prev,
        [selectedStep.id as string]: `AI 优化结果不是合法 JSON: ${resolveApiErrorMessage(error, '解析失败')}`,
      }));
      return;
    }
    const currentConfig = selectedStepHttpConfig as Record<string, unknown>;
    const changedKeys = Object.keys(suggestedConfig).filter(
      (key) => JSON.stringify(currentConfig[key]) !== JSON.stringify(suggestedConfig[key])
    );
    updateStepHttpRequestConfig(
      selectedStepIndexForConfig,
      suggestedConfig as Partial<HttpRequestStepConfig>
    );
    setHttpAiSuggestedConfigs((prev) => ({
      ...prev,
      [selectedStep.id as string]: suggestedConfig as Record<string, any>,
    }));
    setStepConfigActiveKeys(['activity-input', 'result-processing']);
    setHttpAiErrors((prev) => {
      const next = { ...prev };
      delete next[selectedStep.id as string];
      return next;
    });
    setHttpAiApplySummaries((prev) => ({
      ...prev,
      [selectedStep.id as string]:
        changedKeys.length > 0
          ? changedKeys.map((key) => `${key}: ${JSON.stringify(suggestedConfig[key])}`)
          : ['AI 建议与当前配置一致，没有产生新的字段变化'],
    }));
  };

  const handleOpenRealValidation = () => {
    if (!generatedCode) {
      void message.warning('请先生成并保存代码');
      return;
    }
    const inputParams = collectWorkflowInputParams();
    dispatchRealValidation({ type: 'OPEN', payload: inputParams });
  };

  const handleRealValidation = async () => {
    if (!generatedCode) {
      void message.warning('请先生成并保存代码');
      return;
    }
    if (isGeneratedCodeStale) {
      void message.warning('当前代码已落后于 DSL，请先重新生成并保存代码');
      return;
    }
    dispatchRealValidation({ type: 'START' });

    const inputParams: Record<string, string> = {};
    Object.entries(realValidationInputParams).forEach(([key, value]) => {
      const normalizedValue = normalizeValidationInputValue(value).trim();
      if (normalizedValue) {
        inputParams[key] = normalizedValue;
      }
    });
    try {
      let persistedWorkflow = editingWorkflow;
      if (!persistedWorkflow?.id) {
        appendRealValidationLog(
          `[${new Date().toISOString()}] 当前为未保存工作流，先持久化精确 DSL 与代码 artifact`
        );
        const persistenceData = await buildWorkflowPersistenceData();
        if (!persistenceData.generatedCode) {
          throw new Error('未找到可持久化的生成代码，无法绑定验证证据');
        }
        persistedWorkflow = await temporalWorkflowApi.create(persistenceData);
        setEditingWorkflow(persistedWorkflow);
        setGeneratedCode(persistedWorkflow.generatedCode || generatedCode);
        setLastGeneratedSignature(currentDraftSignature);
        setIsGeneratedCodeStale(false);
        appendRealValidationLog(
          `[${new Date().toISOString()}] artifact 已保存，ID=${persistedWorkflow.id}，开始持久化端到端验证`
        );
        void queryClient.invalidateQueries(['temporal']);
        void queryClient.invalidateQueries(['temporal-options']);
      } else {
        appendRealValidationLog(
          `[${new Date().toISOString()}] 开始校验已保存 Workflow artifact ${persistedWorkflow.id}`
        );
      }

      const persistedValidation = await temporalWorkflowApi.validateSavedArtifact(
        persistedWorkflow.id,
        { input: inputParams }
      );
      persistedValidation.validation.logs.forEach(appendRealValidationLog);
      dispatchRealValidation({
        type: 'SET_RESULT',
        payload: persistedValidation.validation,
      });
      setEditingWorkflow(persistedValidation.workflow);
      void queryClient.invalidateQueries(['temporal']);
    } catch (error: unknown) {
      const errorMessage = resolveApiErrorMessage(error, '真实验证启动失败');
      appendRealValidationLog(`错误: ${errorMessage}`);
      void message.error(errorMessage);
      dispatchRealValidation({
        type: 'SET_RESULT',
        payload: {
          success: false,
          logs: [],
          error: errorMessage,
          score: 0,
        },
      });
    }
  };

  const handleSave = async () => {
    if (saveSubmitting || loading) {
      return;
    }
    setSaveSubmitting(true);
    try {
      const data = await buildWorkflowPersistenceData();
      await Promise.resolve(onSave(data, editingWorkflow?.id));
    } catch (error: unknown) {
      void message.error(resolveApiErrorMessage(error, '表单校验失败'));
    } finally {
      setSaveSubmitting(false);
    }
  };

  return {
    validateMutation,
    optimizeHttpConfigMutation,
    previewHttpConfigMutation,
    collectWorkflowInputParams,
    handleValidate,
    handleGenerateCode,
    handleAiOptimizeHttpConfig,
    handleOpenHttpAiPanel,
    handleApplyAiOptimizedHttpConfig,
    handleOpenRealValidation,
    handleRealValidation,
    handleSave,
  };
};
