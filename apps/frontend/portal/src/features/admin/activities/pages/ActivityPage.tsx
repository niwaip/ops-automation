import React, { useReducer, useState, useEffect } from 'react';
import {
  Table, Card, Button, Input, Space, Tag, Typography, Modal, message, Form, Select,
  Alert, Collapse, Badge, Popconfirm, Statistic, Row, Col, Switch, InputNumber, Descriptions,
  Steps, Progress, Tooltip
} from 'antd';
import {
  SearchOutlined, PlusOutlined, DeleteOutlined, PlayCircleOutlined,
  ReloadOutlined, ApiOutlined, CodeOutlined, FileTextOutlined, ChromeOutlined,
  ThunderboltOutlined, LineChartOutlined, OrderedListOutlined, CopyOutlined,
  SaveOutlined, RobotOutlined, EyeOutlined, LoadingOutlined, LockOutlined, InfoCircleOutlined
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { activityApi, ActivityDTO, BuiltinActivityDTO, CreateActivityDto, UpdateActivityDto, ActivityValidationResult } from '@/api/activity';
import { ListSectionHeader } from '@/components/page/PageScaffold';
import { normalizeExecutionResult } from '@/api/execution-normalizer';
import type { ColumnsType } from 'antd/es/table';

const { Text, Title, Paragraph } = Typography;
const { Option } = Select;
const { Panel } = Collapse;
const { TextArea } = Input;
const MAX_LOG_LINES = 1000;
const VALIDATION_PHASES = ['准备环境', '代码就绪', '执行中', '完成'];
const DEFAULT_TASK_QUEUE = 'SKILL_TASK_QUEUE';
const DEFAULT_ACTIVITY_TIMEOUT = '60s';

const normalizeInputParams = (
  inputParams: Record<string, string> | ActivityInputParam[] | undefined
): ActivityInputParam[] => {
  if (!inputParams) {
    return [];
  }
  if (Array.isArray(inputParams)) {
    return inputParams.map((item) => ({
      key: item.key || '',
      value: item.value || '',
      required: Boolean(item.required),
    }));
  }
  return Object.entries(inputParams).map(([key, value]) => ({
    key,
    value: value || '',
    // Backward compatibility: no default value means user likely needs to provide it.
    required: !value,
  }));
};

const HANDLER_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  api: { label: 'API', color: 'green', icon: <ApiOutlined /> },
  carbone: { label: 'Carbone', color: 'blue', icon: <FileTextOutlined /> },
  browser: { label: '浏览器', color: 'purple', icon: <ChromeOutlined /> },
  script: { label: '脚本', color: 'orange', icon: <CodeOutlined /> },
};

const SECTION_CARD_STYLE: React.CSSProperties = {
  borderRadius: 16,
  border: '1px solid var(--bg-secondary)',
  boxShadow: 'var(--shadow-md)',
};

interface ActivityInputParam {
  key: string;
  value: string;
  required: boolean;
}

interface ActivityStep {
  id: string;
  name: string;
  type: 'api' | 'carbone' | 'browser' | 'script';
  timeout: string;
  config: Record<string, any>;
  // 输入参数（AI 根据这些生成代码）
  inputParams?: ActivityInputParam[];
  // 格式化指导（自然语言描述期望的输出格式）
  formatPrompt?: string;
  // 情报补足（额外要求，帮助 AI 更精确生成代码）
  extraPrompt?: string;
}

interface ActivityFormData {
  name: string;
  fn: string;
  description: string;  // AI guidance prompt for code generation
  isActive: boolean;
  startToCloseTimeout: string;
  steps: ActivityStep[];
}

interface ValidationStrategy {
  retryPolicy?: { maxRetries: number; backoffMs?: number };
}

const DEFAULT_VALIDATION_STRATEGY: ValidationStrategy = {
  retryPolicy: { maxRetries: 3, backoffMs: 1000 },
};

interface RealValidateState {
  visible: boolean;
  isRunning: boolean;
  logs: string[];
  error: string | null;
  result: any | null;
  inputParams: Record<string, string>; // 用户输入的参数值
  currentPhase: number;
  progress: number;
}

type RealValidateAction =
  | { type: 'OPEN'; payload?: Record<string, string> }
  | { type: 'START' }
  | { type: 'SET_PHASE'; payload: { phase: number; progress?: number } }
  | { type: 'APPEND_LOG'; payload: string }
  | { type: 'SET_ERROR'; payload: string }
  | { type: 'SET_RESULT'; payload: any }
  | { type: 'SET_INPUT_PARAMS'; payload: Record<string, string> }
  | { type: 'STOP' }
  | { type: 'CLOSE' };

const initialRealValidateState: RealValidateState = {
  visible: false,
  isRunning: false,
  logs: [],
  error: null,
  result: null,
  inputParams: {},
  currentPhase: 0,
  progress: 0,
};

const realValidateReducer = (
  state: RealValidateState,
  action: RealValidateAction
): RealValidateState => {
  switch (action.type) {
    case 'OPEN':
      return {
        ...state,
        visible: true,
        inputParams: action.payload || {},
        currentPhase: 0,
        progress: 0,
      };
    case 'START':
      return {
        ...state,
        visible: true,
        isRunning: true,
        logs: [],
        error: null,
        result: null,
        currentPhase: 0,
        progress: 10,
      };
    case 'SET_PHASE':
      return {
        ...state,
        currentPhase: action.payload.phase,
        progress: action.payload.progress ?? state.progress,
      };
    case 'APPEND_LOG':
      return {
        ...state,
        logs: [...state.logs.slice(-(MAX_LOG_LINES - 1)), action.payload],
      };
    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload,
        isRunning: false,
      };
    case 'SET_RESULT':
      return {
        ...state,
        result: action.payload,
        isRunning: false,
      };
    case 'SET_INPUT_PARAMS':
      return {
        ...state,
        inputParams: action.payload,
      };
    case 'STOP':
      return {
        ...state,
        isRunning: false,
      };
    case 'CLOSE':
      return {
        ...initialRealValidateState,
      };
    default:
      return state;
  }
};

