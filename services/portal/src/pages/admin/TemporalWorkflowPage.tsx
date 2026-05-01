import React, { useEffect, useMemo, useReducer, useState } from 'react';
import {
  Table, Card, Button, Input, Space, Tag, Typography, Modal, message, Form, Select,
  Divider, Alert, Collapse, Badge, Popconfirm, Row, Col, Timeline, Switch, Tooltip, InputNumber, Segmented
} from 'antd';
import {
  SearchOutlined, PlusOutlined, EditOutlined, DeleteOutlined, PlayCircleOutlined,
  ReloadOutlined, CodeOutlined, ApiOutlined, ThunderboltOutlined,
  RocketOutlined, CheckCircleOutlined, RobotOutlined, ExperimentOutlined, InfoCircleOutlined
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  temporalWorkflowApi, TemporalWorkflowDTO, CreateTemporalWorkflowDTO,
  WorkflowDsl, ActivityDsl, TemporalValidationResult, DEFAULT_WORKFLOW_DSL, DEFAULT_ACTIVITY_DSL,
  WorkflowCodeResult, WorkflowRealValidationResult, TemplateWorkflowDraft, TemporalWorkflowSourceTemplate
} from '../../api/temporal-workflow';
import { carboneAPI, CarboneTemplate } from '../../api/carbone';
import { activityApi, ActivityDTO } from '../../api/activity';
import { normalizeExecutionResult } from '../../api/execution-normalizer';
import { ListSectionHeader, OverviewStatGrid, PageTitleBlock } from '../../components/page/PageScaffold';
import type { ColumnsType } from 'antd/es/table';

const { Text } = Typography;
const { Option } = Select;
const { Panel } = Collapse;
const MAX_LOG_LINES = 1000;
type DurationUnit = 's' | 'm' | 'h';
type StepDurationField = 'startToCloseTimeout' | 'scheduleToCloseTimeout' | 'heartbeatTimeout';
type WorkflowDurationField = 'workflowExecutionTimeout' | 'workflowRunTimeout' | 'workflowTaskTimeout';
const DEFAULT_DURATION_UNIT: DurationUnit = 's';
const DURATION_UNIT_OPTIONS = [
  { label: 'S', value: 's' },
  { label: 'M', value: 'm' },
  { label: 'H', value: 'h' },
];

const SECTION_CARD_STYLE: React.CSSProperties = {
  borderRadius: 14,
  border: '1px solid var(--bg-secondary)',
  boxShadow: 'var(--shadow-md)',
};

const SECTION_CARD_BODY_STYLE: React.CSSProperties = {
  padding: 14,
};

const SOFT_PANEL_STYLE: React.CSSProperties = {
  border: '1px solid var(--bg-secondary)',
  padding: 12,
  borderRadius: 10,
  background: 'var(--bg-card)',
};

const DURATION_INPUT_WIDTH = 64;
const DURATION_SEGMENTED_WIDTH = 78;

const parseDurationValue = (duration?: string): { value?: number; unit: DurationUnit } => {
  if (!duration) {
    return { value: undefined, unit: DEFAULT_DURATION_UNIT };
  }
  const trimmed = duration.trim();
  const explicitMatch = trimmed.match(/^(\d+)\s*([smh])$/i);
  if (explicitMatch) {
    return {
      value: Number(explicitMatch[1]),
      unit: explicitMatch[2].toLowerCase() as DurationUnit,
    };
  }
  const numberOnly = trimmed.match(/^(\d+)$/);
  if (numberOnly) {
    return {
      value: Number(numberOnly[1]),
      unit: DEFAULT_DURATION_UNIT,
    };
  }
  return { value: undefined, unit: DEFAULT_DURATION_UNIT };
};

const formatDurationValue = (value?: number | null, unit: DurationUnit = DEFAULT_DURATION_UNIT): string | undefined => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return undefined;
  }
  return `${Math.max(0, Number(value))}${unit}`;
};

const deriveWorkflowSourceTemplate = (
  workflowDsl?: WorkflowDsl | null,
  activityDsl?: ActivityDsl | null,
): TemporalWorkflowSourceTemplate | null => {
  const workflowDslRecord = workflowDsl as unknown as Record<string, unknown> | undefined;
  const workflowSource = workflowDslRecord && typeof workflowDslRecord.sourceTemplate === 'object'
    ? (workflowDsl as unknown as { sourceTemplate?: TemporalWorkflowSourceTemplate }).sourceTemplate
    : undefined;
  const activities = Array.isArray(activityDsl?.activities) ? activityDsl.activities : [];
  const carboneActivity = activities.find((activity) => {
    if (activity?.handler === 'carbone') {
      return true;
    }
    const steps = Array.isArray(activity?.config?.steps) ? activity.config.steps : [];
    return steps.some((step: Record<string, any>) => step?.type === 'carbone');
  });
  const carboneStep = Array.isArray(carboneActivity?.config?.steps)
    ? carboneActivity?.config?.steps.find((step: Record<string, any>) => step?.type === 'carbone')
    : null;
  const sourceTemplate: TemporalWorkflowSourceTemplate = {
    templateId: workflowSource?.templateId || carboneStep?.config?.templateId || carboneActivity?.config?.templateId,
    skillId: workflowSource?.skillId || carboneActivity?.config?.skillId || undefined,
    fileName: workflowSource?.fileName || carboneActivity?.config?.fileName || undefined,
    format: workflowSource?.format || carboneStep?.config?.format || carboneActivity?.config?.format || undefined,
    variableCount: workflowSource?.variableCount || carboneActivity?.config?.variableCount || Object.keys(workflowDsl?.inputParams || {}).length || undefined,
  };
  if (!sourceTemplate.templateId && !sourceTemplate.skillId && !sourceTemplate.fileName) {
    return null;
  }
  return sourceTemplate;
};

interface RealValidationState {
  visible: boolean;
  isStreaming: boolean;
  logs: string[];
  result: WorkflowRealValidationResult | null;
  inputParams: Record<string, string>; // 用户输入的参数值
}

type RealValidationAction =
  | { type: 'START' }
  | { type: 'OPEN'; payload?: Record<string, string> }
  | { type: 'APPEND_LOG'; payload: string }
  | { type: 'SET_RESULT'; payload: WorkflowRealValidationResult }
  | { type: 'SET_INPUT_PARAMS'; payload: Record<string, string> }
  | { type: 'CLOSE' };

const initialRealValidationState: RealValidationState = {
  visible: false,
  isStreaming: false,
  logs: [],
  result: null,
  inputParams: {},
};

const realValidationReducer = (state: RealValidationState, action: RealValidationAction): RealValidationState => {
  switch (action.type) {
    case 'START':
      return {
        ...state,
        visible: true,
        isStreaming: true,
        logs: [],
        result: null,
      };
    case 'OPEN':
      return {
        ...state,
        visible: true,
        inputParams: action.payload || {},
      };
    case 'APPEND_LOG':
      return {
        ...state,
        logs: [...state.logs.slice(-(MAX_LOG_LINES - 1)), action.payload],
      };
    case 'SET_RESULT':
      return {
        ...state,
        isStreaming: false,
        result: action.payload,
      };
    case 'SET_INPUT_PARAMS':
      return {
        ...state,
        inputParams: action.payload,
      };
    case 'CLOSE':
      return {
        ...initialRealValidationState,
      };
    default:
      return state;
  }
};

