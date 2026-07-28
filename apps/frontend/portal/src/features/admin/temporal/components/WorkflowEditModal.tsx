import React, { useEffect, useMemo } from 'react';
import {
  Button,
  Space,
  Typography,
  Modal,
  message,
  Divider,
  Tooltip,
  Form,
} from 'antd';
import {
  ThunderboltOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';

import { useQuery } from 'react-query';
import '@/features/chat/ChatMessage.css';
import {
  temporalWorkflowApi,
  WorkflowDsl,
  DEFAULT_WORKFLOW_DSL,
  DEFAULT_ACTIVITY_DSL,
} from '@/api/temporal';
import { WorkflowValidationModals } from './WorkflowEdit/components/WorkflowValidationModals';
import { WorkflowExtraPromptCard } from './WorkflowEdit/components/WorkflowExtraPromptCard';
import { WorkflowOutputParamsCard } from './WorkflowEdit/components/WorkflowOutputParamsCard';
import { WorkflowEditTimelineSection } from './WorkflowEdit/components/WorkflowEditTimelineSection';
import { WorkflowHttpAiZoneCard } from './WorkflowEdit/components/WorkflowHttpAiZoneCard';
import { WorkflowRightConfigPanels } from './WorkflowEdit/components/WorkflowRightConfigPanels';
import { WorkflowAuxiliaryModals } from './WorkflowEdit/components/WorkflowAuxiliaryModals';
import { WorkflowModalFooter } from './WorkflowEdit/components/WorkflowModalFooter';
import { WorkflowMainForm } from './WorkflowEdit/components/WorkflowMainForm';
import {
  WorkflowStepDurationFieldEditor,
  WorkflowDurationFieldEditor,
} from './WorkflowEdit/components/WorkflowDurationEditors';
import { useActivityResources } from './WorkflowEdit/hooks/useActivityResources';
import { useWorkflowExecutionNav } from './WorkflowEdit/hooks/useWorkflowExecutionNav';
import { useWorkflowStepHandlers } from './WorkflowEdit/hooks/useWorkflowStepHandlers';
import { useWorkflowStepMutations } from './WorkflowEdit/hooks/useWorkflowStepMutations';
import { useWorkflowDraftTemplates, TemplateModalMode } from './WorkflowEdit/hooks/useWorkflowDraftTemplates';
import {
  renderDraftInputParamSummary,
  renderDraftOutputParamSummary,
  renderDraftContractCard,
  renderDraftStepSummary,
  buildDraftDiffSummary,
  renderDraftDiffSummary,
} from './WorkflowEdit/utils/workflowDraftRenderers';
import { useWorkflowSaveAndValidate } from './WorkflowEdit/hooks/useWorkflowSaveAndValidate';
import { useWorkflowStepEditors } from './WorkflowEdit/hooks/useWorkflowStepEditors';
import { WorkflowHttpTemplateMapEditor } from './WorkflowEdit/components/WorkflowHttpTemplateMapEditor';
import { WorkflowStructuredTransformMapEditor } from './WorkflowEdit/components/WorkflowStructuredTransformMapEditor';
import { useWorkflowEditState } from './WorkflowEdit/hooks/useWorkflowEditState';
import {
  SECTION_CARD_STYLE,
  SECTION_CARD_BODY_STYLE,
  SOFT_PANEL_STYLE,
  CONFIG_SECTION_STYLE,
  TWO_COLUMN_GRID_STYLE,
  COLLAPSED_SIDEBAR_WIDTH,
  RESOURCE_SIDEBAR_WIDTH,
  buildWorkflowDraftSignature,
  beautifyText,
  resolveApiErrorMessage,
  deriveWorkflowSourceTemplate,
  deriveWorkflowSourceContext,
  groupWorkflowInputParams,
  getStepInputPublicEntries,
  normalizeValidationInputValue,
  collectLeafPaths,
  unwrapValidationResultPayload,
  extractHttpPreviewBody,
  getStringRecordField,
  HttpRequestStepConfig,
  syncWorkflowInputParams,
  getStructuredTransformIssues,
  getActivityInputParams,
  isHttpRequestActivity,
  isStructuredTransformActivity,
  hydrateWorkflowDslForEditor,
} from './WorkflowEdit/utils/workflowEditHelpers';

const { Text } = Typography;
type StepDurationField = 'startToCloseTimeout' | 'scheduleToCloseTimeout' | 'heartbeatTimeout';
type WorkflowDurationField =
  | 'workflowExecutionTimeout'
  | 'workflowRunTimeout'
  | 'workflowTaskTimeout';




export const WorkflowEditModal: React.FC<WorkflowEditModalProps> = ({
  visible,
  onCancel,
  onSave,
  initialWorkflow,
  initialDraftDsl,
  loading,
  openTemplatePickerOnOpen = false,
  initialTemplatePickerMode = 'document',
}: WorkflowEditModalProps) => {


  useEffect(() => {
    if (!visible) {
      return;
    }

    let cancelled = false;

    const initialize = async () => {
      if (initialWorkflow) {
        setEditingWorkflow(initialWorkflow);
        didInitializeCodeSignatureRef.current = false;
        form.setFieldsValue({
          name: initialWorkflow.name,
          description: initialWorkflow.description,
          taskQueue: initialWorkflow.taskQueue,
        });
        const nextActivityDsl = initialWorkflow.activityDsl || DEFAULT_ACTIVITY_DSL;
        const nextWorkflowDsl = await hydrateWorkflowDslForEditor(
          initialWorkflow.workflowDsl || DEFAULT_WORKFLOW_DSL,
          nextActivityDsl
        );
        if (cancelled) {
          return;
        }
        setWorkflowDsl(nextWorkflowDsl);
        setActivityDsl(nextActivityDsl);
        setGeneratedCode(initialWorkflow.generatedCode || null);
        setLastGeneratedSignature(null);
        setIsGeneratedCodeStale(false);
        setSelectedStepIndexForConfig(nextWorkflowDsl?.steps?.length ? 0 : null);
        return;
      }

      if (initialDraftDsl) {
        setEditingWorkflow(null);
        didInitializeCodeSignatureRef.current = false;
        form.resetFields();
        // 与 applyDraftToEditor 保持一致：把草稿的 name/description/taskQueue 写入表单，
        // 否则只有 DSL 载入、表单字段为空。
        form.setFieldsValue({
          name: initialDraftDsl.name,
          description: initialDraftDsl.description,
          taskQueue: initialDraftDsl.taskQueue || 'SKILL_TASK_QUEUE',
        });
        const nextActivityDsl = initialDraftDsl.activityDsl || DEFAULT_ACTIVITY_DSL;
        const nextWorkflowDsl = await hydrateWorkflowDslForEditor(
          initialDraftDsl.workflowDsl || DEFAULT_WORKFLOW_DSL,
          nextActivityDsl
        );
        if (cancelled) {
          return;
        }
        setWorkflowDsl(nextWorkflowDsl);
        setActivityDsl(nextActivityDsl);
        setGeneratedCode(null);
        setLastGeneratedSignature(null);
        setIsGeneratedCodeStale(false);
        setSelectedStepIndexForConfig(nextWorkflowDsl?.steps?.length ? 0 : null);
        return;
      }

      setEditingWorkflow(null);
      didInitializeCodeSignatureRef.current = false;
      form.resetFields();
      setWorkflowDsl(DEFAULT_WORKFLOW_DSL);
      setActivityDsl(DEFAULT_ACTIVITY_DSL);
      setGeneratedCode(null);
      setLastGeneratedSignature(null);
      setIsGeneratedCodeStale(false);
      setSelectedStepIndexForConfig(null);
    };

    void initialize();

    return () => {
      cancelled = true;
    };
  }, [visible, initialWorkflow, initialDraftDsl]);

  // const { t } = useTranslation(['admin']);
  const {
    form,
    detailModalVisible,
    setDetailModalVisible,
    validateModalVisible,
    setValidateModalVisible,
    saveSubmitting,
    setSaveSubmitting,
    editingWorkflow,
    setEditingWorkflow,
    selectedWorkflow,
    validationResult,
    setValidationResult,
    workflowDsl,
    setWorkflowDsl,
    activityDsl,
    setActivityDsl,
    selectActivityModalVisible,
    setSelectActivityModalVisible,
    selectingStepIndex,
    setSelectingStepIndex,
    selectedStepIndexForConfig,
    setSelectedStepIndexForConfig,
    stepConfigActiveKeys,
    setStepConfigActiveKeys,
    httpAiOptimizePrompts,
    setHttpAiOptimizePrompts,
    httpAiPreviewResponses,
    setHttpAiPreviewResponses,
    httpAiSuggestedConfigs,
    setHttpAiSuggestedConfigs,
    httpAiSuggestedJsonDrafts,
    setHttpAiSuggestedJsonDrafts,
    httpAiExplanations,
    setHttpAiExplanations,
    httpAiErrors,
    setHttpAiErrors,
    httpAiApplySummaries,
    setHttpAiApplySummaries,
    httpAiSelectedLeafPaths,
    setHttpAiSelectedLeafPaths,
    httpAiLeafAliases,
    setHttpAiLeafAliases,
    activeHttpAiStepId,
    setActiveHttpAiStepId,
    resourceSidebarCollapsed,
    setResourceSidebarCollapsed,
    stepsSidebarCollapsed,
    setStepsSidebarCollapsed,
    generatedCode,
    setGeneratedCode,
    lastGeneratedSignature,
    setLastGeneratedSignature,
    isGeneratedCodeStale,
    setIsGeneratedCodeStale,
    forceAiGeneration,
    setForceAiGeneration,
    codeModalVisible,
    setCodeModalVisible,
    creatingExecutionWorkflowId,
    setCreatingExecutionWorkflowId,
    realValidationInputParams,
    setRealValidationInputParams,
    didInitializeCodeSignatureRef,
    realValidationState,
    dispatchRealValidation,
    codeGenerationState,
    dispatchCodeGeneration,
  } = useWorkflowEditState();
  const {
    aiDraftMessages,
    aiDraftInput,
    setAiDraftInput,
    currentAiDraft,
    aiDraftDescription,
    setAiDraftDescription,
    aiDraftReferenceUrl,
    setAiDraftReferenceUrl,
    skillFileName,
    setSkillFileContent,
    setSkillFileType,
    setSkillFileName,
    handleClearSkillFile,
    aiDraftDrawerVisible,
    setAiDraftDrawerVisible,

    applyDraftConfirmVisible,
    setApplyDraftConfirmVisible,
    handleResumeAiDraftSession,
    handleDeleteAiDraftSession,
    handleGenerateAiDraft,
    handleRefineAiDraft,
    handleApplyCurrentDraft,
    handleConfirmApplyCurrentDraft,
    generateAiDraftMutation,
    refineAiDraftMutation,
    deleteAiDraftSessionMutation,
    templateModalVisible,
    setTemplateModalVisible,
    templateModalMode,
    templates,
    templatesLoading,
    templateSearch,
    setTemplateSearch,
    generatingTemplateId,
    browserTemplates,
    browserTemplatesLoading,
    browserTemplateSearch,
    setBrowserTemplateSearch,
    generatingBrowserTemplateId,
    handleTemplateModeChange,
    handleSelectTemplate,
    handleSelectBrowserTemplate,
  } = useWorkflowDraftTemplates({
    visible,
    openTemplatePickerOnOpen,
    initialTemplatePickerMode,
    form,
    setEditingWorkflow,
    didInitializeCodeSignatureRef,
    setWorkflowDsl,
    setActivityDsl,
    setGeneratedCode,
    setLastGeneratedSignature,
    setIsGeneratedCodeStale,
    setSelectedStepIndexForConfig,
    hydrateWorkflowDslForEditor,
    setSaveSubmitting,
  });

  const watchedWorkflowName = Form.useWatch('name', form);
  const aiDraftSessionsQuery = useQuery(
    ['temporal-draft-sessions'],
    () => temporalWorkflowApi.listAiDraftSessions(),
    {
      enabled: aiDraftDrawerVisible,
      onError: (error: unknown) => {
        void message.error(`加载草稿会话失败: ${resolveApiErrorMessage(error, '未知错误')}`);
      },
    }
  );
  const { activityResources, resolveStepActivity } = useActivityResources(activityDsl);

  // 当真实验证弹窗打开时，同步输入参数到本地状态
  useEffect(() => {
    if (realValidationState.visible && Object.keys(realValidationState.inputParams).length > 0) {
      setRealValidationInputParams(
        Object.fromEntries(
          Object.entries(realValidationState.inputParams).map(([key, value]) => [
            key,
            normalizeValidationInputValue(value),
          ])
        )
      );
    }
  }, [realValidationState.visible]);



  const {
    getStepHttpRequestConfig,
    updateStepHttpRequestConfig,
    getStepStructuredTransformConfig,
    updateStepStructuredTransformConfig,
  } = useWorkflowStepHandlers(workflowDsl, setWorkflowDsl, setSelectedStepIndexForConfig);

  const updateHttpRequestTemplateMap = (
    index: number,
    field:
      | 'queryTemplate'
      | 'headersTemplate'
      | 'jsonTemplate'
      | 'dataTemplate'
      | 'responseFieldMappings',
    nextMap: Record<string, string>
  ) => {
    updateStepHttpRequestConfig(index, { [field]: nextMap } as Partial<HttpRequestStepConfig>);
  };

  const syncWorkflowInputParamsFromSteps = () => {
    setWorkflowDsl((prev) => syncWorkflowInputParams(prev, resolveStepActivity));
  };

  // 当选择步骤时，自动从Activity加载输入参数（如果步骤还没有参数）
  useEffect(() => {
    if (selectedStepIndexForConfig !== null && workflowDsl.steps[selectedStepIndexForConfig]) {
      const step = workflowDsl.steps[selectedStepIndexForConfig];
      if ((step.activityName || step.activityRef) && getStepInputPublicEntries(step).length === 0) {
        const activity = resolveStepActivity(step);
        const inputParams = activity ? getActivityInputParams(activity) : {};
        if (Object.keys(inputParams).length > 0) {
          handleUpdateStep(selectedStepIndexForConfig, 'input', {
            ...(step.input || {}),
            ...inputParams,
          });
        }
      }
    }
  }, [selectedStepIndexForConfig, workflowDsl.steps, activityResources]);

  useEffect(() => {
    if (workflowDsl.steps.length === 0) {
      if (selectedStepIndexForConfig !== null) {
        setSelectedStepIndexForConfig(null);
      }
      return;
    }
    if (
      selectedStepIndexForConfig === null ||
      selectedStepIndexForConfig >= workflowDsl.steps.length
    ) {
      setSelectedStepIndexForConfig(0);
    }
  }, [workflowDsl.steps.length, selectedStepIndexForConfig]);
  const currentDraftSignature = useMemo(
    () =>
      buildWorkflowDraftSignature(
        workflowDsl,
        activityDsl,
        watchedWorkflowName || workflowDsl.name
      ),
    [workflowDsl, activityDsl, watchedWorkflowName]
  );

  useEffect(() => {
    if (workflowDsl.steps.length > 0) {
      syncWorkflowInputParamsFromSteps();
    }
  }, [workflowDsl.steps, activityResources]);

  useEffect(() => {
    if (!generatedCode || !lastGeneratedSignature) {
      if (!generatedCode) {
        setIsGeneratedCodeStale(false);
      }
      return;
    }
    if (currentDraftSignature !== lastGeneratedSignature) {
      setGeneratedCode(null);
      setIsGeneratedCodeStale(true);
      return;
    }
    setIsGeneratedCodeStale(false);
  }, [currentDraftSignature, generatedCode, lastGeneratedSignature]);

  useEffect(() => {
    if (
      !visible ||
      !generatedCode ||
      lastGeneratedSignature ||
      didInitializeCodeSignatureRef.current
    ) {
      return;
    }
    didInitializeCodeSignatureRef.current = true;
    setLastGeneratedSignature(currentDraftSignature);
  }, [currentDraftSignature, visible, generatedCode, lastGeneratedSignature]);




  const { resolveWorkflowSourceSkillId, handleCreateExecutionFromWorkflow } =
    useWorkflowExecutionNav(
      selectedWorkflow,
      setCreatingExecutionWorkflowId,
      setDetailModalVisible
    );



  const groupedWorkflowInputParams = useMemo(
    () => groupWorkflowInputParams(workflowDsl.inputParams),
    [workflowDsl.inputParams]
  );



  const {
    handleAddStep,
    handleRemoveStep,
    handleUpdateStep,
    handleOpenActivitySelector,
    handleAddActivityFromPool,
    handleSelectActivity,
  } = useWorkflowStepMutations({
    setWorkflowDsl,
    setActivityDsl,
    selectingStepIndex,
    setSelectingStepIndex,
    setSelectActivityModalVisible,
    setSelectedStepIndexForConfig,
    getStepHttpRequestConfig,
    getStepStructuredTransformConfig,
  });

  const handleRegenerateCode = () => {
    dispatchRealValidation({ type: 'CLOSE' });
    setGeneratedCode(null);
    // Build error context from the last real validation result
    let errorContext: string | undefined;
    if (realValidationState.result) {
      const errors: string[] = [];
      if (realValidationState.result.error)
        errors.push(`验证错误: ${realValidationState.result.error}`);
      const validationExecutionError = getStringRecordField(
        realValidationState.result.result,
        'error'
      );
      const validationTraceback = getStringRecordField(
        realValidationState.result.result,
        'traceback'
      );
      if (validationExecutionError) errors.push(`执行错误: ${validationExecutionError}`);
      if (validationTraceback) errors.push(`堆栈: ${validationTraceback}`);
      if (realValidationState.logs.length > 0)
        errors.push(`日志:\n${realValidationState.logs.join('\n')}`);
      if (errors.length > 0) {
        errorContext = `上次真实验证失败，请修复以下问题:\n\n${errors.join('\n\n')}`;
      }
    }
    handleGenerateCode(errorContext);
  };

  const realValidationModalFooter =
    realValidationState.result && !realValidationState.result.success
      ? [
          <Button key="close" onClick={() => dispatchRealValidation({ type: 'CLOSE' })}>
            关闭
          </Button>,
          <Button key="regenerate" type="primary" onClick={handleRegenerateCode}>
            重新生成代码
          </Button>,
        ]
      : [
          <Button key="close" onClick={() => dispatchRealValidation({ type: 'CLOSE' })}>
            关闭
          </Button>,
        ];

  const renderTipLabel = (label: string, tip: string) => (
    <Space size={4}>
      <span>{label}</span>
      <Tooltip title={tip}>
        <InfoCircleOutlined style={{ color: 'var(--text-light)' }} />
      </Tooltip>
    </Space>
  );

  const renderStepDurationField = (
    field: StepDurationField,
    label: string,
    tip: string,
    options?: { canDisable?: boolean }
  ) => (
    <WorkflowStepDurationFieldEditor
      field={field}
      label={label}
      tip={tip}
      options={options}
      selectedStepIndexForConfig={selectedStepIndexForConfig}
      workflowDsl={workflowDsl}
      handleUpdateStep={handleUpdateStep}
      resolveStepActivity={resolveStepActivity}
      renderTipLabel={renderTipLabel}
    />
  );

  const renderWorkflowDurationField = (
    field: WorkflowDurationField,
    label: string,
    tip: string,
    enabled: boolean,
    defaultValue: string
  ) => (
    <WorkflowDurationFieldEditor
      field={field}
      label={label}
      tip={tip}
      enabled={enabled}
      defaultValue={defaultValue}
      workflowDsl={workflowDsl}
      setWorkflowDsl={setWorkflowDsl}
      renderTipLabel={renderTipLabel}
    />
  );

  const shorten = (text?: string, max = 24) => {
    if (!text) {
      return '-';
    }
    return text.length > max ? `${text.slice(0, max)}...` : text;
  };
  const getActivitySourceMeta = (step?: WorkflowDsl['steps'][number]) => {
    const resolved = resolveStepActivity(step);
    const isBuiltin = step?.activityRef?.startsWith('builtin:') || resolved?.source === 'builtin';
    return {
      label: isBuiltin ? '内置' : '自定义',
      color: isBuiltin ? 'gold' : 'blue',
      ref: step?.activityRef || resolved?.ref || '-',
      name: resolved?.name || step?.activityName || '-',
    };
  };
  const selectedStep =
    selectedStepIndexForConfig !== null ? workflowDsl.steps[selectedStepIndexForConfig] : undefined;
  const selectedStepActivity = resolveStepActivity(selectedStep);
  const selectedStepHttpConfig = getStepHttpRequestConfig(selectedStep, selectedStepActivity);
  const selectedStepStructuredTransformConfig = getStepStructuredTransformConfig(
    selectedStep,
    selectedStepActivity
  );
  const selectedStepAiPrompt = selectedStep?.id ? httpAiOptimizePrompts[selectedStep.id] || '' : '';
  const selectedStepAiPreview = selectedStep?.id
    ? httpAiPreviewResponses[selectedStep.id]
    : undefined;

  const selectedStepAiSuggestedConfig = selectedStep?.id
    ? httpAiSuggestedConfigs[selectedStep.id]
    : undefined;
  const selectedStepAiSuggestedJsonDraft = selectedStep?.id
    ? httpAiSuggestedJsonDrafts[selectedStep.id] || ''
    : '';
  const selectedStepAiExplanation = selectedStep?.id ? httpAiExplanations[selectedStep.id] : '';
  const selectedStepAiError = selectedStep?.id ? httpAiErrors[selectedStep.id] : '';
  const selectedStepAiApplySummary = selectedStep?.id
    ? httpAiApplySummaries[selectedStep.id] || []
    : [];
  const selectedStepAiSelectedLeafPaths = selectedStep?.id
    ? httpAiSelectedLeafPaths[selectedStep.id] || []
    : [];
  const selectedStepAiLeafAliases = selectedStep?.id
    ? httpAiLeafAliases[selectedStep.id] || {}
    : {};
  const selectedStructuredTransformIssues = useMemo(
    () =>
      getStructuredTransformIssues(
        selectedStep,
        selectedStepActivity,
        selectedStepIndexForConfig,
        selectedStepStructuredTransformConfig,
        workflowDsl.steps,
        resolveStepActivity
      ),
    [
      selectedStep,
      selectedStepActivity,
      selectedStepIndexForConfig,
      selectedStepStructuredTransformConfig,
      workflowDsl.steps,
    ]
  );
  const showDedicatedHttpAiZone = Boolean(
    selectedStep?.id &&
    activeHttpAiStepId === selectedStep.id &&
    isHttpRequestActivity(selectedStepActivity, selectedStep)
  );
  const realValidationRawResult = useMemo(
    () => unwrapValidationResultPayload(realValidationState.result?.result),
    [realValidationState.result?.result]
  );
  const realValidationLeafSource = useMemo(
    () => extractHttpPreviewBody(realValidationRawResult),
    [realValidationRawResult]
  );
  const realValidationLeafPaths = useMemo(
    () => collectLeafPaths(realValidationLeafSource),
    [realValidationLeafSource]
  );
  const {
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
  } = useWorkflowSaveAndValidate({
    form,
    workflowDsl,
    activityDsl,
    editingWorkflow,
    setEditingWorkflow,
    generatedCode,
    setGeneratedCode,
    lastGeneratedSignature,
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
  });
  const aiOptimizeLeafSource = useMemo(
    () => extractHttpPreviewBody(selectedStepAiPreview),
    [selectedStepAiPreview]
  );
  const aiOptimizeLeafPaths = useMemo(
    () => collectLeafPaths(aiOptimizeLeafSource),
    [aiOptimizeLeafSource]
  );
  const {
    setStructuredTransformSchemaDrafts,
    selectedStructuredTransformSchemaDraft,
    selectedStructuredTransformSchemaError,
    updateStructuredTransformSchemaDraft,
    applySuggestedResponsePath,
    buildOutputKeyFromPath,
    toggleAiLeafPathSelection,
    updateAiLeafAlias,
    handleGenerateMultiFieldOutputParams,
  } = useWorkflowStepEditors({
    selectedStep,
    selectedStepIndexForConfig,
    selectedStepHttpConfig,
    selectedStepStructuredTransformConfig,
    updateStepHttpRequestConfig,
    updateStepStructuredTransformConfig,
    setWorkflowDsl,
    setHttpAiSelectedLeafPaths,
    setHttpAiLeafAliases,
    setHttpAiErrors,
    setHttpAiSuggestedJsonDrafts,
    setHttpAiApplySummaries,
    selectedStepAiSelectedLeafPaths,
    selectedStepAiLeafAliases,
  });

  const renderHttpTemplateMapEditor = (
    field:
      | 'queryTemplate'
      | 'headersTemplate'
      | 'jsonTemplate'
      | 'dataTemplate'
      | 'responseFieldMappings',
    label: string,
    tip: string
  ) => (
    <WorkflowHttpTemplateMapEditor
      selectedStepIndexForConfig={selectedStepIndexForConfig}
      selectedStepHttpConfig={selectedStepHttpConfig}
      field={field}
      label={label}
      tip={tip}
      renderTipLabel={renderTipLabel}
      updateHttpRequestTemplateMap={updateHttpRequestTemplateMap}
    />
  );

  const renderStructuredTransformMapEditor = (label: string, tip: string) => (
    <WorkflowStructuredTransformMapEditor
      selectedStepIndexForConfig={selectedStepIndexForConfig}
      selectedStepStructuredTransformConfig={selectedStepStructuredTransformConfig}
      label={label}
      tip={tip}
      renderTipLabel={renderTipLabel}
      updateStepStructuredTransformConfig={updateStepStructuredTransformConfig}
    />
  );
  const currentWorkflowDisplayName = (workflowDsl.workflowDefnName ||
    form.getFieldValue('name') ||
    workflowDsl.name ||
    '未命名工作流') as string;
  const currentWorkflowClassName = (workflowDsl.workflowClassName ||
    `${((form.getFieldValue('name') || workflowDsl.name || 'Custom') as string).replace(/\s+/g, '')}Workflow`) as string;
  const currentSourceTemplate = useMemo(
    () => editingWorkflow?.sourceTemplate || deriveWorkflowSourceTemplate(workflowDsl, activityDsl),
    [editingWorkflow?.id, editingWorkflow?.sourceTemplate, workflowDsl, activityDsl]
  );
  const currentSourceContext = useMemo(
    () => editingWorkflow?.sourceContext || deriveWorkflowSourceContext(workflowDsl, activityDsl),
    [editingWorkflow?.id, editingWorkflow?.sourceContext, workflowDsl, activityDsl]
  );


  const latestDraftMessageIndex = useMemo(() => {
    for (let index = aiDraftMessages.length - 1; index >= 0; index -= 1) {
      if (aiDraftMessages[index]?.draft) {
        return index;
      }
    }
    return -1;
  }, [aiDraftMessages]);

  const previousDraftForCurrent = useMemo(() => {
    if (!currentAiDraft || latestDraftMessageIndex <= 0) {
      return undefined;
    }
    for (let index = latestDraftMessageIndex - 1; index >= 0; index -= 1) {
      if (aiDraftMessages[index]?.draft) {
        return aiDraftMessages[index].draft;
      }
    }
    return undefined;
  }, [aiDraftMessages, currentAiDraft, latestDraftMessageIndex]);

  const currentDraftApplyDiff = useMemo(
    () => (currentAiDraft ? buildDraftDiffSummary(currentAiDraft, previousDraftForCurrent) : null),
    [currentAiDraft, previousDraftForCurrent]
  );

  return (
    <>
      <WorkflowAuxiliaryModals
        selectActivityModalVisible={selectActivityModalVisible}
        setSelectActivityModalVisible={setSelectActivityModalVisible}
        setSelectingStepIndex={setSelectingStepIndex}
        activityResources={activityResources}
        handleSelectActivity={handleSelectActivity}
        templateModalVisible={templateModalVisible}
        setTemplateModalVisible={setTemplateModalVisible}
        templateModalMode={templateModalMode}
        handleTemplateModeChange={handleTemplateModeChange}
        templateSearch={templateSearch}
        setTemplateSearch={setTemplateSearch}
        templatesLoading={templatesLoading}
        generatingTemplateId={generatingTemplateId}
        templates={templates}
        handleSelectTemplate={handleSelectTemplate}
        browserTemplateSearch={browserTemplateSearch}
        setBrowserTemplateSearch={setBrowserTemplateSearch}
        browserTemplatesLoading={browserTemplatesLoading}
        generatingBrowserTemplateId={generatingBrowserTemplateId}
        browserTemplates={browserTemplates}
        handleSelectBrowserTemplate={handleSelectBrowserTemplate}
        aiDraftDrawerVisible={aiDraftDrawerVisible}
        setAiDraftDrawerVisible={setAiDraftDrawerVisible}
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
        generateAiDraftMutationLoading={generateAiDraftMutation.isLoading}

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
        refineAiDraftMutationLoading={refineAiDraftMutation.isLoading}
        aiDraftInput={aiDraftInput}
        setAiDraftInput={setAiDraftInput}
        handleRefineAiDraft={handleRefineAiDraft}
        applyDraftConfirmVisible={applyDraftConfirmVisible}
        setApplyDraftConfirmVisible={setApplyDraftConfirmVisible}
        handleConfirmApplyCurrentDraft={handleConfirmApplyCurrentDraft}
        currentDraftApplyDiff={currentDraftApplyDiff}
        SECTION_CARD_STYLE={SECTION_CARD_STYLE}
        detailModalVisible={detailModalVisible}
        setDetailModalVisible={setDetailModalVisible}
        selectedWorkflow={selectedWorkflow}
        resolveWorkflowSourceSkillId={resolveWorkflowSourceSkillId}
        handleCreateExecutionFromWorkflow={handleCreateExecutionFromWorkflow}
        creatingExecutionWorkflowId={creatingExecutionWorkflowId}
        getActivitySourceMeta={getActivitySourceMeta}
      />
      <Modal
        title={
          <div style={{ textAlign: 'center', width: '100%' }}>
            <Space direction="vertical" size={2}>
              <Space size={8}>
                <ThunderboltOutlined style={{ color: 'var(--primary-color)' }} />
                <Text strong style={{ fontSize: 18 }}>
                  {editingWorkflow ? '编辑工作流' : '创建工作流'}
                </Text>
              </Space>
              <Text type="secondary" style={{ fontSize: 12 }}>
                配置工作流基础信息、执行参数、步骤编排与 artifact 生成验证
              </Text>
            </Space>
          </div>
        }
        open={visible}
        onOk={handleSave}
        onCancel={() => onCancel(false)}
        footer={
          <WorkflowModalFooter
            forceAiGeneration={forceAiGeneration}
            setForceAiGeneration={setForceAiGeneration}
            isStreamingCode={codeGenerationState.isStreaming}
            handleValidate={handleValidate}
            handleGenerateCode={handleGenerateCode}
            handleOpenRealValidation={handleOpenRealValidation}
            isStreamingRealValidation={realValidationState.isStreaming}
            generatedCode={generatedCode}
            setCodeModalVisible={setCodeModalVisible}
            onCancel={onCancel}
            loading={loading}
            saveSubmitting={saveSubmitting}
            handleSave={handleSave}
          />
        }
        width={1200}
        style={{ top: 20 }}
      >
        <WorkflowMainForm
          form={form}
          isGeneratedCodeStale={isGeneratedCodeStale}
          currentSourceContext={currentSourceContext}
          currentSourceTemplate={currentSourceTemplate}
          workflowDsl={workflowDsl}
          setWorkflowDsl={setWorkflowDsl}
          SECTION_CARD_STYLE={SECTION_CARD_STYLE}
          SECTION_CARD_BODY_STYLE={SECTION_CARD_BODY_STYLE}
          SOFT_PANEL_STYLE={SOFT_PANEL_STYLE}
          renderTipLabel={renderTipLabel}
          renderWorkflowDurationField={renderWorkflowDurationField}
          groupedWorkflowInputParams={groupedWorkflowInputParams}
        />

        <Divider style={{ margin: '20px 0 16px' }}>
          <Text strong>工作流配置</Text>
        </Divider>

        <WorkflowEditTimelineSection
          resourceSidebarCollapsed={resourceSidebarCollapsed}
          setResourceSidebarCollapsed={setResourceSidebarCollapsed}
          RESOURCE_SIDEBAR_WIDTH={RESOURCE_SIDEBAR_WIDTH}
          COLLAPSED_SIDEBAR_WIDTH={COLLAPSED_SIDEBAR_WIDTH}
          SECTION_CARD_STYLE={SECTION_CARD_STYLE}
          stepsSidebarCollapsed={stepsSidebarCollapsed}
          setStepsSidebarCollapsed={setStepsSidebarCollapsed}
          handleAddStep={handleAddStep}
          activityResources={activityResources}
          handleAddActivityFromPool={handleAddActivityFromPool}
          workflowDsl={workflowDsl}
          selectedStepIndexForConfig={selectedStepIndexForConfig}
          setSelectedStepIndexForConfig={setSelectedStepIndexForConfig}
          syncWorkflowInputParamsFromSteps={syncWorkflowInputParamsFromSteps}
          handleUpdateStep={handleUpdateStep}
          handleRemoveStep={handleRemoveStep}
          resolveStepActivity={resolveStepActivity}
          isStructuredTransformActivity={isStructuredTransformActivity}
          handleOpenActivitySelector={handleOpenActivitySelector}
        >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: showDedicatedHttpAiZone
                  ? 'minmax(0, 1.2fr) minmax(360px, 0.8fr)'
                  : 'minmax(0, 1fr)',
                gap: 12,
                alignItems: 'start',
              }}
            >
              <WorkflowRightConfigPanels
                selectedStepIndexForConfig={selectedStepIndexForConfig}
                selectedStep={selectedStep}
                stepConfigActiveKeys={stepConfigActiveKeys}
                setStepConfigActiveKeys={setStepConfigActiveKeys}
                renderTipLabel={renderTipLabel}
                renderStepDurationField={renderStepDurationField}
                SECTION_CARD_STYLE={SECTION_CARD_STYLE}
                TWO_COLUMN_GRID_STYLE={TWO_COLUMN_GRID_STYLE}
                CONFIG_SECTION_STYLE={CONFIG_SECTION_STYLE}
                selectedStepActivity={selectedStepActivity}
                isHttpRequestActivity={isHttpRequestActivity}
                selectedStepHttpConfig={selectedStepHttpConfig}
                updateStepHttpRequestConfig={updateStepHttpRequestConfig}
                renderHttpTemplateMapEditor={renderHttpTemplateMapEditor}
                previewHttpConfigMutation={previewHttpConfigMutation}
                handleOpenHttpAiPanel={handleOpenHttpAiPanel}
                realValidationLeafPaths={realValidationLeafPaths}
                applySuggestedResponsePath={applySuggestedResponsePath}
                isStructuredTransformActivity={isStructuredTransformActivity}
                selectedStepStructuredTransformConfig={selectedStepStructuredTransformConfig}
                updateStepStructuredTransformConfig={updateStepStructuredTransformConfig}
                workflowDsl={workflowDsl}
                resolveStepActivity={resolveStepActivity}
                collectWorkflowInputParams={collectWorkflowInputParams}
                selectedStepAiPrompt={selectedStepAiPrompt}
                setStructuredTransformSchemaDrafts={setStructuredTransformSchemaDrafts}
                renderStructuredTransformMapEditor={renderStructuredTransformMapEditor}
                selectedStructuredTransformIssues={selectedStructuredTransformIssues}
                selectedStructuredTransformSchemaDraft={selectedStructuredTransformSchemaDraft}
                updateStructuredTransformSchemaDraft={updateStructuredTransformSchemaDraft}
                selectedStructuredTransformSchemaError={selectedStructuredTransformSchemaError}
                activityDsl={activityDsl}
                getActivitySourceMeta={getActivitySourceMeta}
                getStepStructuredTransformConfig={getStepStructuredTransformConfig}
                getStepHttpRequestConfig={getStepHttpRequestConfig}
                shorten={shorten}
                handleUpdateStep={handleUpdateStep}
              />

              {showDedicatedHttpAiZone && (
                <WorkflowHttpAiZoneCard
                  selectedStep={selectedStep}
                  previewHttpConfigMutation={previewHttpConfigMutation}
                  handlePreviewHttpConfig={handleOpenHttpAiPanel}
                  selectedStepAiPreviewResponse={selectedStepAiPreview}
                  selectedStepAiLeafPaths={aiOptimizeLeafPaths}
                  selectedStepAiSelectedLeafPaths={selectedStepAiSelectedLeafPaths}
                  toggleAiLeafPathSelection={toggleAiLeafPathSelection}
                  selectedStepAiLeafAliases={selectedStepAiLeafAliases}
                  buildOutputKeyFromPath={buildOutputKeyFromPath}
                  updateAiLeafAlias={updateAiLeafAlias}
                  handleGenerateMultiFieldOutputParams={handleGenerateMultiFieldOutputParams}
                  selectedStepAiPrompt={selectedStepAiPrompt}
                  setHttpAiOptimizePrompts={setHttpAiOptimizePrompts}
                  selectedStepAiError={selectedStepAiError}
                  optimizeHttpConfigMutation={optimizeHttpConfigMutation}
                  handleAiOptimizeHttpConfig={handleAiOptimizeHttpConfig}
                  handleApplyAiOptimizedHttpConfig={handleApplyAiOptimizedHttpConfig}
                  selectedStepAiSuggestedConfig={selectedStepAiSuggestedConfig}
                  selectedStepAiExplanation={selectedStepAiExplanation}
                  selectedStepAiSuggestedJsonDraft={selectedStepAiSuggestedJsonDraft}
                  setHttpAiSuggestedJsonDrafts={setHttpAiSuggestedJsonDrafts}
                  selectedStepAiApplySummary={selectedStepAiApplySummary}
                  SECTION_CARD_STYLE={SECTION_CARD_STYLE}
                  SECTION_CARD_BODY_STYLE={SECTION_CARD_BODY_STYLE}
                  CONFIG_SECTION_STYLE={CONFIG_SECTION_STYLE}
                />
              )}
            </div>
        </WorkflowEditTimelineSection>

        <WorkflowOutputParamsCard
          workflowDsl={workflowDsl}
          setWorkflowDsl={setWorkflowDsl}
          realValidationLeafPaths={realValidationLeafPaths}
          SECTION_CARD_STYLE={SECTION_CARD_STYLE}
          SECTION_CARD_BODY_STYLE={SECTION_CARD_BODY_STYLE}
          SOFT_PANEL_STYLE={SOFT_PANEL_STYLE}
        />

        <WorkflowExtraPromptCard
          workflowDsl={workflowDsl}
          setWorkflowDsl={setWorkflowDsl}
          SECTION_CARD_STYLE={SECTION_CARD_STYLE}
          SECTION_CARD_BODY_STYLE={SECTION_CARD_BODY_STYLE}
          renderTipLabel={renderTipLabel}
        />
      </Modal>
      <WorkflowValidationModals
        validateModalVisible={validateModalVisible}
        onCloseValidateModal={() => setValidateModalVisible(false)}
        validationResult={validationResult}
        codeModalVisible={codeModalVisible}
        onCloseCodeModal={() => setCodeModalVisible(false)}
        currentWorkflowDisplayName={currentWorkflowDisplayName}
        currentWorkflowClassName={currentWorkflowClassName}
        generatedCode={generatedCode}
        realValidationState={realValidationState}
        onCloseRealValidation={() => dispatchRealValidation({ type: 'CLOSE' })}
        realValidationModalFooter={realValidationModalFooter}
        realValidationInputParams={realValidationInputParams}
        setRealValidationInputParams={setRealValidationInputParams}
        onStartRealValidation={() => {
          void handleRealValidation();
        }}
        realValidationRawResult={realValidationRawResult}
        realValidationLeafPaths={realValidationLeafPaths}
        onApplySuggestedResponsePath={applySuggestedResponsePath}
      />
    </>
  );
};

export interface WorkflowEditModalProps {
  visible: boolean;
  onCancel: (saved?: boolean) => void;
  onSave: (data: any) => void;
  initialWorkflow?: any | null;
  initialDraftDsl?: any | null;
  loading?: boolean;
  openTemplatePickerOnOpen?: boolean;
  initialTemplatePickerMode?: TemplateModalMode;
}