const generatePythonCode = (form: ActivityFormData): string => {
  const lines: string[] = [];
  lines.push('# Generated by Temporal Activity Generator');
  lines.push('# See: docs/skills/temporal-developer/SKILL.md');
  lines.push('');
  lines.push('from datetime import timedelta');
  lines.push('from temporalio import activity');
  lines.push('from temporalio.exceptions import ApplicationError');
  lines.push('from typing import Optional, Dict, Any');
  lines.push('');
  lines.push('@activity.defn');
  lines.push(`def ${form.fn}(input_data: Dict[str, Any]) -> Dict[str, Any]:`);

  if (form.description) {
    lines.push(`    """`);
    lines.push(`    Activity: ${form.name}`);
    lines.push(`    `);
    lines.push(`    Description: ${form.description}`);
    lines.push(`    `);
    lines.push(`    """.replace('"', '\\"')`);
  } else {
    lines.push(`    """Activity: ${form.name}""".replace('"', '\\"')`);
  }

  lines.push('    activity.logger.info("Activity started")');

  lines.push('    activity.heartbeat("initializing")');

  if (form.steps.length > 0) {
    lines.push('    # Execute activity steps');
    form.steps.forEach((step, idx) => {
      lines.push('');
      lines.push(`    # === Step ${idx + 1}: ${step.name} ===`);
      lines.push(`    activity.heartbeat("executing_step_${idx + 1}")`);
      lines.push('    info = activity.info()');
      lines.push('    if info.is_cancelled:');
      lines.push('        activity.logger.warning("Activity cancelled")');
      lines.push('        return {"status": "cancelled", "step": ' + (idx + 1) + '}');

      if (step.type === 'api') {
        lines.push(`    try:`);
        lines.push(`        result_${idx + 1} = yield execute_api_request(`);
        lines.push(`            endpoint="${step.config.endpoint || 'https://api.example.com'}",`);
        lines.push(`            method="${step.config.method || 'GET'}"`);
        lines.push(`        )`);
        lines.push(`        activity.logger.info(f"Step ${idx + 1} completed: {result_${idx + 1}}")`);
        lines.push(`    except Exception as e:`);
        lines.push(`        activity.logger.error(f"Step ${idx + 1} failed: {e}")`);
        lines.push(`        raise ApplicationError(f"Step ${idx + 1} failed: {e}", non_retryable=False)`);
      } else if (step.type === 'script') {
        lines.push(`    result_${idx + 1} = yield execute_script(`);
        lines.push('        """');
        lines.push((step.config.script || '# your code here').split('\n').map((l: string) => `        ${l}`).join('\n'));
        lines.push('        """');
        lines.push('    )');
      } else if (step.type === 'carbone') {
        lines.push(`    result_${idx + 1} = yield render_with_carbone(`);
        lines.push(`        template_id="${step.config.templateId || '{{template_id}}'}",`);
        lines.push(`        data=input_data`);
        lines.push('    )');
      } else if (step.type === 'browser') {
        lines.push(`    result_${idx + 1} = yield execute_browser_action(`);
        lines.push(`        action="${step.config.action || 'click'}",`);
        lines.push(`        selector="${step.config.selector || '{{selector}}'}"`);
        lines.push('    )');
      }
    });
  }

  lines.push('');
  lines.push('    activity.heartbeat("completed")');
  lines.push('    return {');
  lines.push('        "status": "success",');
  lines.push(`        "activity": "${form.name}",`);
  if (form.steps.length > 0) {
    lines.push('        "results": {');
    form.steps.forEach((step, idx) => {
      lines.push(`            "${step.name}": result_${idx + 1}${idx < form.steps.length - 1 ? ',' : ''}`);
    });
    lines.push('        }');
  }
  lines.push('    }');

  return lines.join('\n');
};