const TemporalWorkflowPage: React.FC = () => {
  const { t } = useTranslation(['common', 'admin']);
  const queryClient = useQueryClient();
  const [form] = Form.useForm();

  const [searchText, setSearchText] = useState('');
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [validateModalVisible, setValidateModalVisible] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<TemporalWorkflowDTO | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<TemporalWorkflowDTO | null>(null);
  const [validationResult, setValidationResult] = useState<TemporalValidationResult | null>(null);
  const [workflowDsl, setWorkflowDsl] = useState<WorkflowDsl>(DEFAULT_WORKFLOW_DSL);
  const [activityDsl, setActivityDsl] = useState<ActivityDsl>(DEFAULT_ACTIVITY_DSL);
  const [selectActivityModalVisible, setSelectActivityModalVisible] = useState(false);
  const [selectingStepIndex, setSelectingStepIndex] = useState<number | null>(null);
  const [selectedStepIndexForConfig, setSelectedStepIndexForConfig] = useState<number | null>(null);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [codeModalVisible, setCodeModalVisible] = useState(false);
  const [realValidationState, dispatchRealValidation] = useReducer(realValidationReducer, initialRealValidationState);
  const [realValidationInputParams, setRealValidationInputParams] = useState<Record<string, string>>({}); // 真实验证时的输入参数
  const [templateModalVisible, setTemplateModalVisible] = useState(false);
  const [templates, setTemplates] = useState<CarboneTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');
  const [generatingTemplateId, setGeneratingTemplateId] = useState<string | null>(null);

  // 当真实验证弹窗打开时，同步输入参数到本地状态
  useEffect(() => {
    if (realValidationState.visible && Object.keys(realValidationState.inputParams).length > 0) {
      setRealValidationInputParams({ ...realValidationState.inputParams });
    }
  }, [realValidationState.visible]);

  const normalizeActivityInputParams = (
    inputParams: unknown
  ): Array<{ key: string; value: string; required: boolean }> => {
    if (!inputParams) {
      return [];
    }
    if (Array.isArray(inputParams)) {
      return inputParams.map((item: any) => ({
        key: item?.key || '',
        value: item?.value || '',
        required: Boolean(item?.required),
      }));
    }
    if (typeof inputParams === 'object') {
      return Object.entries(inputParams as Record<string, any>).map(([key, value]) => ({
        key,
        value: value || '',
        required: !value,
      }));
    }
    return [];
  };

  // 从Activity的config中提取inputParams (存储在config.steps[].inputParams中)
  const getActivityInputParams = (activity: ActivityDTO): Record<string, string> => {
    const params: Record<string, string> = {};
    try {
      const config = activity.config as Record<string, any>;
      if (config?.steps && Array.isArray(config.steps) && config.steps.length > 0) {
        normalizeActivityInputParams(config.steps[0]?.inputParams).forEach((param) => {
          if (param.key.trim()) {
            params[param.key] = param.value || '';
          }
        });
      }
    } catch (e) {
      // ignore
    }
    return params;
  };

  const getActivityInputParamDefinitions = (activity?: ActivityDTO): Record<string, { description?: string; required?: boolean; defaultValue?: string }> => {
    const definitions: Record<string, { description?: string; required?: boolean; defaultValue?: string }> = {};
    if (!activity) {
      return definitions;
    }
    try {
      const config = activity.config as Record<string, any>;
      if (config?.steps && Array.isArray(config.steps) && config.steps.length > 0) {
        normalizeActivityInputParams(config.steps[0]?.inputParams).forEach((param) => {
          if (param.key.trim()) {
            definitions[param.key] = {
              description: '',
              required: param.required,
              defaultValue: param.value || '',
            };
          }
        });
      }
    } catch (e) {
      // ignore
    }
    return definitions;
  };

  const syncWorkflowInputParamsFromFirstStep = () => {
    setWorkflowDsl((prev) => {
      const firstStep = prev.steps[0];
      if (!firstStep) {
        return prev.inputParams ? { ...prev, inputParams: {} } : prev;
      }

      const activity = activitiesQuery.data?.find((item) => item.name === firstStep.activityName);
      const activityDefinitions = getActivityInputParamDefinitions(activity);
      const currentDefinitions = prev.inputParams || {};
      const stepInputEntries = Object.entries(firstStep.input || {}).filter(([key]) => key !== 'timeout');
      const nextInputParams: Record<string, { description?: string; required?: boolean; defaultValue?: string }> = {};

      Object.entries(activityDefinitions).forEach(([key, definition]) => {
        nextInputParams[key] = {
          description: currentDefinitions[key]?.description || definition.description || '',
          required: currentDefinitions[key]?.required ?? definition.required ?? false,
          defaultValue: currentDefinitions[key]?.defaultValue ?? definition.defaultValue ?? '',
        };
      });

      stepInputEntries.forEach(([key, value]) => {
        nextInputParams[key] = {
          description: currentDefinitions[key]?.description || nextInputParams[key]?.description || '',
          required: currentDefinitions[key]?.required ?? nextInputParams[key]?.required ?? false,
          defaultValue: typeof value === 'string' ? value : JSON.stringify(value),
        };
      });

      // Template-based drafts may already carry a complete inputParams definition even if
      // the shared activity from the pool has no persisted parameter metadata yet.
      if (Object.keys(nextInputParams).length === 0 && Object.keys(currentDefinitions).length > 0) {
        return prev;
      }

      if (JSON.stringify(currentDefinitions) === JSON.stringify(nextInputParams)) {
        return prev;
      }

      return {
        ...prev,
        inputParams: nextInputParams,
      };
    });
  };

  // 当选择步骤时，自动从Activity加载输入参数（如果步骤还没有参数）
  useEffect(() => {
    if (selectedStepIndexForConfig !== null && workflowDsl.steps[selectedStepIndexForConfig]) {
      const step = workflowDsl.steps[selectedStepIndexForConfig];
      if (step.activityName && (!step.input || Object.keys(step.input).filter(k => k !== 'timeout').length === 0)) {
        const activity = activitiesQuery.data?.find(a => a.name === step.activityName);
        const inputParams = activity ? getActivityInputParams(activity) : {};
        if (Object.keys(inputParams).length > 0) {
          handleUpdateStep(selectedStepIndexForConfig, 'input', {
            ...inputParams,
          });
        }
      }
    }
  }, [selectedStepIndexForConfig]);

  useEffect(() => {
    if (workflowDsl.steps.length === 0) {
      if (selectedStepIndexForConfig !== null) {
        setSelectedStepIndexForConfig(null);
      }
      return;
    }
    if (selectedStepIndexForConfig === null || selectedStepIndexForConfig >= workflowDsl.steps.length) {
      setSelectedStepIndexForConfig(0);
    }
  }, [workflowDsl.steps.length, selectedStepIndexForConfig]);

  const workflowsQuery = useQuery(['temporal-workflows'], () => temporalWorkflowApi.list());
  const activitiesQuery = useQuery('activities', () => activityApi.list());
  const filteredWorkflows = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    if (!keyword) return workflowsQuery.data || [];

    return (workflowsQuery.data || []).filter((workflow) => {
      const name = workflow.name?.toLowerCase() || '';
      const description = workflow.description?.toLowerCase() || '';
      const taskQueue = workflow.taskQueue?.toLowerCase() || '';
      return (
        name.includes(keyword) ||
        description.includes(keyword) ||
        taskQueue.includes(keyword)
      );
    });
  }, [searchText, workflowsQuery.data]);

  useEffect(() => {
    if (workflowDsl.steps.length > 0) {
      syncWorkflowInputParamsFromFirstStep();
    }
  }, [workflowDsl.steps, activitiesQuery.data]);

  const appendRealValidationLog = (content: string) => dispatchRealValidation({ type: 'APPEND_LOG', payload: content });

  const createMutation = useMutation(temporalWorkflowApi.create, {
    onSuccess: () => { message.success(t('common:success')); queryClient.invalidateQueries(['temporal-workflows']); setEditModalVisible(false); form.resetFields(); },
    onError: () => { message.error(t('common:error')); },
  });

  const updateMutation = useMutation(
    ({ id, data }: { id: string; data: Partial<CreateTemporalWorkflowDTO> }) => temporalWorkflowApi.update(id, data),
    { onSuccess: () => { message.success(t('common:success')); queryClient.invalidateQueries(['temporal-workflows']); setEditModalVisible(false); }, onError: () => { message.error(t('common:error')); } }
  );

  const deleteMutation = useMutation(temporalWorkflowApi.delete, {
    onSuccess: () => { message.success(t('common:success')); queryClient.invalidateQueries(['temporal-workflows']); },
    onError: () => { message.error(t('common:error')); },
  });

  const validateMutation = useMutation(
    ({ workflowDsl: wfd, activityDsl: ad }: { workflowDsl: WorkflowDsl; activityDsl: ActivityDsl }) =>
      temporalWorkflowApi.validate(wfd, ad),
    { onSuccess: (result) => { setValidationResult(result); message.success('验证完成'); }, onError: () => { message.error('验证失败'); } }
  );

  const generateCodeMutation = useMutation(
    ({ workflowDsl: wfd, activityDsl: ad, errorContext }: { workflowDsl: WorkflowDsl; activityDsl: ActivityDsl; errorContext?: string }) =>
      temporalWorkflowApi.generateWorkflowCode(wfd, ad, errorContext),
    { onSuccess: (result: WorkflowCodeResult) => {
      if (result.success && result.code) {
        setGeneratedCode(result.code);
        setCodeModalVisible(true);
        message.success('代码生成成功');
      } else {
        message.error(result.error || '代码生成失败');
      }
    }, onError: (error: any) => { message.error('代码生成失败: ' + (error.message || 'Unknown error')); } }
  );

  const handleCreate = () => {
    setEditingWorkflow(null);
    form.resetFields();
    setWorkflowDsl(DEFAULT_WORKFLOW_DSL);
    setActivityDsl(DEFAULT_ACTIVITY_DSL);
    setGeneratedCode(null);
    setSelectedStepIndexForConfig(null);
    setEditModalVisible(true);
  };

  const openTemplateModal = async () => {
    setTemplateModalVisible(true);
    setTemplatesLoading(true);
    try {
      const data = await carboneAPI.getTemplates();
      setTemplates(Array.isArray(data) ? data : []);
    } catch (error: any) {
      message.error('加载模板失败: ' + (error.message || '未知错误'));
      setTemplates([]);
    } finally {
      setTemplatesLoading(false);
    }
  };

  const handleSelectTemplate = async (template: CarboneTemplate) => {
    try {
      setGeneratingTemplateId(template.id);
      const draft: TemplateWorkflowDraft = await temporalWorkflowApi.generateTemplateDraft(template.id);
      form.setFieldsValue({
        name: draft.name,
        description: draft.description,
        taskQueue: draft.taskQueue || 'SKILL_TASK_QUEUE',
      });
      setWorkflowDsl(draft.workflowDsl);
      setActivityDsl(draft.activityDsl);
      setGeneratedCode(null);
      setSelectedStepIndexForConfig(draft.workflowDsl?.steps?.length ? 0 : null);
      setTemplateModalVisible(false);
      setEditModalVisible(true);
      message.success('已生成模板工作流草稿');
    } catch (error: any) {
      message.error('生成模板工作流失败: ' + (error.message || '未知错误'));
    } finally {
      setGeneratingTemplateId(null);
    }
  };

  const handleEdit = (workflow: TemporalWorkflowDTO) => {
    setEditingWorkflow(workflow);
    form.setFieldsValue({ name: workflow.name, description: workflow.description, taskQueue: workflow.taskQueue });
    setWorkflowDsl({
      ...DEFAULT_WORKFLOW_DSL,
      ...(workflow.workflowDsl || {}),
    });
    setActivityDsl(workflow.activityDsl || DEFAULT_ACTIVITY_DSL);
    setGeneratedCode(workflow.generatedCode || null);
    setSelectedStepIndexForConfig(workflow.workflowDsl?.steps?.length ? 0 : null);
    setEditModalVisible(true);
  };

  const handleViewDetail = (workflow: TemporalWorkflowDTO) => { setSelectedWorkflow(workflow); setDetailModalVisible(true); };

  const handleValidate = () => {
    const formValues = form.getFieldsValue();
    const workflowName = formValues.name || workflowDsl.name;
    setValidationResult(null);
    setValidateModalVisible(true);
    validateMutation.mutate({ workflowDsl: { ...workflowDsl, name: workflowName }, activityDsl });
  };

  const handleGenerateCode = (errorContext?: string) => {
    const formValues = form.getFieldsValue();
    const workflowName = formValues.name || workflowDsl.name;
    if (!workflowName) { message.warning('请先填写工作流名称'); return; }
    if (workflowDsl.steps.length === 0) { message.warning('请先添加至少一个步骤'); return; }
    generateCodeMutation.mutate({ workflowDsl: { ...workflowDsl, name: workflowName }, activityDsl, errorContext });
  };

  // 收集工作流步骤的输入参数
  const collectWorkflowInputParams = (): Record<string, string> => {
    const params: Record<string, string> = {};
    Object.entries(workflowDsl.inputParams || {}).forEach(([key, config]) => {
      params[key] = config?.defaultValue || '';
    });
    workflowDsl.steps.forEach((step) => {
      if (step.input) {
        Object.entries(step.input).forEach(([key, value]) => {
          if (!params[key]) {
            params[key] = typeof value === 'string' ? value : JSON.stringify(value);
          }
        });
      }
    });
    return params;
  };

  const handleOpenRealValidation = () => {
    if (!generatedCode) { message.warning('请先生成代码'); return; }
    const inputParams = collectWorkflowInputParams();
    dispatchRealValidation({ type: 'OPEN', payload: inputParams });
  };

  const handleRealValidation = async () => {
    if (!generatedCode) { message.warning('请先生成代码'); return; }
    const fn = workflowDsl.workflowClassName?.trim() || (workflowDsl.name.replace(/\s+/g, '') + 'Workflow');
    dispatchRealValidation({ type: 'START' });

    // 构建输入参数
    const inputParams: Record<string, string> = {};
    Object.entries(realValidationInputParams).forEach(([key, value]) => {
      if (value && value.trim()) {
        inputParams[key] = value;
      }
    });

    try {
      await temporalWorkflowApi.validateWorkflowRealStream(
        generatedCode,
        fn,
        inputParams,
        workflowDsl.taskQueue,
        (event) => {
          if (event.type === 'log' && event.content) {
            appendRealValidationLog(event.content);
          } else if (event.type === 'done') {
            const normalized = normalizeExecutionResult(event, {
              defaultSuccessScore: 100,
              defaultFailureScore: 0,
            });
            dispatchRealValidation({
              type: 'SET_RESULT',
              payload: {
              success: normalized.success,
              logs: [],
              result: event.result,
              error: normalized.error,
              score: normalized.score,
              },
            });
          } else if (event.type === 'error') {
            dispatchRealValidation({
              type: 'SET_RESULT',
              payload: {
                success: false,
                logs: [],
                error: event.content || 'Unknown error',
                score: 0,
              },
            });
          }
        }
      );
    } catch (error: any) {
      appendRealValidationLog(`错误: ${error.message}`);
      dispatchRealValidation({
        type: 'SET_RESULT',
        payload: {
          success: false,
          logs: [],
          error: error.message,
          score: 0,
        },
      });
    }
  };

  const handleSave = () => {
    form.validateFields().then((values) => {
      const workflowName = values.name || workflowDsl.name;
      const data: CreateTemporalWorkflowDTO = {
        name: workflowName,
        description: values.description,
        taskQueue: values.taskQueue,
        workflowDsl: { ...workflowDsl, name: workflowName },
        activityDsl,
        generatedCode: generatedCode || undefined,
      };
      if (editingWorkflow) updateMutation.mutate({ id: editingWorkflow.id, data });
      else createMutation.mutate(data);
    });
  };

  const handleDelete = (id: string) => Modal.confirm({ title: t('common:confirmDelete'), content: '删除后无法恢复，是否继续？', onOk: () => deleteMutation.mutate(id) });

  const handleAddStep = () => {
    const nextIndex = workflowDsl.steps.length;
    setWorkflowDsl({ ...workflowDsl, steps: [...workflowDsl.steps, { id: `step_${Date.now()}`, name: `步骤 ${workflowDsl.steps.length + 1}`, type: 'activity' }] });
    if (nextIndex === 0) {
      setSelectedStepIndexForConfig(0);
    }
  };
  const handleRemoveStep = (index: number) => setWorkflowDsl({ ...workflowDsl, steps: workflowDsl.steps.filter((_, i) => i !== index) });
  const handleUpdateStep = (index: number, field: string, value: any) => { const updated = [...workflowDsl.steps]; updated[index] = { ...updated[index], [field]: value }; setWorkflowDsl({ ...workflowDsl, steps: updated }); };

  const handleOpenActivitySelector = (stepIndex: number) => { setSelectingStepIndex(stepIndex); setSelectActivityModalVisible(true); };

  const buildStepTimeoutsFromActivity = (activity?: ActivityDTO) => ({
    startToCloseTimeout: activity?.timeout || '60s',
    scheduleToCloseTimeout: activity?.config?.scheduleToCloseTimeout || undefined,
    heartbeatTimeout: activity?.config?.heartbeatTimeout || undefined,
  });

  // Add activity from pool to workflow steps and activityDsl
  const handleAddActivityFromPool = (activity: ActivityDTO) => {
    const stepId = `step_${Date.now()}`;
    const newStep = {
      id: stepId,
      name: activity.name,
      type: 'activity' as const,
      activityName: activity.name,
      ...buildStepTimeoutsFromActivity(activity),
    };
    // Add step to workflowDsl
    setWorkflowDsl({ ...workflowDsl, steps: [...workflowDsl.steps, newStep] });
    // Add activity to activityDsl if not exists
    const exists = activityDsl.activities.some(a => a.name === activity.name);
    if (!exists) {
      setActivityDsl({
        ...activityDsl,
        activities: [...activityDsl.activities, {
          name: activity.name,
          fn: activity.fn,
          timeout: activity.timeout,
          handler: activity.handler,
          config: activity.config || {},
        }],
      });
    }
    // Select the newly added step for config
    setSelectedStepIndexForConfig(workflowDsl.steps.length);
  };

  const handleSelectActivity = (activity: ActivityDTO) => {
    if (selectingStepIndex !== null) {
      const currentStep = workflowDsl.steps[selectingStepIndex];
      const nextStep = {
        ...currentStep,
        activityName: activity.name,
        startToCloseTimeout: currentStep?.startToCloseTimeout || activity.timeout || '60s',
        scheduleToCloseTimeout: currentStep?.scheduleToCloseTimeout || activity.config?.scheduleToCloseTimeout || undefined,
        heartbeatTimeout: currentStep?.heartbeatTimeout || activity.config?.heartbeatTimeout || undefined,
      };
      const updatedSteps = [...workflowDsl.steps];
      updatedSteps[selectingStepIndex] = nextStep;
      setWorkflowDsl({ ...workflowDsl, steps: updatedSteps });
      const exists = activityDsl.activities.some(a => a.name === activity.name);
      if (!exists) {
        setActivityDsl({ ...activityDsl, activities: [...activityDsl.activities, { name: activity.name, fn: activity.fn, timeout: activity.timeout, handler: activity.handler, config: activity.config }] });
      }
    }
    setSelectActivityModalVisible(false);
    setSelectingStepIndex(null);
  };

  const handleRegenerateCode = () => {
    dispatchRealValidation({ type: 'CLOSE' });
    setGeneratedCode(null);
    // Build error context from the last real validation result
    let errorContext: string | undefined;
    if (realValidationState.result) {
      const errors: string[] = [];
      if (realValidationState.result.error) errors.push(`验证错误: ${realValidationState.result.error}`);
      if (realValidationState.result.result?.error) errors.push(`执行错误: ${realValidationState.result.result.error}`);
      if (realValidationState.result.result?.traceback) errors.push(`堆栈: ${realValidationState.result.result.traceback}`);
      if (realValidationState.logs.length > 0) errors.push(`日志:\n${realValidationState.logs.join('\n')}`);
      if (errors.length > 0) {
        errorContext = `上次真实验证失败，请修复以下问题:\n\n${errors.join('\n\n')}`;
      }
    }
    handleGenerateCode(errorContext);
  };

  const realValidationModalFooter = realValidationState.result && !realValidationState.result.success ? [
    <Button key="close" onClick={() => dispatchRealValidation({ type: 'CLOSE' })}>关闭</Button>,
    <Button key="regenerate" type="primary" onClick={handleRegenerateCode}>重新生成代码</Button>,
  ] : [<Button key="close" onClick={() => dispatchRealValidation({ type: 'CLOSE' })}>关闭</Button>];

  const renderTipLabel = (label: string, tip: string) => (
    <Space size={4}>
      <span>{label}</span>
      <Tooltip title={tip}>
        <InfoCircleOutlined style={{ color: '#8c8c8c' }} />
      </Tooltip>
    </Space>
  );

  const updateStepDurationField = (
    index: number,
    field: StepDurationField,
    value: number | null | undefined,
    unit: DurationUnit,
  ) => {
    handleUpdateStep(index, field, formatDurationValue(value, unit));
  };

  const renderStepDurationField = (
    field: StepDurationField,
    label: string,
    tip: string,
  ) => {
    if (selectedStepIndexForConfig === null || !workflowDsl.steps[selectedStepIndexForConfig]) {
      return null;
    }
    const step = workflowDsl.steps[selectedStepIndexForConfig];
    const parsed = parseDurationValue(step[field]);
    return (
      <Form.Item label={renderTipLabel(label, tip)} style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <InputNumber
            size="small"
            min={0}
            value={parsed.value}
            onChange={(value) => updateStepDurationField(selectedStepIndexForConfig, field, value, parsed.unit)}
            placeholder="时长"
            style={{ width: DURATION_INPUT_WIDTH }}
          />
          <Segmented
            size="small"
            options={DURATION_UNIT_OPTIONS}
            value={parsed.unit}
            onChange={(value) => updateStepDurationField(selectedStepIndexForConfig, field, parsed.value, value as DurationUnit)}
            style={{ width: DURATION_SEGMENTED_WIDTH, padding: 0 }}
          />
        </div>
      </Form.Item>
    );
  };

  const updateWorkflowDurationField = (
    field: WorkflowDurationField,
    value: number | null | undefined,
    unit: DurationUnit,
  ) => {
    setWorkflowDsl({
      ...workflowDsl,
      [field]: formatDurationValue(value, unit),
    });
  };

  const renderWorkflowDurationField = (
    field: WorkflowDurationField,
    label: string,
    tip: string,
    enabled: boolean,
    defaultValue: string,
  ) => {
    const parsed = parseDurationValue(workflowDsl[field]);
    return (
      <Form.Item label={renderTipLabel(label, tip)} style={{ marginBottom: 0 }}>
        <Space size={6} align="center">
          <Switch
            checked={enabled}
            onChange={(checked) => setWorkflowDsl({
              ...workflowDsl,
              [field]: checked ? defaultValue : undefined,
            })}
          />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <InputNumber
              size="small"
              min={0}
              disabled={!enabled}
              value={parsed.value}
              placeholder="时长"
              onChange={(value) => updateWorkflowDurationField(field, value, parsed.unit)}
              style={{ width: DURATION_INPUT_WIDTH }}
            />
            <Segmented
              size="small"
              options={DURATION_UNIT_OPTIONS}
              value={parsed.unit}
              disabled={!enabled}
              onChange={(value) => updateWorkflowDurationField(field, parsed.value, value as DurationUnit)}
              style={{ width: DURATION_SEGMENTED_WIDTH, padding: 0 }}
            />
          </div>
        </Space>
      </Form.Item>
    );
  };

  const centerTitle = (text: string) => <div style={{ textAlign: 'center', width: '100%' }}>{text}</div>;
  const shorten = (text?: string, max = 24) => {
    if (!text) {
      return '-';
    }
    return text.length > max ? `${text.slice(0, max)}...` : text;
  };
  const columns: ColumnsType<TemporalWorkflowDTO> = [
    {
      title: centerTitle('工作流名称'),
      dataIndex: 'name',
      key: 'name',
      width: 140,
      align: 'center',
      render: (name, r) => (
        <Tooltip title={name}>
          <Space direction="vertical" size={0}>
            <a onClick={() => handleViewDetail(r)}>
              <Text strong>{shorten(name, 12)}</Text>
            </a>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {r.workflowDsl?.workflowClassName || `${(r.workflowDsl?.name || r.name || 'Custom').replace(/\s+/g, '')}Workflow`}
            </Text>
          </Space>
        </Tooltip>
      )
    },
    { title: centerTitle('描述'), dataIndex: 'description', key: 'description', width: 360, align: 'center', render: (desc: string) => <Tooltip title={desc || '-'}>{shorten(desc, 40)}</Tooltip> },
    { title: centerTitle('步骤数'), key: 'stepCount', width: 60, align: 'center', render: (_, r) => <Badge count={r.workflowDsl?.steps?.length || 0} showZero color="blue" /> },
    { title: centerTitle('工作单元数'), key: 'activityCount', width: 72, align: 'center', render: (_, r) => <Badge count={r.activityDsl?.activities?.length || 0} showZero color="green" /> },
    { title: centerTitle('状态'), key: 'status', width: 72, align: 'center', render: (_, r) => <Tag color={r.isActive ? 'green' : 'default'}>{r.isActive ? '启用' : '禁用'}</Tag> },
    {
      title: centerTitle(t('common:actions')),
      key: 'actions',
      width: 170,
      align: 'center',
      render: (_, r) => (
        <Space size={6}>
          <Button type="default" size="small" icon={<EditOutlined />} onClick={() => handleEdit(r)}>
            编辑
          </Button>
          <Popconfirm title="确认删除" onConfirm={() => handleDelete(r.id)} okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
            <Button type="default" size="small" icon={<DeleteOutlined />} danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    },
  ];
  const currentWorkflowDisplayName = (workflowDsl.workflowDefnName || form.getFieldValue('name') || workflowDsl.name || '未命名工作流') as string;
  const currentWorkflowClassName = (workflowDsl.workflowClassName || `${((form.getFieldValue('name') || workflowDsl.name || 'Custom') as string).replace(/\s+/g, '')}Workflow`) as string;
  const currentSourceTemplate = useMemo(
    () => editingWorkflow?.sourceTemplate || deriveWorkflowSourceTemplate(workflowDsl, activityDsl),
    [editingWorkflow?.id, editingWorkflow?.sourceTemplate, workflowDsl, activityDsl],
  );
  const workflowOverviewStats = [
    {
      label: '工作流总数',
      value: workflowsQuery.data?.length || 0,
      icon: <ThunderboltOutlined style={{ color: 'var(--text-secondary)' }} />,
      color: 'var(--text-primary)',
    },
    {
      label: 'Task Queue 数',
      value: new Set((workflowsQuery.data || []).map(w => w.taskQueue).filter(Boolean)).size,
      icon: <RocketOutlined style={{ color: 'var(--info-color)' }} />,
      color: 'var(--info-color)',
    },
    {
      label: '步骤总数',
      value: workflowsQuery.data?.reduce((sum, w) => sum + (w.workflowDsl?.steps?.length || 0), 0) || 0,
      icon: <ApiOutlined style={{ color: 'var(--success-color)' }} />,
      color: 'var(--success-color)',
    },
    {
      label: '已启用',
      value: workflowsQuery.data?.filter(w => w.isActive).length || 0,
      icon: <CheckCircleOutlined style={{ color: 'var(--warning-color)' }} />,
      color: 'var(--warning-color)',
    },
  ];

  return (
    <div style={{ padding: '8px 4px 12px' }}>
      <PageTitleBlock
        title="Temporal Workflows"
        subtitle="查看、筛选并维护工作流编排配置"
      />

      <OverviewStatGrid
        items={workflowOverviewStats.map((item) => ({
          key: item.label,
          label: item.label,
          value: item.value,
          color: item.color,
          icon: item.icon,
        }))}
      />

      <Card style={{ ...SECTION_CARD_STYLE, marginBottom: 16 }} styles={{ body: { padding: 20 } }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <Space direction="vertical" size={2}>
              <Text strong style={{ fontSize: 16 }}>工作流总览</Text>
              <Text type="secondary">支持搜索、创建、刷新和模板生成</Text>
            </Space>
            <Space wrap>
              <Button size="large" icon={<ReloadOutlined />} onClick={() => workflowsQuery.refetch()}>
                {t('common:refresh')}
              </Button>
              <Button size="large" icon={<RobotOutlined />} onClick={openTemplateModal}>
                模版工作流
              </Button>
              <Button size="large" icon={<PlusOutlined />} type="primary" onClick={handleCreate}>
                创建工作流
              </Button>
            </Space>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'stretch',
              justifyContent: 'space-between',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <Input
              size="large"
              placeholder="搜索工作流名称、描述或任务队列"
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              style={{ width: 360, height: 44, background: 'var(--bg-secondary)', borderRadius: 12 }}
              variant="borderless"
              allowClear
            />
            <Text type="secondary" style={{ display: 'flex', alignItems: 'center' }}>
              当前展示 {filteredWorkflows.length} 条
            </Text>
          </div>
        </div>
      </Card>

      <Card style={SECTION_CARD_STYLE} styles={{ body: { padding: 16 } }}>
        <Alert message="工作流说明" description={<Space direction="vertical" size="small"><Text><strong>Workflow DSL</strong>：定义确定性编排逻辑。Temporal 会 replay 这个逻辑来恢复状态。</Text><Text><strong>工作单元 DSL</strong>：定义非确定性副作用操作（API调用、文档渲染、浏览器操作、脚本执行）。</Text></Space>} type="info" showIcon style={{ marginBottom: 14, borderRadius: 10 }} />
        <ListSectionHeader
          title="工作流记录列表"
          subtitle="可查看详情、编辑配置或删除工作流"
          extra={<Text type="secondary">共 {filteredWorkflows.length} 条</Text>}
        />
        <Table
          columns={columns}
          dataSource={filteredWorkflows}
          rowKey="id"
          loading={workflowsQuery.isLoading}
          size="middle"
          pagination={{ showSizeChanger: true, showTotal: total => `共 ${total} 条` }}
        />
      </Card>

      <Modal title="选择工作单元" open={selectActivityModalVisible} onCancel={() => { setSelectActivityModalVisible(false); setSelectingStepIndex(null); }} footer={null} width={600}>
        <Alert message="选择一个工作单元关联到工作流步骤" type="info" showIcon style={{ marginBottom: 16 }} />
        <div style={{ maxHeight: 400, overflow: 'auto' }}>
          {(activitiesQuery.data || []).map(activity => (
            <Card key={activity.id} size="small" style={{ marginBottom: 8, cursor: 'pointer' }} onClick={() => handleSelectActivity(activity)}>
              <Space><Tag color={activity.handler === 'api' ? 'green' : activity.handler === 'script' ? 'orange' : 'blue'}>{activity.handler.toUpperCase()}</Tag><Text strong>{activity.name}</Text><Text type="secondary">({activity.fn})</Text></Space>
            </Card>
          ))}
          {(!activitiesQuery.data || activitiesQuery.data.length === 0) && <Alert message="暂无工作单元，请先创建" type="warning" showIcon />}
        </div>
      </Modal>

      <Modal
        title="选择文档模板生成工作流"
        open={templateModalVisible}
        onCancel={() => setTemplateModalVisible(false)}
        footer={null}
        width={900}
      >
        <Space style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }}>
          <Input
            placeholder="搜索模板..."
            prefix={<SearchOutlined />}
            value={templateSearch}
            onChange={(e) => setTemplateSearch(e.target.value)}
            style={{ width: 240 }}
            allowClear
          />
          <Button icon={<ReloadOutlined />} onClick={openTemplateModal} loading={templatesLoading} disabled={Boolean(generatingTemplateId)}>刷新</Button>
        </Space>
        <div style={{ maxHeight: 520, overflow: 'auto', paddingRight: 4 }}>
          {(templates || []).filter(t => {
            const kw = templateSearch.trim().toLowerCase();
            if (!kw) return true;
            const name = (t.fileName || '').toLowerCase();
            const id = (t.id || '').toLowerCase();
            return name.includes(kw) || id.includes(kw);
          }).map((t) => (
            <Card key={t.id} size="small" style={{ marginBottom: 10 }}>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Space>
                  <Tag color={t.format === 'docx' ? 'blue' : t.format === 'xlsx' ? 'green' : 'purple'}>{t.format?.toUpperCase() || 'DOC'}</Tag>
                  <Text strong>{t.fileName || t.id}</Text>
                  <Text type="secondary">ID: {t.id}</Text>
                  {t.skillId ? <Tag color="geekblue">Skill: {t.skillId}</Tag> : <Tag>无Skill</Tag>}
                </Space>
                <Space>
                  <Button
                    type="primary"
                    onClick={() => handleSelectTemplate(t)}
                    loading={generatingTemplateId === t.id}
                    disabled={Boolean(generatingTemplateId)}
                  >
                    {generatingTemplateId === t.id ? '生成中...' : '用此模板生成'}
                  </Button>
                </Space>
              </Space>
            </Card>
          ))}
          {(!templates || templates.length === 0) && (
            <Alert message="暂无模板，或加载失败" type="warning" showIcon />
          )}
        </div>
      </Modal>

      <Modal
        title={<Space size={8}><ThunderboltOutlined style={{ color: 'var(--primary-color)' }} /><span>工作流详情</span></Space>}
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={null}
        width={920}
      >
        {selectedWorkflow && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Card size="small" style={SECTION_CARD_STYLE} styles={{ body: { padding: 14 } }}>
              <Row gutter={[12, 10]}>
                <Col span={12}><Text><strong>显示名称:</strong> {selectedWorkflow.workflowDsl?.workflowDefnName || selectedWorkflow.workflowDsl?.name || selectedWorkflow.name}</Text></Col>
                <Col span={12}><Text><strong>类名:</strong> <Tag color="geekblue">{selectedWorkflow.workflowDsl?.workflowClassName || `${(selectedWorkflow.workflowDsl?.name || selectedWorkflow.name || 'Custom').replace(/\s+/g, '')}Workflow`}</Tag></Text></Col>
                <Col span={12}><Text><strong>Task Queue:</strong> <Tag color="blue">{selectedWorkflow.taskQueue}</Tag></Text></Col>
                <Col span={12}><Text><strong>状态:</strong> <Tag color={selectedWorkflow.isActive ? 'green' : 'default'}>{selectedWorkflow.isActive ? '已启用' : '已禁用'}</Tag></Text></Col>
                <Col span={24}><Text><strong>描述:</strong> {selectedWorkflow.description || '无'}</Text></Col>
              </Row>
            </Card>
            {selectedWorkflow.sourceTemplate && (
              <Card size="small" style={SECTION_CARD_STYLE} styles={{ body: { padding: 14 } }}>
                <Row gutter={[12, 10]}>
                  <Col span={12}><Text><strong>模板 ID:</strong> <Tag color="purple">{selectedWorkflow.sourceTemplate.templateId || '无'}</Tag></Text></Col>
                  <Col span={12}><Text><strong>模板内置 Skill:</strong> {selectedWorkflow.sourceTemplate.skillId ? <Tag color="geekblue">{selectedWorkflow.sourceTemplate.skillId}</Tag> : '无'}</Text></Col>
                  <Col span={12}><Text><strong>模板文件:</strong> {selectedWorkflow.sourceTemplate.fileName || '无'}</Text></Col>
                  <Col span={12}><Text><strong>格式:</strong> <Tag>{selectedWorkflow.sourceTemplate.format || '未知'}</Tag></Text></Col>
                  <Col span={12}><Text><strong>变量数:</strong> {selectedWorkflow.sourceTemplate.variableCount ?? '-'}</Text></Col>
                  <Col span={24}>
                    <Alert
                      type="info"
                      showIcon
                      message="后续 Skill 关联说明"
                      description="当 Capability Release 以该 Temporal Workflow 作为 sourceType=temporal_workflow 发布时，Skill 会继承这里的工作流 DSL、参数定义与输出定义；模板 ID / 内置 Skill ID 则作为来源情报继续用于理解该工作流来自哪个 Carbone 模板。"
                    />
                  </Col>
                </Row>
              </Card>
            )}
            <Collapse defaultActiveKey={['workflow', 'activities']} ghost>
              <Panel header={<Text><CodeOutlined /> Workflow DSL</Text>} key="workflow">
                <pre style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', padding: 16, borderRadius: 10, maxHeight: 320, overflow: 'auto', fontSize: 12 }}>{JSON.stringify(selectedWorkflow.workflowDsl, null, 2)}</pre>
              </Panel>
              <Panel header={<Text><ApiOutlined /> 工作单元 DSL</Text>} key="activities">
                <pre style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', padding: 16, borderRadius: 10, maxHeight: 320, overflow: 'auto', fontSize: 12 }}>{JSON.stringify(selectedWorkflow.activityDsl, null, 2)}</pre>
              </Panel>
            </Collapse>
          </Space>
        )}
      </Modal>

      <Modal title={<div style={{ textAlign: 'center', width: '100%' }}><Space direction="vertical" size={2}><Space size={8}><ThunderboltOutlined style={{ color: 'var(--primary-color)' }} /><Text strong style={{ fontSize: 18 }}>{editingWorkflow ? '编辑工作流' : '创建工作流'}</Text></Space><Text type="secondary" style={{ fontSize: 12 }}>配置工作流基础信息、执行参数、步骤编排与 AI 代码生成</Text></Space></div>} open={editModalVisible} onOk={handleSave} onCancel={() => setEditModalVisible(false)}
        footer={
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
            <Button size="small" key="validate" icon={<PlayCircleOutlined />} onClick={handleValidate}>验证DSL</Button>
            <Button size="small" key="generate" icon={<RobotOutlined />} onClick={() => handleGenerateCode()} loading={generateCodeMutation.isLoading}>AI生成代码</Button>
            <Button size="small" key="realValidation" icon={<ExperimentOutlined />} onClick={handleOpenRealValidation} loading={realValidationState.isStreaming} disabled={!generatedCode}>真实验证</Button>
            <Button size="small" key="viewCode" icon={<CodeOutlined />} onClick={() => setCodeModalVisible(true)} disabled={!generatedCode}>查看代码</Button>
            <Button size="small" key="cancel" onClick={() => setEditModalVisible(false)}>取消</Button>
            <Button size="small" key="save" type="primary" loading={createMutation.isLoading || updateMutation.isLoading} onClick={handleSave}>保存</Button>
          </div>
        }
        width={1200} style={{ top: 20 }}>
        <Form form={form} layout="vertical">
          <Card title="基础信息" size="small" style={{ ...SECTION_CARD_STYLE, marginBottom: 16 }} styles={{ body: SECTION_CARD_BODY_STYLE }}>
            {currentSourceTemplate && (
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 12 }}
                message="当前工作流来自模板"
                description={
                  <Space wrap size={[8, 8]}>
                    <Tag color="purple">模板 ID: {currentSourceTemplate.templateId || '无'}</Tag>
                    {currentSourceTemplate.skillId ? <Tag color="geekblue">内置 Skill: {currentSourceTemplate.skillId}</Tag> : <Tag>内置 Skill: 无</Tag>}
                    {currentSourceTemplate.fileName ? <Tag>文件: {currentSourceTemplate.fileName}</Tag> : null}
                    {currentSourceTemplate.format ? <Tag>格式: {currentSourceTemplate.format}</Tag> : null}
                    {currentSourceTemplate.variableCount !== undefined ? <Tag>变量数: {currentSourceTemplate.variableCount}</Tag> : null}
                  </Space>
                }
              />
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 12 }}>
              <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Text style={{ whiteSpace: 'nowrap', minWidth: 72 }}>工作流名称</Text>
                <Form.Item name="name" rules={[{ required: true, message: '请输入工作流名称' }]} style={{ marginBottom: 0, flex: 1 }}>
                  <Input size="small" placeholder="例如：天气查询流程" />
                </Form.Item>
              </div>
              <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Text style={{ whiteSpace: 'nowrap', minWidth: 72 }}>函数名</Text>
                <Input
                  size="small"
                  value={workflowDsl.workflowClassName || ''}
                  placeholder="例如：WeatherQueryWorkflow"
                  onChange={(e) => {
                    const nextName = e.target.value;
                    setWorkflowDsl({
                      ...workflowDsl,
                      workflowClassName: nextName,
                      workflowDefnName: workflowDsl.workflowDefnName || nextName,
                    });
                  }}
                />
              </div>
              <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Text style={{ whiteSpace: 'nowrap', minWidth: 72 }}>队列名</Text>
                <Form.Item
                  name="taskQueue"
                  rules={[{ required: true, message: '请输入Task Queue' }]}
                  style={{ marginBottom: 0, flex: 1 }}
                  tooltip="Temporal Worker 监听的队列名称，用于路由当前工作流任务。"
                >
                  <Input size="small" placeholder="例如：SKILL_TASK_QUEUE" />
                </Form.Item>
              </div>
            </div>
            <Form.Item name="description" label="描述" style={{ marginBottom: 0 }}>
              <Input.TextArea rows={2} placeholder="工作流描述" />
            </Form.Item>
          </Card>

          <Card title="执行配置" size="small" style={{ ...SECTION_CARD_STYLE, marginBottom: 16 }} styles={{ body: SECTION_CARD_BODY_STYLE }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 8, alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {renderWorkflowDurationField(
                  'workflowExecutionTimeout',
                  '执行超时',
                  'Execution Timeout 是整个工作流从开始到彻底结束的总上限，包含重试和 Continue-As-New。默认单位为秒，可切换为分或小时。',
                  !!workflowDsl.workflowExecutionTimeout,
                  '10m',
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {renderWorkflowDurationField(
                  'workflowRunTimeout',
                  '运行超时',
                  'Run Timeout 只限制当前这一轮运行实例，不覆盖整个 Workflow Execution。默认单位为秒，可切换为分或小时。',
                  !!workflowDsl.workflowRunTimeout,
                  '5m',
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {renderWorkflowDurationField(
                  'workflowTaskTimeout',
                  '任务超时',
                  'Task Timeout 是 Worker 每次处理一小段工作流决策代码的时间上限，主要用于探测 Worker 卡住或异常。默认单位为秒，可切换为分或小时。',
                  !!workflowDsl.workflowTaskTimeout,
                  '10s',
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Form.Item label={renderTipLabel('默认工作单元重试次数', '未单独覆盖时，工作流内工作单元的默认最大重试次数。')} style={{ marginBottom: 0 }}>
                  <Space size={8}>
                    <Switch checked={workflowDsl.defaultActivityRetryPolicy?.maxRetries !== undefined && workflowDsl.defaultActivityRetryPolicy?.maxRetries !== null} onChange={checked => setWorkflowDsl({ ...workflowDsl, defaultActivityRetryPolicy: { ...workflowDsl.defaultActivityRetryPolicy, maxRetries: checked ? 3 : undefined } })} />
                    <InputNumber
                      size="small"
                      min={0}
                      disabled={workflowDsl.defaultActivityRetryPolicy?.maxRetries === undefined || workflowDsl.defaultActivityRetryPolicy?.maxRetries === null}
                      value={workflowDsl.defaultActivityRetryPolicy?.maxRetries ?? 3}
                      onChange={value => setWorkflowDsl({ ...workflowDsl, defaultActivityRetryPolicy: { ...workflowDsl.defaultActivityRetryPolicy, maxRetries: value ?? 3 } })}
                      style={{ width: 88 }}
                    />
                  </Space>
                </Form.Item>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Form.Item label={renderTipLabel('退避系数', '指数退避系数，默认 2.0。')} style={{ marginBottom: 0 }}>
                  <Space size={8}>
                    <Switch checked={workflowDsl.defaultActivityRetryPolicy?.backoffCoefficient !== undefined} onChange={checked => setWorkflowDsl({ ...workflowDsl, defaultActivityRetryPolicy: { ...workflowDsl.defaultActivityRetryPolicy, backoffCoefficient: checked ? 2.0 : undefined } })} />
                    <InputNumber
                      size="small"
                      min={0}
                      step={0.1}
                      disabled={workflowDsl.defaultActivityRetryPolicy?.backoffCoefficient === undefined}
                      value={workflowDsl.defaultActivityRetryPolicy?.backoffCoefficient ?? 2.0}
                      onChange={value => setWorkflowDsl({ ...workflowDsl, defaultActivityRetryPolicy: { ...workflowDsl.defaultActivityRetryPolicy, backoffCoefficient: value ?? 2.0 } })}
                      style={{ width: 88 }}
                    />
                  </Space>
                </Form.Item>
              </div>
            </div>
          </Card>

          <Card
            title={(
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, width: '100%' }}>
                <Space size={6} style={{ minWidth: 0 }}>
                  <span>输入参数</span>
                  <Text type="secondary">（Workflow 入口参数）</Text>
                  <Tooltip title="第一个步骤的参数会自动成为整个工作流的入口参数，可补充默认值与说明。">
                    <InfoCircleOutlined style={{ color: 'var(--text-light)' }} />
                  </Tooltip>
                </Space>
                <Button
                  size="small"
                  type="dashed"
                  onClick={() => {
                    const key = prompt('请输入参数名:');
                    if (key && key.trim()) {
                      setWorkflowDsl({
                        ...workflowDsl,
                        inputParams: { ...workflowDsl.inputParams, [key.trim()]: { description: '', required: false, defaultValue: '' } }
                      });
                    }
                  }}
                  style={{ minWidth: 112, marginLeft: 'auto', flexShrink: 0, whiteSpace: 'nowrap' }}
                >
                  + 添加输入参数
                </Button>
              </div>
            )}
            size="small"
            style={{ ...SECTION_CARD_STYLE, marginBottom: 16 }}
            styles={{ body: SECTION_CARD_BODY_STYLE }}
          >
            <div style={SOFT_PANEL_STYLE}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 8 }}>
              {Object.entries(workflowDsl.inputParams || {}).map(([key, param]) => (
                <div
                  key={key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 10px',
                    border: '1px solid var(--bg-secondary)',
                    borderRadius: 10,
                    background: 'var(--bg-card)',
                  }}
                >
                  <Tag color="blue" style={{ marginInlineEnd: 0, whiteSpace: 'nowrap' }}>{key}</Tag>
                  <Select
                    value={param.required ? 'required' : 'optional'}
                    onChange={v => setWorkflowDsl({ ...workflowDsl, inputParams: { ...workflowDsl.inputParams, [key]: { ...param, required: v === 'required' } } })}
                    size="small"
                    style={{ width: 88, flexShrink: 0 }}
                  >
                    <Option value="required">必填</Option>
                    <Option value="optional">可选</Option>
                  </Select>
                  <Input
                    value={param.defaultValue || ''}
                    onChange={e => setWorkflowDsl({ ...workflowDsl, inputParams: { ...workflowDsl.inputParams, [key]: { ...param, defaultValue: e.target.value } } })}
                    placeholder="默认值"
                    size="small"
                    style={{ width: 110, flexShrink: 0 }}
                  />
                  <Input
                    value={param.description || ''}
                    onChange={e => setWorkflowDsl({ ...workflowDsl, inputParams: { ...workflowDsl.inputParams, [key]: { ...param, description: e.target.value } } })}
                    placeholder="参数描述"
                    size="small"
                    style={{ flex: 1, minWidth: 0 }}
                  />
                  <Button
                    size="small"
                    danger
                    type="text"
                    onClick={() => {
                      const newParams = { ...workflowDsl.inputParams };
                      delete (newParams as any)[key];
                      setWorkflowDsl({ ...workflowDsl, inputParams: newParams });
                    }}
                    style={{ paddingInline: 4, flexShrink: 0 }}
                  >
                    ×
                  </Button>
                </div>
              ))}
            </div>
          </div>
          </Card>
        </Form>

        <Divider style={{ margin: '20px 0 16px' }}><Text strong>工作流配置</Text></Divider>

        <Row gutter={12}>
          {/* Left Column - Work Unit Pool */}
          <Col span={6}>
            <Card size="small" style={{ ...SECTION_CARD_STYLE, height: '100%' }} styles={{ body: { padding: 12 } }}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>工作单元资源池</Text>
            <Input placeholder="搜索工作单元..." prefix={<SearchOutlined />} style={{ marginBottom: 8 }} allowClear />
            <div style={{ maxHeight: 400, overflow: 'auto', paddingRight: 2 }}>
              {(activitiesQuery.data || []).filter(a => a.isActive).map(activity => {
                const isAdded = workflowDsl.steps.some(s => s.activityName === activity.name);
                return (
                  <Card
                    key={activity.id}
                    hoverable
                    size="small"
                    style={{
                      marginBottom: 6,
                      cursor: 'pointer',
                      background: isAdded ? 'rgba(16, 185, 129, 0.12)' : 'var(--bg-card)',
                      border: isAdded ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid var(--bg-secondary)',
                    }}
                    onClick={() => !isAdded && handleAddActivityFromPool(activity)}
                  >
                    <Space>
                      <Tag color={activity.handler === 'api' ? 'green' : activity.handler === 'script' ? 'orange' : 'blue'}>{activity.handler.toUpperCase()}</Tag>
                      <Text strong={!isAdded} type={isAdded ? 'secondary' : undefined}>{activity.name}</Text>
                      {isAdded && <Tag color="green">已添加</Tag>}
                    </Space>
                    <br />
                    <Text type="secondary" style={{ fontSize: 11 }}>{activity.fn}</Text>
                  </Card>
                );
              })}
              {(!activitiesQuery.data || activitiesQuery.data.filter(a => a.isActive).length === 0) && (
                <Alert message="暂无已验证的工作单元" type="warning" showIcon />
              )}
            </div>
            </Card>
          </Col>

          {/* Middle Column - Step Canvas */}
          <Col span={10}>
            <Card size="small" style={{ ...SECTION_CARD_STYLE, height: '100%' }} styles={{ body: { padding: 12 } }}>
            <Space style={{ marginBottom: 8, width: '100%', justifyContent: 'space-between' }}>
              <Text strong>流程步骤</Text>
              <Button icon={<PlusOutlined />} size="small" style={{ minWidth: 92 }} onClick={handleAddStep}>添加步骤</Button>
            </Space>
            {workflowDsl.steps.length === 0 ? (
              <Alert message="从左侧勾选工作单元或点击添加步骤" type="info" showIcon />
            ) : (
              <Timeline>{workflowDsl.steps.map((step, index) => (
                <Timeline.Item
                  key={step.id}
                  color={selectedStepIndexForConfig === index ? 'green' : 'blue'}
                  dot={selectedStepIndexForConfig === index ? <CheckCircleOutlined /> : undefined}
                >
                  <Card
                    hoverable
                    size="small"
                    style={{
                      marginBottom: 6,
                      cursor: 'pointer',
                      background: selectedStepIndexForConfig === index ? 'rgba(16, 185, 129, 0.12)' : 'var(--bg-card)',
                      border: selectedStepIndexForConfig === index ? '2px solid rgba(16, 185, 129, 0.6)' : '1px solid var(--bg-secondary)',
                    }}
                    onClick={() => {
                      setSelectedStepIndexForConfig(index);
                      if (index === 0) {
                        syncWorkflowInputParamsFromFirstStep();
                      }
                    }}
                  >
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                        <Input
                          value={step.name}
                          onChange={e => handleUpdateStep(index, 'name', e.target.value)}
                          placeholder="步骤名称"
                          style={{ width: 120 }}
                          size="small"
                          onClick={e => e.stopPropagation()}
                        />
                        <Space size="small">
                          <Button
                            icon={<DeleteOutlined />}
                            danger
                            size="small"
                            onClick={(e) => { e.stopPropagation(); handleRemoveStep(index); }}
                          />
                          {index > 0 && (
                            <Button icon={<SearchOutlined />} size="small" onClick={(e) => { e.stopPropagation(); const newSteps = [...workflowDsl.steps]; [newSteps[index - 1], newSteps[index]] = [newSteps[index], newSteps[index - 1]]; setWorkflowDsl({ ...workflowDsl, steps: newSteps }); if (selectedStepIndexForConfig === index) setSelectedStepIndexForConfig(index - 1); else if (selectedStepIndexForConfig === index - 1) setSelectedStepIndexForConfig(index); }} />
                          )}
                          {index < workflowDsl.steps.length - 1 && (
                            <Button icon={<SearchOutlined />} size="small" onClick={(e) => { e.stopPropagation(); const newSteps = [...workflowDsl.steps]; [newSteps[index], newSteps[index + 1]] = [newSteps[index + 1], newSteps[index]]; setWorkflowDsl({ ...workflowDsl, steps: newSteps }); if (selectedStepIndexForConfig === index) setSelectedStepIndexForConfig(index + 1); else if (selectedStepIndexForConfig === index + 1) setSelectedStepIndexForConfig(index); }} />
                          )}
                        </Space>
                      </Space>
                      {step.type === 'activity' && (
                        <Space>
                          <Tag color="green">{step.activityName || '未选择'}</Tag>
                          <Button size="small" onClick={(e) => { e.stopPropagation(); handleOpenActivitySelector(index); }}>更换</Button>
                        </Space>
                      )}
                    </Space>
                  </Card>
                </Timeline.Item>
              ))}</Timeline>
            )}
            </Card>
          </Col>

          {/* Right Column - Step Config Panel */}
          <Col span={8}>
            <Card size="small" style={{ ...SECTION_CARD_STYLE, height: '100%' }} styles={{ body: { padding: 12 } }}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>步骤配置</Text>
            {selectedStepIndexForConfig !== null && workflowDsl.steps[selectedStepIndexForConfig] ? (
              <Card size="small" style={{ ...SECTION_CARD_STYLE, background: 'var(--bg-card)' }} styles={{ body: { padding: 14 } }}>
                <Form layout="vertical" size="small">
                  {workflowDsl.steps[selectedStepIndexForConfig].type === 'activity' && (
                    <>
                      {renderStepDurationField('startToCloseTimeout', '单次执行超时', '限制当前步骤里这次工作单元执行时长。默认单位为秒，可切换为分或小时。')}
                      {renderStepDurationField('scheduleToCloseTimeout', '整体完成超时', '限制该步骤从调度到最终完成的总时长，包含排队、执行和重试。默认单位为秒，可切换为分或小时。')}
                      {renderStepDurationField('heartbeatTimeout', '心跳超时', '长耗时工作单元可通过心跳汇报存活；超时表示长时间未汇报。默认单位为秒，可切换为分或小时。')}

                      <Form.Item label="输入参数（只读）" style={{ marginBottom: 0 }}>
                        <div style={{ border: '1px dashed var(--bg-secondary)', padding: 8, borderRadius: 8, background: 'var(--bg-card)' }}>
                          {Object.entries(workflowDsl.steps[selectedStepIndexForConfig].input || {}).filter(([k]) => k !== 'timeout').map(([key, value]) => (
                            <div key={key} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
                              <Tag color="blue">{key}</Tag>
                              <Input
                                size="small"
                                value={typeof value === 'string' ? value : JSON.stringify(value)}
                                disabled
                                style={{ flex: 1 }}
                              />
                            </div>
                          ))}
                          {Object.keys(workflowDsl.steps[selectedStepIndexForConfig].input || {}).filter((key) => key !== 'timeout').length === 0 && (
                            <Text type="secondary">当前步骤没有可展示的只读参数</Text>
                          )}
                        </div>
                      </Form.Item>
                    </>
                  )}
                </Form>
              </Card>
            ) : (
              <Alert message="点击中间步骤选择配置" type="info" showIcon />
            )}

            {/* Work Unit DSL Summary */}
            <Divider style={{ margin: '16px 0' }}><Text type="secondary" style={{ fontSize: 12 }}>工作单元 DSL 摘要</Text></Divider>
            {activityDsl.activities.length === 0 ? (
              <Alert message="从左侧添加工作单元" type="info" showIcon />
            ) : (
              <div style={{ maxHeight: 200, overflow: 'auto' }}>
                {activityDsl.activities.map((activity, index) => (
                  <Tag key={index} color="blue" style={{ margin: 2 }}>{activity.name}</Tag>
                ))}
              </div>
            )}
            </Card>
          </Col>
        </Row>

        <Card
          title={<Space size={6}><span>输出参数</span><Text type="secondary">（Workflow 返回值）</Text><Tooltip title="默认使用最后一个步骤的输出，也可以指定来源步骤。"><InfoCircleOutlined style={{ color: 'var(--text-light)' }} /></Tooltip></Space>}
          size="small"
          style={{ ...SECTION_CARD_STYLE, marginTop: 16, marginBottom: 16 }}
          styles={{ body: SECTION_CARD_BODY_STYLE }}
        >
        <div style={SOFT_PANEL_STYLE}>
          {Object.entries(workflowDsl.outputParams || {}).map(([key, param]) => (
            <Row key={key} gutter={8} style={{ marginBottom: 8, alignItems: 'center' }}>
              <Col span={4}>
                <Input value={key} disabled size="small" suffix={<Button size="small" danger type="text" onClick={() => { const newParams = { ...workflowDsl.outputParams }; delete newParams[key]; setWorkflowDsl({ ...workflowDsl, outputParams: newParams }); }}>×</Button>} />
              </Col>
              <Col span={6}>
                <Select value={param.sourceStep || '_last'} onChange={v => setWorkflowDsl({ ...workflowDsl, outputParams: { ...workflowDsl.outputParams, [key]: { ...param, sourceStep: v === '_last' ? undefined : v } } })} size="small" style={{ width: '100%' }}>
                  <Option value="_last">最后一个步骤</Option>
                  {workflowDsl.steps.map((step, idx) => (<Option key={step.id} value={step.id}>{step.name || `步骤 ${idx + 1}`}</Option>))}
                </Select>
              </Col>
              <Col span={8}>
                <Input value={param.description || ''} onChange={e => setWorkflowDsl({ ...workflowDsl, outputParams: { ...workflowDsl.outputParams, [key]: { ...param, description: e.target.value } } })} placeholder="参数描述" size="small" />
              </Col>
            </Row>
          ))}
          <Button size="small" type="dashed" onClick={() => { const key = prompt('请输入输出参数名:'); if (key && key.trim()) { setWorkflowDsl({ ...workflowDsl, outputParams: { ...workflowDsl.outputParams, [key.trim()]: { description: '', sourceStep: undefined } } }); } }} style={{ width: '100%' }}>+ 添加输出参数</Button>
        </div>
        </Card>

        <Card title="补足情报（指导 AI 代码生成）" size="small" style={SECTION_CARD_STYLE} styles={{ body: SECTION_CARD_BODY_STYLE }}>
          <Form.Item label={renderTipLabel('额外提示词', '补充上下文给 AI，帮助生成更准确的工作流代码。')} style={{ marginBottom: 0 }}>
            <Input.TextArea rows={3} placeholder="例如：&#10;- 该工作流需要处理中文内容，请使用 utf-8 编码&#10;- 返回结果需要包含完整的错误处理逻辑&#10;- 第三方 API 调用需要添加重试机制" value={workflowDsl.extraPrompt || ''} onChange={e => setWorkflowDsl({ ...workflowDsl, extraPrompt: e.target.value || undefined })} />
          </Form.Item>
        </Card>
      </Modal>

      <Modal title="验证工作流 DSL" open={validateModalVisible} onCancel={() => setValidateModalVisible(false)} footer={[<Button onClick={() => setValidateModalVisible(false)}>关闭</Button>]} width={700}>
        {validationResult ? (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Alert type={validationResult.isValid ? 'success' : 'error'} message={validationResult.isValid ? '验证通过' : '验证失败'} showIcon />
            <Card><Text><strong>评分:</strong> {validationResult.score}/100</Text></Card>
            {validationResult.errors.length > 0 && <Alert type="error" message="错误" description={<ul>{validationResult.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>} />}
            {validationResult.warnings.length > 0 && <Alert type="warning" message="警告" description={<ul>{validationResult.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>} />}
          </Space>
        ) : <Alert type="info" message="点击验证按钮开始验证" />}
      </Modal>

      <Modal title={<Space direction="vertical" size={0}><Text strong>AI 生成的 Workflow 代码</Text><Text type="secondary" style={{ fontSize: 12 }}>显示名称：{currentWorkflowDisplayName} ｜ 类名：{currentWorkflowClassName}</Text></Space>} open={codeModalVisible} onCancel={() => setCodeModalVisible(false)}
        footer={[
          <Button key="copy" icon={<CodeOutlined />} onClick={() => { navigator.clipboard.writeText(generatedCode || ''); message.success('已复制到剪贴板'); }}>复制代码</Button>,
          <Button key="close" onClick={() => setCodeModalVisible(false)}>关闭</Button>
        ]} width={900}>
        {generatedCode && (
          <pre style={{ background: '#1e1e1e', color: '#d4d4d4', padding: 16, borderRadius: 8, maxHeight: 500, overflow: 'auto', fontSize: 12, fontFamily: 'Monaco, Menlo, monospace' }}>
            {generatedCode}
          </pre>
        )}
      </Modal>

      <Modal title="真实验证结果" open={realValidationState.visible} onCancel={() => dispatchRealValidation({ type: 'CLOSE' })} footer={realValidationModalFooter} width={800}>
        <Space direction="vertical" style={{ width: '100%' }}>
          {realValidationState.isStreaming && <Alert type="info" message="真实验证进行中..." showIcon />}

          {/* 输入参数区域 - 仅在未运行时显示 */}
          {!realValidationState.isStreaming && (
            <Card size="small" style={{ marginBottom: 12 }}>
              {Object.keys(realValidationInputParams).length > 0 ? (
                <>
                  <Text strong>输入参数（请填写参数值）：</Text>
                  <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {Object.entries(realValidationInputParams).map(([key, value]) => (
                      <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Tag color="blue">{key}</Tag>
                        <Input
                          placeholder={`请输入 ${key}`}
                          value={value}
                          onChange={(e) => setRealValidationInputParams(prev => ({ ...prev, [key]: e.target.value }))}
                          style={{ width: 160 }}
                          size="small"
                        />
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <Text type="secondary">当前工作流没有可填写的输入参数，可直接开始真实验证。</Text>
              )}
              <Button
                type="primary"
                icon={<ExperimentOutlined />}
                onClick={handleRealValidation}
                style={{ marginTop: 12 }}
              >
                开始真实验证
              </Button>
            </Card>
          )}

          {realValidationState.result && (
            <>
              <Alert type={realValidationState.result.success ? 'success' : 'error'} message={realValidationState.result.success ? '真实验证通过' : '真实验证失败'} showIcon />
              <Card><Text><strong>评分:</strong> {realValidationState.result.score}/100</Text></Card>
              {realValidationState.result.error && <Alert type="error" message="错误" description={realValidationState.result.error} showIcon />}
              {realValidationState.result.result?.error && <Alert type="error" message="执行错误" description={String(realValidationState.result.result.error).substring(0, 500)} showIcon />}
              {realValidationState.result.result?.result && (
                <Card title="执行结果" size="small">
                  <pre style={{ maxHeight: 300, overflow: 'auto', fontSize: 11, margin: 0 }}>
                    {JSON.stringify(realValidationState.result.result.result, null, 2)}
                  </pre>
                </Card>
              )}
            </>
          )}
          <Card title="执行日志" size="small">
            <div style={{ maxHeight: 300, overflow: 'auto', fontFamily: 'monospace', fontSize: 11 }}>
              {realValidationState.logs.map((log, i) => <div key={i} style={{ marginBottom: 4 }}>{log}</div>)}
              {realValidationState.logs.length === 0 && !realValidationState.isStreaming && <Text type="secondary">暂无日志</Text>}
              {realValidationState.isStreaming && <Text type="secondary">等待更多日志...</Text>}
            </div>
          </Card>
        </Space>
      </Modal>
    </div>
  );
};

export default TemporalWorkflowPage;