const ActivityPage: React.FC = () => {
  const { t } = useTranslation(['common', 'admin']);
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const [searchText, setSearchText] = useState('');
  const [builtinSearchText, setBuiltinSearchText] = useState('');
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [validateModalVisible, setValidateModalVisible] = useState(false);
  const [codePreviewVisible, setCodePreviewVisible] = useState(false);
  const [editingActivity, setEditingActivity] = useState<ActivityDTO | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<ActivityDTO | null>(null);
  const [validationResult, setValidationResult] = useState<ActivityValidationResult | null>(null);
  const [generatedCode, setGeneratedCode] = useState<string>('');
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [realValidateState, dispatchRealValidate] = useReducer(
    realValidateReducer,
    initialRealValidateState
  );
  const [validateInputParams, setValidateInputParams] = useState<Record<string, string>>({}); // 真实验证时用户输入的参数
  const [cachedCode, setCachedCode] = useState<string | null>(null);
  const [isCachingCode, setIsCachingCode] = useState(false);
  const [validationStrategy, setValidationStrategy] = useState<ValidationStrategy>(DEFAULT_VALIDATION_STRATEGY);
  const [validateInputDefinitions, setValidateInputDefinitions] = useState<ActivityInputParam[]>([]);
  const [activityForm, setActivityForm] = useState<ActivityFormData>({
    name: '',
    fn: '',
    description: '',
    isActive: true,
    startToCloseTimeout: DEFAULT_ACTIVITY_TIMEOUT,
    steps: [],
  });

  const activitiesQuery = useQuery(['activities'], () => activityApi.list());
  const builtinActivitiesQuery = useQuery(['builtin-activities'], () => activityApi.listBuiltin());

  const appendRealValidateLog = (content: string) => {
    dispatchRealValidate({ type: 'APPEND_LOG', payload: content });
  };

  // 当真实验证弹窗打开时，同步输入参数到本地状态
  useEffect(() => {
    if (realValidateState.visible && Object.keys(realValidateState.inputParams).length > 0) {
      setValidateInputParams({ ...realValidateState.inputParams });
    }
  }, [realValidateState.visible]);

  const createMutation = useMutation(activityApi.create, {
    onSuccess: () => {
      message.success(t('common:success'));
      queryClient.invalidateQueries(['activities']);
      setEditModalVisible(false);
      form.resetFields();
      resetForm();
    },
    onError: (err: any) => { message.error(err?.message || t('common:error')); },
  });

  const updateMutation = useMutation(
    ({ id, data }: { id: string; data: UpdateActivityDto }) => activityApi.update(id, data),
    {
      onSuccess: () => {
        message.success(t('common:success'));
        queryClient.invalidateQueries(['activities']);
        setEditModalVisible(false);
      },
      onError: (err: any) => { message.error(err?.message || t('common:error')); },
    }
  );

  const deleteMutation = useMutation(activityApi.delete, {
    onSuccess: () => {
      message.success(t('common:success'));
      queryClient.invalidateQueries(['activities']);
    },
    onError: (err: any) => { message.error(err?.message || t('common:error')); },
  });

  const validateMutation = useMutation(activityApi.validate, {
    onSuccess: (result) => {
      setValidationResult(result);
      message.success('验证完成');
    },
    onError: (err: any) => { message.error(err?.message || '验证失败'); },
  });

  // 真实验证：使用 SSE 流式执行
  const handleRealValidate = async () => {
    const missingRequiredParams = getMissingRequiredInputParams();
    if (missingRequiredParams.length > 0) {
      message.error(`请先填写必填输入参数：${missingRequiredParams.join('、')}`);
      return;
    }

    dispatchRealValidate({ type: 'START' });
    dispatchRealValidate({ type: 'SET_PHASE', payload: { phase: 0, progress: 20 } });

    try {
      // 先拉取最新的代码（从服务器获取最新的 activity 配置）
      let code = cachedCode || generatedCode;
      appendRealValidateLog('正在获取最新代码...');

      // 如果有正在编辑的 activity，从服务器获取最新的 generatedCode
      if (editingActivity) {
        try {
          const latestActivity = await activityApi.getById(editingActivity.id);
          if (latestActivity.generatedCode) {
            code = latestActivity.generatedCode;
            setCachedCode(code);
            setGeneratedCode(code);
            appendRealValidateLog('已从服务器获取最新代码');
          }
        } catch (e) {
          appendRealValidateLog('获取最新代码失败，使用本地代码');
        }
      }

      dispatchRealValidate({ type: 'SET_PHASE', payload: { phase: 1, progress: 40 } });

      // 如果还是没有代码，则生成新代码
      if (!code) {
        appendRealValidateLog('正在生成代码...');
        const handler = activityForm.steps.length > 0 ? activityForm.steps[0].type : 'api';
        const genResult = await activityApi.generateCode({
          name: activityForm.name,
          fn: activityForm.fn,
          timeout: activityForm.startToCloseTimeout || DEFAULT_ACTIVITY_TIMEOUT,
          handler: handler as any,
          config: {
            description: activityForm.description,
            steps: activityForm.steps.map(s => ({
              ...s,
              formatPrompt: s.formatPrompt,
              inputParams: s.inputParams,
              extraPrompt: s.extraPrompt,
            })),
          },
        });
        if (!genResult.success || !genResult.code) {
          throw new Error(genResult.error || '代码生成失败');
        }
        code = genResult.code;
        setGeneratedCode(code);
        appendRealValidateLog('代码生成完成');
      }

      dispatchRealValidate({ type: 'SET_PHASE', payload: { phase: 2, progress: 60 } });

      // Execute with SSE streaming
      appendRealValidateLog('开始执行代码...');
      // 构建输入参数：只用用户填写的值（非空）
      const inputParams: Record<string, string> = {};
      Object.entries(validateInputParams).forEach(([key, value]) => {
        if (value && value.trim()) {
          inputParams[key] = value;
        }
      });
      appendRealValidateLog(`执行参数: ${JSON.stringify(inputParams)}`);
      await activityApi.executeCodeStream(
        {
          code,
          fn: activityForm.fn,
          taskQueue: DEFAULT_TASK_QUEUE,
          timeout: DEFAULT_ACTIVITY_TIMEOUT,
          retryPolicy: validationStrategy.retryPolicy,
          input: inputParams,
        },
        (event) => {
          if (event.type === 'log' && event.message) {
            appendRealValidateLog(event.message!);
          } else if (event.type === 'done') {
            dispatchRealValidate({ type: 'SET_PHASE', payload: { phase: 3, progress: 100 } });
            dispatchRealValidate({ type: 'SET_RESULT', payload: event.result });
            const normalized = normalizeExecutionResult(event.result, {
              defaultSuccessScore: 100,
              defaultFailureScore: 0,
            });
            if (!normalized.success && normalized.error) {
              dispatchRealValidate({ type: 'SET_ERROR', payload: normalized.error });
            } else if (normalized.success) {
              appendRealValidateLog('✓ 验证通过');
            }
          } else if (event.type === 'error') {
            dispatchRealValidate({ type: 'SET_ERROR', payload: event.message || '执行失败' });
          }
        }
      );
    } catch (err: any) {
      dispatchRealValidate({ type: 'SET_ERROR', payload: err?.message || '真实验证失败' });
    }
  };

  // 重新生成代码（带错误信息）- 生成后保存并重新验证
  const handleRegenerateWithError = async (errorMsg: string) => {
    dispatchRealValidate({ type: 'SET_ERROR', payload: errorMsg }); // Keep error visible
    setIsGeneratingCode(true);

    const handler = activityForm.steps.length > 0 ? activityForm.steps[0].type : 'api';

    try {
      // 调用生成API，传入错误上下文
      const result = await activityApi.generateCode({
        name: activityForm.name,
        fn: activityForm.fn,
        timeout: activityForm.startToCloseTimeout || DEFAULT_ACTIVITY_TIMEOUT,
        handler: handler as any,
        config: {
          description: activityForm.description,
          steps: activityForm.steps.map(s => ({
            ...s,
            formatPrompt: s.formatPrompt,
            inputParams: s.inputParams,
            extraPrompt: s.extraPrompt,
          })),
        },
      }, errorMsg); // 传入错误信息指导AI重新生成

      if (!result.success || !result.code) {
        message.error(result.error || '重新生成代码失败');
        setIsGeneratingCode(false);
        return;
      }

      setGeneratedCode(result.code);
      message.success('代码重新生成成功');

      // 如果有正在编辑的Activity，保存新代码到数据库
      if (editingActivity) {
        try {
          await activityApi.update(editingActivity.id, { generatedCode: result.code });
          setCachedCode(result.code);
          message.success('新代码已保存到数据库');
        } catch (e: any) {
          message.error('保存代码失败: ' + (e?.message || '未知错误'));
        }
      }

      setIsGeneratingCode(false);

      // 立即重新验证
      const missingRequiredParams = getMissingRequiredInputParams();
      if (missingRequiredParams.length > 0) {
        message.error(`请先填写必填输入参数：${missingRequiredParams.join('、')}`);
        return;
      }

      dispatchRealValidate({ type: 'START' });
      dispatchRealValidate({ type: 'SET_PHASE', payload: { phase: 1, progress: 40 } });

      appendRealValidateLog('代码已重新生成，开始验证...');

      // 构建输入参数
      const inputParams2: Record<string, string> = {};
      Object.entries(validateInputParams).forEach(([key, value]) => {
        if (value && value.trim()) {
          inputParams2[key] = value;
        }
      });

      await activityApi.executeCodeStream(
        {
          code: result.code,
          fn: activityForm.fn,
          taskQueue: DEFAULT_TASK_QUEUE,
          timeout: activityForm.startToCloseTimeout || DEFAULT_ACTIVITY_TIMEOUT,
          retryPolicy: validationStrategy.retryPolicy,
          input: inputParams2,
        },
        (event) => {
          if (event.type === 'log' && event.message) {
            appendRealValidateLog(event.message!);
          } else if (event.type === 'done') {
            dispatchRealValidate({ type: 'SET_RESULT', payload: event.result });
            const normalized = normalizeExecutionResult(event.result, {
              defaultSuccessScore: 100,
              defaultFailureScore: 0,
            });
            if (normalized.success) {
              appendRealValidateLog('✓ 验证通过');
            } else if (normalized.error) {
              dispatchRealValidate({ type: 'SET_ERROR', payload: normalized.error });
            }
          } else if (event.type === 'error') {
            dispatchRealValidate({ type: 'SET_ERROR', payload: event.message || '执行失败' });
          }
        }
      );
    } catch (err: any) {
      message.error(err?.message || '重新生成失败');
      setIsGeneratingCode(false);
    }
  };

  const handleGenerateCode = async () => {
    const handler = activityForm.steps.length > 0 ? activityForm.steps[0].type : 'api';
    setIsGeneratingCode(true);
    try {
      const result = await activityApi.generateCode({
        name: activityForm.name,
        fn: activityForm.fn,
        timeout: activityForm.startToCloseTimeout || DEFAULT_ACTIVITY_TIMEOUT,
        handler: handler as any,
        config: {
          description: activityForm.description,
          steps: activityForm.steps.map(s => ({
            ...s,
            formatPrompt: s.formatPrompt,
            inputParams: s.inputParams,
            extraPrompt: s.extraPrompt,
          })),
        },
      }); // 无错误上下文，初次生成
      if (result.success && result.code) {
        setGeneratedCode(result.code);
        dispatchRealValidate({ type: 'STOP' });
        setCodePreviewVisible(true);
      } else {
        message.error(result.error || '代码生成失败');
      }
    } catch (err: any) {
      message.error(err?.message || '代码生成失败');
    } finally {
      setIsGeneratingCode(false);
    }
  };

  const resetForm = () => {
    setActivityForm({
      name: '', fn: '', description: '', isActive: true,
      startToCloseTimeout: DEFAULT_ACTIVITY_TIMEOUT,
      steps: [],
    });
    setGeneratedCode('');
    setCachedCode(null);
    setValidateInputParams({});
    setValidateInputDefinitions([]);
    setValidationStrategy(DEFAULT_VALIDATION_STRATEGY);
  };

  const handleCreate = () => {
    setEditingActivity(null);
    resetForm();
    setEditModalVisible(true);
  };

  const handleEdit = async (activity: ActivityDTO) => {
    let latestActivity = activity;
    try {
      latestActivity = await activityApi.getById(activity.id);
    } catch {
      // Fall back to the list snapshot if the detail request fails.
    }

    setEditingActivity(latestActivity);
    const steps: ActivityStep[] = (latestActivity.config?.steps || []).map((step: ActivityStep) => ({
      ...step,
      inputParams: normalizeInputParams(step.inputParams),
    }));
    setActivityForm({
      name: latestActivity.name,
      fn: latestActivity.fn,
      description: latestActivity.config?.description || '',
      isActive: latestActivity.isActive,
      startToCloseTimeout: latestActivity.timeout || DEFAULT_ACTIVITY_TIMEOUT,
      steps,
    });
    setValidationStrategy(
      latestActivity.retryPolicy ? { retryPolicy: latestActivity.retryPolicy } : DEFAULT_VALIDATION_STRATEGY
    );
    if (latestActivity.generatedCode) {
      setGeneratedCode(latestActivity.generatedCode);
      setCachedCode(latestActivity.generatedCode);
    } else {
      setGeneratedCode('');
      setCachedCode(null);
    }
    setEditModalVisible(true);
  };

  const handleViewDetail = (activity: ActivityDTO) => {
    setSelectedActivity(activity);
    setDetailModalVisible(true);
  };

  const handleValidate = () => {
    setValidationResult(null);
    setValidateModalVisible(true);
    const handler = activityForm.steps.length > 0 ? activityForm.steps[0].type : 'api';
    validateMutation.mutate({
      name: activityForm.name,
      fn: activityForm.fn,
      timeout: activityForm.startToCloseTimeout || DEFAULT_ACTIVITY_TIMEOUT,
      handler: handler as any,
      config: {
        steps: activityForm.steps,
      },
    } as any);
  };

  const handleSave = () => {
    const handler = activityForm.steps.length > 0 ? activityForm.steps[0].type : 'api';
    // Use cached code if available, otherwise use state
    const codeToSave = cachedCode || generatedCode;
    const data: CreateActivityDto = {
      name: activityForm.name,
      fn: activityForm.fn,
      timeout: activityForm.startToCloseTimeout || DEFAULT_ACTIVITY_TIMEOUT,
      handler: handler as any,
      retryPolicy: null,
      isActive: activityForm.isActive,
      config: {
        description: activityForm.description,
        steps: activityForm.steps.map(s => ({
          ...s,
          formatPrompt: s.formatPrompt,
          inputParams: s.inputParams,
          extraPrompt: s.extraPrompt,
        })),
        generatedCode: codeToSave || undefined,
      },
    };

    if (editingActivity) {
      updateMutation.mutate({ id: editingActivity.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  // 仅缓存代码，不验证
  const handleCacheCode = async () => {
    if (!generatedCode) {
      message.warning('请先生成代码');
      return;
    }

    if (!editingActivity) {
      message.warning('请先保存 Activity 基本信息');
      return;
    }

    setIsCachingCode(true);
    try {
      await activityApi.update(editingActivity.id, { generatedCode });
      setCachedCode(generatedCode);
      message.success('代码已保存到数据库');
      setCodePreviewVisible(false);
    } catch (err: any) {
      message.error(err?.message || '保存代码失败');
    } finally {
      setIsCachingCode(false);
    }
  };

  const handleDelete = (id: string) => {
    Modal.confirm({
      title: t('common:confirmDelete'),
      content: '删除后无法恢复，是否继续？',
      onOk: () => deleteMutation.mutate(id),
    });
  };

  const updateActivityForm = (field: string, value: any) => {
    setActivityForm((prev) => ({ ...prev, [field]: value }));
  };

  const addStep = () => {
    const newStep: ActivityStep = {
      id: `step_${Date.now()}`,
      name: `步骤 ${activityForm.steps.length + 1}`,
      type: 'api',
      timeout: '30s',
      config: { endpoint: '', method: 'GET' },
      inputParams: [],
      formatPrompt: '',
      extraPrompt: '',
    };
    setActivityForm((prev) => ({ ...prev, steps: [...prev.steps, newStep] }));
  };

  const removeStep = (id: string) => {
    setActivityForm((prev) => ({ ...prev, steps: prev.steps.filter(s => s.id !== id) }));
  };

  const updateStep = (id: string, field: string, value: any) => {
    setActivityForm((prev) => ({
      ...prev,
      steps: prev.steps.map(s => s.id === id ? { ...s, [field]: value } : s)
    }));
  };

  const updateStepInputParam = (
    stepId: string,
    paramIdx: number,
    field: keyof ActivityInputParam,
    value: string | boolean
  ) => {
    const step = activityForm.steps.find((item) => item.id === stepId);
    if (!step) {
      return;
    }
    const nextParams = normalizeInputParams(step.inputParams).map((param, index) =>
      index === paramIdx ? { ...param, [field]: value } : param
    );
    updateStep(stepId, 'inputParams', nextParams);
  };

  const addStepInputParam = (stepId: string) => {
    const step = activityForm.steps.find((item) => item.id === stepId);
    if (!step) {
      return;
    }
    updateStep(stepId, 'inputParams', [
      ...normalizeInputParams(step.inputParams),
      { key: '', value: '', required: true },
    ]);
  };

  const removeStepInputParam = (stepId: string, paramIdx: number) => {
    const step = activityForm.steps.find((item) => item.id === stepId);
    if (!step) {
      return;
    }
    updateStep(
      stepId,
      'inputParams',
      normalizeInputParams(step.inputParams).filter((_, index) => index !== paramIdx)
    );
  };

  const collectInputParamsForValidation = (): ActivityInputParam[] => {
    const mergedParams = new Map<string, ActivityInputParam>();
    activityForm.steps.forEach((step) => {
      normalizeInputParams(step.inputParams).forEach((param) => {
        const normalizedKey = param.key.trim();
        if (!normalizedKey) {
          return;
        }
        const existing = mergedParams.get(normalizedKey);
        if (!existing) {
          mergedParams.set(normalizedKey, {
            key: normalizedKey,
            value: param.value || '',
            required: param.required,
          });
          return;
        }
        mergedParams.set(normalizedKey, {
          key: normalizedKey,
          value: existing.value || param.value || '',
          required: existing.required || param.required,
        });
      });
    });
    return Array.from(mergedParams.values());
  };

  const getMissingRequiredInputParams = (): string[] =>
    validateInputDefinitions
      .filter((param) => param.required && !(validateInputParams[param.key] || '').trim())
      .map((param) => param.key);

  const copyCode = () => {
    navigator.clipboard.writeText(generatedCode);
    message.success('代码已复制');
  };

  const columns: ColumnsType<ActivityDTO> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 220,
      align: 'center',
      render: (name, record) => (
        <Button
          type="link"
          style={{ paddingInline: 0, fontWeight: 700, height: 'auto' }}
          onClick={() => handleViewDetail(record)}
        >
          {name}
        </Button>
      ),
    },
    {
      title: '函数名',
      dataIndex: 'fn',
      key: 'fn',
      width: 180,
      align: 'center',
      render: (fn) => (
        <Text
          code
          style={{
            display: 'inline-block',
            padding: '3px 10px',
            borderRadius: 999,
            background: 'var(--bg-secondary)',
            fontSize: 12,
          }}
        >
          {fn}
        </Text>
      ),
    },
    {
      title: '处理器',
      key: 'handler',
      width: 110,
      align: 'center',
      render: (_, record) => (
        <Tag color={HANDLER_CONFIG[record.handler]?.color} style={{ marginInlineEnd: 0, paddingInline: 10, borderRadius: 999, fontWeight: 600 }}>
          {HANDLER_CONFIG[record.handler]?.label}
        </Tag>
      ),
    },
    {
      title: '步骤',
      key: 'steps',
      width: 90,
      align: 'center',
      render: (_, record) => (
        <Text strong>{record.config?.steps?.length || 0}</Text>
      ),
    },
    {
      title: '状态',
      key: 'status',
      width: 110,
      align: 'center',
      render: (_, record) => (
        <Tag
          color={record.isActive ? 'success' : 'default'}
          style={{ marginInlineEnd: 0, paddingInline: 10, borderRadius: 999, fontWeight: 600 }}
        >
          {record.isActive ? '启用' : '禁用'}
        </Tag>
      ),
    },
    {
      title: t('common:actions'),
      key: 'actions',
      width: 150,
      align: 'center',
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            style={{ paddingInline: 0, fontWeight: 600 }}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确认删除"
            onConfirm={() => handleDelete(record.id)}
            okText="删除"
            okButtonProps={{ danger: true }}
          >
            <Button type="link" danger style={{ paddingInline: 0, fontWeight: 600 }}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const builtinColumns: ColumnsType<BuiltinActivityDTO> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 220,
      align: 'center',
      render: (name) => <Text strong>{name}</Text>,
    },
    {
      title: '说明',
      dataIndex: 'description',
      key: 'description',
      width: 360,
      align: 'left',
      render: (desc) => <Text type="secondary">{desc || '无'}</Text>,
    },
    {
      title: '处理器',
      key: 'handler',
      width: 110,
      align: 'center',
      render: (_, record) => (
        <Tag color={HANDLER_CONFIG[record.handler]?.color} style={{ marginInlineEnd: 0, paddingInline: 10, borderRadius: 999, fontWeight: 600 }}>
          {HANDLER_CONFIG[record.handler]?.label}
        </Tag>
      ),
    },
    {
      title: '版本',
      dataIndex: 'version',
      key: 'version',
      width: 110,
      align: 'center',
      render: (version) => <Text strong>{version}</Text>,
    },
    {
      title: '模式',
      key: 'readonly',
      width: 120,
      align: 'center',
      render: () => (
        <Tag color="gold" style={{ marginInlineEnd: 0, paddingInline: 10, borderRadius: 999, fontWeight: 600 }}>
          只读内置
        </Tag>
      ),
    },
  ];

  const filteredActivities = (activitiesQuery.data || []).filter(a =>
    a.name.toLowerCase().includes(searchText.toLowerCase()) || a.fn.toLowerCase().includes(searchText.toLowerCase())
  );

  const userActivities = activitiesQuery.data || [];
  const builtinActivities = builtinActivitiesQuery.data || [];
  const filteredBuiltinActivities = builtinActivities.filter((activity) => {
    const keyword = builtinSearchText.trim().toLowerCase();
    if (!keyword) {
      return true;
    }
    return [
      activity.name,
      activity.description,
      activity.fn,
      activity.ref,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(keyword));
  });
  const countsSource = userActivities;
  const stats = {
    userCreated: countsSource.length,
    builtin: builtinActivities.length,
    active: countsSource.filter(a => a.isActive).length,
    visible: filteredActivities.length,
  };
  const activityOverviewStats = [
    {
      key: 'userCreated',
      label: '用户创建',
      value: stats.userCreated,
      color: 'var(--text-primary)',
      icon: <ThunderboltOutlined style={{ color: 'var(--text-secondary)' }} />,
    },
    {
      key: 'builtin',
      label: '系统内置',
      value: stats.builtin,
      color: 'var(--success-color)',
      icon: <LockOutlined style={{ color: 'var(--success-color)' }} />,
    },
    {
      key: 'active',
      label: '已启用',
      value: stats.active,
      color: 'var(--warning-color)',
      icon: <LineChartOutlined style={{ color: 'var(--warning-color)' }} />,
    },
    {
      key: 'visible',
      label: '当前显示',
      value: stats.visible,
      color: 'var(--info-color)',
      icon: <SearchOutlined style={{ color: 'var(--info-color)' }} />,
    },
  ];

  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 12,
          marginBottom: 16,
        }}
      >
        {activityOverviewStats.map((item) => (
          <Card
            key={item.key}
            size="small"
            style={{ ...SECTION_CARD_STYLE, borderRadius: 14 }}
            styles={{ body: { padding: '12px 16px' } }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <Space size={10} align="center">
                <span style={{ display: 'inline-flex', fontSize: 16 }}>{item.icon}</span>
                <Text type="secondary" style={{ fontSize: 13 }}>{item.label}</Text>
              </Space>
              <Text style={{ fontSize: 24, fontWeight: 700, color: item.color, lineHeight: 1 }}>
                {item.value}
              </Text>
            </div>
          </Card>
        ))}
      </div>

      <Card style={SECTION_CARD_STYLE}>
        <ListSectionHeader
          title={(
            <Space wrap size={12}>
              <Text strong style={{ fontSize: 16 }}>用户创建工作单元</Text>
              <Input
                size="large"
                placeholder="搜索工作单元名称或函数名..."
                prefix={<SearchOutlined />}
                variant="borderless"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                style={{
                  width: 360,
                  height: 44,
                  background: 'var(--bg-secondary)',
                  borderRadius: 12,
                }}
                allowClear
              />
            </Space>
          )}
          extra={(
            <Space wrap size={12}>
              <Text type="secondary">当前显示 {filteredActivities.length} 条</Text>
              <Button size="large" icon={<ReloadOutlined />} onClick={() => { void activitiesQuery.refetch(); }} className="btn-pill">
                刷新
              </Button>
              <Button size="large" icon={<PlusOutlined />} type="primary" onClick={handleCreate} className="btn-pill">
                创建
              </Button>
            </Space>
          )}
        />
        <Table columns={columns} dataSource={filteredActivities} rowKey="id" loading={activitiesQuery.isLoading} pagination={{ showSizeChanger: true, showTotal: total => `共 ${total} 条` }} />
      </Card>

      <Card style={{ ...SECTION_CARD_STYLE, marginTop: 16 }}>
        <Collapse
          ghost
          defaultActiveKey={[]}
          items={[
            {
              key: 'builtin-activities',
              label: (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    width: '100%',
                    paddingRight: 8,
                    flexWrap: 'wrap',
                  }}
                >
                  <Space size={8} align="center">
                    <Text strong style={{ fontSize: 16 }}>系统内置工作单元</Text>
                    <Tooltip title="模板工作流无需预先创建 Carbone Activity；系统提供内置 documentRender Activity，后续也会在这里统一展示更多内置能力">
                      <InfoCircleOutlined style={{ color: 'var(--text-secondary)' }} />
                    </Tooltip>
                  </Space>
                  <Text type="secondary">共 {builtinActivities.length} 条</Text>
                </div>
              ),
              children: (
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  <Input
                    size="large"
                    placeholder="搜索内置工作单元名称或说明..."
                    prefix={<SearchOutlined />}
                    variant="borderless"
                    value={builtinSearchText}
                    onChange={(e) => setBuiltinSearchText(e.target.value)}
                    style={{
                      width: 360,
                      height: 44,
                      background: 'var(--bg-secondary)',
                      borderRadius: 12,
                    }}
                    allowClear
                  />
                  <Table
                    columns={builtinColumns}
                    dataSource={filteredBuiltinActivities}
                    rowKey="ref"
                    loading={builtinActivitiesQuery.isLoading}
                    pagination={false}
                    expandable={{
                      expandedRowRender: (record) => (
                        <Descriptions
                          column={1}
                          size="small"
                          styles={{ content: { paddingBottom: 8 }, label: { width: 96 } }}
                        >
                          <Descriptions.Item label="说明">{record.description || '无'}</Descriptions.Item>
                          <Descriptions.Item label="默认超时">{record.timeout}</Descriptions.Item>
                          <Descriptions.Item label="重试策略">
                            {record.retryPolicy?.maxRetries !== undefined
                              ? `maxRetries=${record.retryPolicy.maxRetries}, backoffMs=${record.retryPolicy.backoffMs ?? 1000}`
                              : '未设置'}
                          </Descriptions.Item>
                        </Descriptions>
                      ),
                    }}
                  />
                </Space>
              ),
            },
          ]}
        />
      </Card>

      {/* Edit Modal */}
      <Modal
        title={
          <div style={{ textAlign: 'center', width: '100%' }}>
            <Space direction="vertical" size={2}>
              <Space size={8}>
                <ThunderboltOutlined style={{ color: 'var(--primary-color)' }} />
                <Text strong style={{ fontSize: 18 }}>
                  {editingActivity ? '编辑 Activity' : '创建 Activity'}
                </Text>
              </Space>
              <Text type="secondary" style={{ fontSize: 12 }}>
                维护基础信息、步骤编排与输入参数配置
              </Text>
            </Space>
          </div>
        }
        open={editModalVisible}
        onCancel={() => setEditModalVisible(false)}
        footer={null}
        width={1000}
        destroyOnHidden
      >
        <Form layout="vertical">
          {/* Basic Info */}
          <Card
            size="small"
            style={{ ...SECTION_CARD_STYLE, marginBottom: 16 }}
            styles={{ body: { padding: 20 } }}
          >
            <Title level={5} style={{ marginTop: 0, marginBottom: 16 }}>基础信息</Title>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label="名称" required style={{ marginBottom: 12 }}>
                  <Input value={activityForm.name} onChange={e => updateActivityForm('name', e.target.value)} placeholder="示例数据查询" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="函数名" required style={{ marginBottom: 12 }}>
                  <Space style={{ width: '100%' }} size="middle">
                    <Input value={activityForm.fn} onChange={e => updateActivityForm('fn', e.target.value)} placeholder="queryExternalData" />
                    <Space size={8}>
                      <Switch
                        checked={activityForm.isActive}
                        onChange={(checked) => updateActivityForm('isActive', checked)}
                      />
                      <Text type="secondary" style={{ whiteSpace: 'nowrap' }}>
                        {activityForm.isActive ? '已启用' : '已禁用'}
                      </Text>
                    </Space>
                  </Space>
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={24}>
                <Form.Item label="AI 指导说明（描述这个 Activity 的功能，让 AI 生成更准确的代码）" style={{ marginBottom: 0 }}>
                  <TextArea value={activityForm.description} onChange={e => updateActivityForm('description', e.target.value)} placeholder="例如：这是一个通用查询 Activity，接收输入参数后调用外部接口并返回结果..." rows={2} />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          {/* Steps */}
          <Card size="small" style={{ ...SECTION_CARD_STYLE, marginBottom: 16 }}>
            <Title level={5} style={{ marginBottom: 12 }}><OrderedListOutlined /> 步骤列表</Title>
            <Button type="dashed" icon={<PlusOutlined />} onClick={addStep} block style={{ marginBottom: 12 }}>
              添加步骤
            </Button>
            {activityForm.steps.length === 0 ? (
              <Text type="secondary">添加步骤来定义 Activity 的执行流程</Text>
            ) : (
              <Collapse
                defaultActiveKey={activityForm.steps[0] ? [`step-${activityForm.steps[0].id}`] : []}
                style={{ background: 'transparent' }}
              >
                {activityForm.steps.map((step, idx) => (
                  <Panel
                    key={`step-${step.id}`}
                    header={
                      <Space size="middle">
                        <Badge count={idx + 1} style={{ backgroundColor: 'var(--primary-color)', boxShadow: '0 0 0 2px var(--bg-card)' }} />
                        <Text strong>{step.name || `步骤 ${idx + 1}`}</Text>
                        <Tag color={HANDLER_CONFIG[step.type]?.color}>{HANDLER_CONFIG[step.type]?.label}</Tag>
                      </Space>
                    }
                  >
                    <Card
                      size="small"
                      style={{
                        border: '1px solid var(--bg-secondary)',
                        borderRadius: 12,
                        boxShadow: 'var(--shadow-sm)',
                        overflow: 'hidden',
                        background: 'var(--bg-card)',
                      }}
                      styles={{ body: { padding: 16 } }}
                    >
                  {/* 第一行：步骤名、操作类型、超时 */}
                  <Row gutter={12} align="middle" style={{ marginBottom: 12 }}>
                    <Col flex={1}>
                      <Space size="middle" wrap>
                        <Input
                          value={step.name}
                          onChange={e => updateStep(step.id, 'name', e.target.value)}
                          placeholder="步骤名称"
                          style={{ width: 200, borderRadius: 6 }}
                          size="middle"
                        />
                        <Select value={step.type} onChange={v => updateStep(step.id, 'type', v)} style={{ width: 100, borderRadius: 6 }} size="middle">
                          <Option value="api">API</Option>
                          <Option value="script">脚本</Option>
                          <Option value="carbone">Carbone</Option>
                          <Option value="browser">浏览器</Option>
                        </Select>
                        <Input
                          value={step.timeout}
                          onChange={e => updateStep(step.id, 'timeout', e.target.value)}
                          placeholder="超时"
                          style={{ width: 70, borderRadius: 6 }}
                          size="middle"
                        />
                      </Space>
                    </Col>
                    <Col>
                      <Button type="text" danger icon={<DeleteOutlined />} onClick={() => removeStep(step.id)} />
                    </Col>
                  </Row>

                  {/* API 类型配置 */}
                  {step.type === 'api' && (
                    <div style={{ padding: 12, background: 'rgba(16, 185, 129, 0.08)', borderRadius: 8, border: '1px solid rgba(16, 185, 129, 0.35)' }}>
                      {/* 输入参数区域 - 小标签形式 */}
                      <div style={{ marginBottom: 12 }}>
                        <Text type="secondary" style={{ fontSize: 12, marginBottom: 8, display: 'block' }}>
                          <ApiOutlined style={{ marginRight: 4 }} />输入参数（支持 key / 默认值 / 必填，点击标签插入 URL）：
                        </Text>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {normalizeInputParams(step.inputParams)
                            .filter((param) => param.key.trim())
                            .map((param, paramIdx) => (
                            <Tag
                              key={paramIdx}
                              style={{
                                padding: '4px 10px',
                                fontSize: 13,
                                background: param.value ? 'rgba(16, 185, 129, 0.12)' : 'var(--bg-secondary)',
                                border: `1px solid ${param.required ? 'rgba(16, 185, 129, 0.45)' : 'var(--bg-secondary)'}`,
                                borderRadius: 4,
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                color: param.required ? 'var(--success-color)' : 'var(--text-secondary)',
                              }}
                              onClick={() => {
                                const urlInput = document.getElementById(`url-input-${step.id}`) as HTMLInputElement;
                                if (urlInput) {
                                  const start = urlInput.selectionStart || urlInput.value.length;
                                  const end = urlInput.selectionEnd || urlInput.value.length;
                                  const currentUrl = step.config.endpoint || '';
                                  const before = currentUrl.substring(0, start);
                                  const after = currentUrl.substring(end);
                                  const insertText = `{${param.key}}`;
                                  const newUrl = before + insertText + after;
                                  updateStep(step.id, 'config', { ...step.config, endpoint: newUrl });
                                  // Set cursor position after inserted text
                                  setTimeout(() => {
                                    urlInput.focus();
                                    urlInput.setSelectionRange(start + insertText.length, start + insertText.length);
                                  }, 0);
                                }
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = param.required ? 'var(--success-color)' : 'var(--primary-color)';
                                e.currentTarget.style.color = 'white';
                                e.currentTarget.style.borderColor = param.required ? 'var(--success-color)' : 'var(--primary-color)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = param.value ? 'rgba(16, 185, 129, 0.12)' : 'var(--bg-secondary)';
                                e.currentTarget.style.color = param.required ? 'var(--success-color)' : 'var(--text-secondary)';
                                e.currentTarget.style.borderColor = param.required ? 'rgba(16, 185, 129, 0.45)' : 'var(--bg-secondary)';
                              }}
                            >
                              {`{${param.key}}`}
                              {param.value ? ` = ${param.value}` : ''}
                              {param.required ? ' · 必填' : ' · 可选'}
                            </Tag>
                          ))}
                        </div>
                        <div style={{ marginTop: 12 }}>
                          {normalizeInputParams(step.inputParams).length === 0 ? (
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              暂无输入参数，添加后可直接参与 URL 模板、代码生成和真实验证。
                            </Text>
                          ) : (
                            <Row gutter={[12, 12]}>
                              {normalizeInputParams(step.inputParams).map((param, paramIdx) => (
                                <Col span={12} key={`${step.id}-${paramIdx}`}>
                                  <Card size="small" style={{ borderRadius: 10, background: 'var(--bg-card)', border: '1px solid var(--bg-secondary)' }}>
                                    <Row gutter={[8, 8]} align="middle">
                                      <Col span={9}>
                                        <Input
                                          placeholder="参数 key"
                                          value={param.key}
                                          onChange={(e) => updateStepInputParam(step.id, paramIdx, 'key', e.target.value)}
                                          style={{ width: '100%', borderRadius: 6 }}
                                          size="small"
                                        />
                                      </Col>
                                      <Col span={11}>
                                        <Input
                                          placeholder="默认值（可选）"
                                          value={param.value}
                                          onChange={(e) => updateStepInputParam(step.id, paramIdx, 'value', e.target.value)}
                                          style={{ width: '100%', borderRadius: 6 }}
                                          size="small"
                                        />
                                      </Col>
                                      <Col span={4} style={{ textAlign: 'right' }}>
                                        <Space size={4}>
                                          <Switch
                                            checked={param.required}
                                            onChange={(checked) => updateStepInputParam(step.id, paramIdx, 'required', checked)}
                                            size="small"
                                          />
                                          <Button
                                            size="small"
                                            danger
                                            type="text"
                                            icon={<DeleteOutlined />}
                                            onClick={() => removeStepInputParam(step.id, paramIdx)}
                                          />
                                        </Space>
                                      </Col>
                                      <Col span={24}>
                                        <Text type="secondary" style={{ fontSize: 12 }}>
                                          {param.required ? '必填参数' : '可选参数'}
                                        </Text>
                                      </Col>
                                    </Row>
                                  </Card>
                                </Col>
                              ))}
                            </Row>
                          )}
                          <Button size="small" type="dashed" onClick={() => addStepInputParam(step.id)} style={{ marginTop: 8 }}>
                            添加输入参数
                          </Button>
                        </div>
                      </div>

                      {/* URL 区域 */}
                      <Input
                        id={`url-input-${step.id}`}
                        value={step.config.endpoint || ''}
                        onChange={e => updateStep(step.id, 'config', { ...step.config, endpoint: e.target.value })}
                        placeholder="https://api.example.com/resource?query={keyword}"
                        prefix={<ApiOutlined />}
                        style={{ marginBottom: 12, borderRadius: 6 }}
                      />

                      {/* 输出格式 */}
                      <Text type="secondary" style={{ fontSize: 12, marginBottom: 6, display: 'block' }}>
                        输出格式（AI 根据此生成格式化代码）：
                      </Text>
                      <TextArea
                        value={step.formatPrompt || ''}
                        onChange={e => updateStep(step.id, 'formatPrompt', e.target.value)}
                        placeholder="例如：返回摘要、状态码和结构化字段"
                        rows={2}
                        style={{ fontFamily: 'monospace', marginBottom: 12, borderRadius: 6 }}
                      />

                      {/* 情报补足 */}
                      <Text type="secondary" style={{ fontSize: 12, marginBottom: 6, display: 'block' }}>
                        情报补足（额外要求，帮助 AI 更精确生成代码）：
                      </Text>
                      <TextArea
                        value={step.extraPrompt || ''}
                        onChange={e => updateStep(step.id, 'extraPrompt', e.target.value)}
                        placeholder="例如：API 返回的是 JSON 格式，需要从中提取 current_condition 数组的第一个元素的 temp_C 字段"
                        rows={2}
                        style={{ fontFamily: 'monospace', borderRadius: 6 }}
                      />
                    </div>
                  )}

                  {/* 脚本类型配置 */}
                  {step.type === 'script' && (
                    <div style={{ padding: 12, background: 'rgba(245, 158, 11, 0.08)', borderRadius: 8, border: '1px solid rgba(245, 158, 11, 0.35)' }}>
                      <TextArea
                        value={step.config.script || ''}
                        onChange={e => updateStep(step.id, 'config', { ...step.config, script: e.target.value })}
                        placeholder="// 代码..."
                        rows={3}
                        style={{ fontFamily: 'monospace', borderRadius: 6 }}
                      />
                    </div>
                  )}
                    </Card>
                  </Panel>
                ))}
              </Collapse>
            )}
          </Card>

          {/* Actions */}
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button icon={<RobotOutlined />} onClick={handleGenerateCode} loading={isGeneratingCode}>AI 生成代码</Button>
            <Button icon={<EyeOutlined />} onClick={() => setCodePreviewVisible(true)} disabled={!generatedCode}>查看代码</Button>
            <Button icon={<PlayCircleOutlined />} onClick={handleValidate}>验证配置</Button>
            <Button icon={<ThunderboltOutlined />} onClick={() => {
              const mergedInputParams = collectInputParamsForValidation();
              const allInputParams = mergedInputParams.reduce<Record<string, string>>((acc, param) => {
                acc[param.key] = param.value || '';
                return acc;
              }, {});
              setValidateInputDefinitions(mergedInputParams);
              setValidateInputParams(allInputParams);
              dispatchRealValidate({ type: 'OPEN', payload: allInputParams });
            }} disabled={!cachedCode && !generatedCode}>真实验证</Button>
            <Button type="primary" icon={<SaveOutlined />} loading={createMutation.isLoading || updateMutation.isLoading} onClick={handleSave}>保存</Button>
          </Space>
        </Form>
      </Modal>

      {/* Code Preview Modal */}
      <Modal
        title={<Space><RobotOutlined /> AI 生成的 Python 代码</Space>}
        open={codePreviewVisible}
        onCancel={() => { setCodePreviewVisible(false); setIsGeneratingCode(false); }}
        footer={[
          <Button key="copy" icon={<CopyOutlined />} onClick={copyCode}>复制代码</Button>,
          <Button key="cache" type="primary" icon={<SaveOutlined />} onClick={handleCacheCode} loading={isCachingCode}>
            保存代码
          </Button>,
          <Button key="close" onClick={() => { setCodePreviewVisible(false); setIsGeneratingCode(false); }}>关闭</Button>
        ]}
        width={800}
      >
        <Paragraph type="secondary" style={{ marginBottom: 16 }}>
          以下代码由 AI 根据您的配置自动生成，可用于参考或复制到 Temporal Worker 中使用。点击"缓存代码"可保存到配置中。
        </Paragraph>
        <Card styles={{ body: { padding: 0 } }} style={{ background: 'var(--bg-primary)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
          {isGeneratingCode ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
              <LoadingOutlined style={{ fontSize: 24 }} /><br /><br />
              正在生成代码，请稍候...
            </div>
          ) : (
            <pre style={{ color: 'var(--text-primary)', padding: 16, margin: 0, fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace', fontSize: 12, lineHeight: 1.5, overflow: 'auto', maxHeight: 500, background: 'transparent' }}>
              {generatedCode || generatePythonCode(activityForm)}
            </pre>
          )}
        </Card>
      </Modal>

      {/* Detail Modal */}
      <Modal title="详情" open={detailModalVisible} onCancel={() => setDetailModalVisible(false)} footer={null} width={700}>
        {selectedActivity && (
          <Collapse defaultActiveKey={['basic', 'steps']} style={{ background: 'transparent' }}>
            <Panel header={<Text><ThunderboltOutlined /> 基本信息</Text>} key="basic">
              <Descriptions
                column={2}
                size="small"
                styles={{ content: { paddingBottom: 8 }, label: { width: 84 } }}
              >
                <Descriptions.Item label="名称">{selectedActivity.name}</Descriptions.Item>
                <Descriptions.Item label="函数名"><Tag color="cyan">{selectedActivity.fn}</Tag></Descriptions.Item>
                <Descriptions.Item label="状态">
                  <Tag color={selectedActivity.isActive ? 'green' : 'default'}>
                    {selectedActivity.isActive ? '启用' : '禁用'}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Start-To-Close">{selectedActivity.timeout}</Descriptions.Item>
                <Descriptions.Item label="Schedule-To-Close">{selectedActivity.config?.scheduleToCloseTimeout || '未设置'}</Descriptions.Item>
                <Descriptions.Item label="Heartbeat">{selectedActivity.config?.heartbeatTimeout || '未设置'}</Descriptions.Item>
                <Descriptions.Item label="说明" span={2}>
                  {selectedActivity.config?.description || '无'}
                </Descriptions.Item>
              </Descriptions>
            </Panel>
            <Panel header={<Text><OrderedListOutlined /> 步骤详情 ({selectedActivity.config?.steps?.length || 0})</Text>} key="steps">
              {selectedActivity.config?.steps?.map((step: any, idx: number) => (
                <Card key={idx} size="small" style={{ marginBottom: 8, borderRadius: 10, border: '1px solid var(--bg-secondary)', background: 'var(--bg-card)' }}>
                  <Text strong>步骤 {idx + 1}: {step.name}</Text>
                  <br />
                  <Text type="secondary">类型: {step.type} | 超时: {step.timeout}</Text>
                  {step.type === 'api' && <div><Text type="secondary">端点: {step.config?.endpoint}</Text></div>}
                </Card>
              ))}
            </Panel>
            <Panel header={<Text><LineChartOutlined /> 监控</Text>} key="monitoring">
              <Row gutter={16}>
                <Col span={8}><Card size="small"><Statistic title="平均耗时" value="1.2s" /></Card></Col>
                <Col span={8}><Card size="small"><Statistic title="失败率" value="0.5%" valueStyle={{ color: 'var(--success-color)' }} /></Card></Col>
                <Col span={8}><Card size="small"><Statistic title="Backlog" value="12" /></Card></Col>
              </Row>
            </Panel>
          </Collapse>
        )}
      </Modal>

      {/* Validation Modal */}
      <Modal title="验证结果" open={validateModalVisible} onCancel={() => setValidateModalVisible(false)} footer={[<Button onClick={() => setValidateModalVisible(false)}>关闭</Button>]}>
        {validateMutation.isLoading ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <LoadingOutlined style={{ fontSize: 24 }} /><br /><br />
            正在验证配置，请稍候...
          </div>
        ) : validationResult ? (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Alert type={validationResult.isValid ? 'success' : 'error'} message={validationResult.isValid ? '验证通过' : '验证失败'} showIcon />
            <Text>评分: {validationResult.score}/100</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              说明：验证仅检查配置结构有效性，不执行生成的 Python 代码。生成的代码可直接复制到 Temporal Worker 使用。
            </Text>
            {validationResult.errors?.length > 0 && <Alert type="error" message="错误" description={<ul>{validationResult.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>} />}
            {validationResult.warnings?.length > 0 && <Alert type="warning" message="警告" description={<ul>{validationResult.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>} />}
            {validationResult.suggestions?.length > 0 && <Alert type="info" message="建议" description={<ul>{validationResult.suggestions.map((s, i) => <li key={i}>{s}</li>)}</ul>} />}
          </Space>
        ) : <Alert type="info" message="点击验证按钮开始验证" />}
      </Modal>

      {/* Real Validation Modal - SSE 流式执行真实代码 */}
      <Modal
        title={<Space><ThunderboltOutlined /> 真实验证（执行代码）</Space>}
        open={realValidateState.visible}
        onCancel={() => dispatchRealValidate({ type: 'CLOSE' })}
        footer={[<Button onClick={() => dispatchRealValidate({ type: 'CLOSE' })}>关闭</Button>]}
        width={800}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          {/* 进度展示 */}
          {realValidateState.isRunning && (
            <div style={{ marginBottom: 24 }}>
              <Steps
                current={realValidateState.currentPhase}
                size="small"
                items={VALIDATION_PHASES.map((title) => ({ title }))}
              />
              <Progress
                percent={realValidateState.progress}
                status={realValidateState.error ? 'exception' : 'active'}
                strokeColor={{ '0%': '#108ee9', '100%': '#87d068' }}
                style={{ marginTop: 16 }}
              />
            </div>
          )}

          {realValidateState.error && (
            <Alert
              type="error"
              message="执行失败"
              description={
                <div>
                  <pre style={{ margin: '8px 0', fontSize: 12, whiteSpace: 'pre-wrap' }}>{realValidateState.error}</pre>
                  <Button
                    type="primary"
                    icon={<RobotOutlined />}
                    onClick={() => handleRegenerateWithError(realValidateState.error!)}
                    loading={isGeneratingCode}
                    style={{ marginTop: 8 }}
                  >
                    重新生成代码
                  </Button>
                </div>
              }
              showIcon
            />
          )}

          {realValidateState.result && !realValidateState.error && (
            <Alert
              type={realValidateState.result.success ? 'success' : 'error'}
              message={realValidateState.result.success ? '执行成功' : '执行失败'}
              showIcon
            />
          )}

          {/* 输入参数区域 - 仅在未运行时显示 */}
          {!realValidateState.isRunning && (
            <Card size="small" style={{ marginBottom: 12 }}>
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <div>
                  <Text strong>验证策略</Text>
                  <Space wrap style={{ marginTop: 8 }}>
                    <Text type="secondary">最大重试次数</Text>
                    <InputNumber
                      min={0}
                      max={10}
                      value={validationStrategy.retryPolicy?.maxRetries ?? 0}
                      onChange={(value) =>
                        setValidationStrategy({
                          retryPolicy: {
                            maxRetries: value ?? 0,
                            backoffMs: validationStrategy.retryPolicy?.backoffMs ?? 1000,
                          },
                        })
                      }
                      size="small"
                    />
                    <Text type="secondary">退避毫秒</Text>
                    <InputNumber
                      min={0}
                      step={100}
                      value={validationStrategy.retryPolicy?.backoffMs ?? 0}
                      onChange={(value) =>
                        setValidationStrategy({
                          retryPolicy: {
                            maxRetries: validationStrategy.retryPolicy?.maxRetries ?? 0,
                            backoffMs: value ?? 0,
                          },
                        })
                      }
                      size="small"
                    />
                  </Space>
                </div>
                {validateInputDefinitions.length > 0 && (
                  <div>
                    <Text strong>输入参数（请填写参数值）</Text>
                    <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {validateInputDefinitions.map((param) => (
                        <div key={param.key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Tag color={param.required ? 'green' : 'blue'}>
                            {param.key}
                            {param.required ? ' *' : ''}
                          </Tag>
                          <Input
                            placeholder={param.required ? `请输入 ${param.key}（必填）` : `请输入 ${param.key}`}
                            value={validateInputParams[param.key] ?? ''}
                            onChange={(e) =>
                              setValidateInputParams((prev) => ({ ...prev, [param.key]: e.target.value }))
                            }
                            style={{ width: 180 }}
                            size="small"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Space>
            </Card>
          )}

          <div>
            <Text strong>执行日志：</Text>
            <div style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', padding: 12, borderRadius: 4, maxHeight: 300, overflow: 'auto', marginTop: 8, border: '1px solid var(--border-color)' }}>
              <pre style={{ margin: 0, fontSize: 11 }}>
                {realValidateState.logs.map((log: string, i: number) => (
                  <div key={i}>{log}</div>
                ))}
                {realValidateState.isRunning && <span style={{ color: 'var(--primary-color)' }}>▋</span>}
              </pre>
            </div>
          </div>

          {realValidateState.result && !realValidateState.error && realValidateState.result.result && (
            <Collapse
              defaultActiveKey={[]}
              style={{ background: 'transparent' }}
              items={[
                {
                  key: 'execute-result',
                  label: <Text strong>执行结果</Text>,
                  children: (
                    <Card size="small" style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-secondary)' }}>
                      <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                        {typeof realValidateState.result.result === 'string' ? realValidateState.result.result : JSON.stringify(realValidateState.result.result, null, 2)}
                      </pre>
                    </Card>
                  ),
                },
              ]}
            />
          )}

          {!realValidateState.isRunning && !realValidateState.result && !realValidateState.error && (
            <Alert type="info" message="真实验证将执行以下步骤：" description={
              <ul style={{ margin: '8px 0' }}>
                <li>1. 使用已保存的代码（如有）</li>
                <li>2. 或重新生成最新 AI 代码</li>
                <li>3. 将代码发送到 Temporal Worker 执行</li>
                <li>4. 实时返回执行日志</li>
              </ul>
            } />
          )}

          {!realValidateState.isRunning && (
            <Button
              type="primary"
              icon={<ThunderboltOutlined />}
              onClick={handleRealValidate}
              loading={isGeneratingCode}
            >
              {generatedCode ? '使用已有代码执行' : '生成代码并执行'}
            </Button>
          )}
        </Space>
      </Modal>
    </div>
  );
};

export default ActivityPage;
