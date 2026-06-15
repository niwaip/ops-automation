/**
 * ExecutionDetailPage
 * View execution details and steps
 * Phase 4: Portal Execution views
 */

import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Tag, Button, Space, Typography, Spin, Alert, Table, Steps, Form, Timeline, Image, Carousel, message } from 'antd';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import '@/features/chat/ChatMessage.css';
import { resolveExecutionNormalizedResult } from '@ops/user-core';
import {
  ArrowLeftOutlined,
  WarningOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import {
  executionApi,
 ExecutionDto,
  ExecutionPhaseDto,
  ExecutionStepDto,
} from '@/api/execution';
import { runtimeSessionApi } from '@/api/runtimeSession';
import { skillApi } from '@/api/skill';
import { capabilityReleaseApi } from '@/api/capabilities';
import SemanticOverviewCard from '@/features/executions/components/SemanticOverviewCard';
import TimelineNodeCard from '@/features/executions/components/TimelineNodeCard';
import {
  buildBrowserOutputDisplay,
  extractBrowserExecutionResult,
  hasBrowserExecutionEvidence,
} from '@/features/executions/lib/browser';
import { asRecord, hasMeaningfulExecutionResult, tryParseJsonValue } from '@/features/executions/lib/common';
import {
  extractPhaseStepImageSources,
  extractWorkflowActivitySnapshotSources,
} from '@/features/executions/lib/artifacts';
import {
  beautifyText,
  getBrowserStepColor,
  previewText,
  renderSummaryChips,
  renderTimelineDetails,
  resolveBrowserWaitSeconds,
  stepStatusIcons,
  stepStatusLabels,
  stepTypeLabels,
} from '@/features/executions/lib/detailView';
import { normalizeRequiredInputValues, renderRequiredInputField, type RequiredInputField } from '@/features/executions/lib/inputFields';
import { renderJsonValue } from '@/features/executions/lib/json';
import { extractExecutionDisplayInput } from '@/features/executions/lib/listHelpers';
import {
  compareExecutionPhases,
  getPhaseStatusColor,
  getPhaseStatusLabel,
  getPhaseStepStatus,
} from '@/features/executions/lib/phase';
import {
  getRuntimeSessionNovncUrl,
  getRuntimeSessionStatusLabel,
  isLiveRuntimeSessionState,
  isPreviewRuntimeSessionState,
} from '@/features/executions/lib/runtimeSession';
import { replaceLocalhostWithCurrentHost } from '@/shared/lib/publicUrl';
import {
  EXECUTION_ACTIVE_POLLING_STATUSES,
  EXECUTION_STATUS_COLORS,
  EXECUTION_STATUS_LABELS_EN,
  EXECUTION_STATUS_LABELS_ZH,
} from '@/shared/lib/executionStatusMeta';
import {
  buildWaitingInputDisplayGroups,
  resolveWaitingInputDisplayLabel,
} from '@/shared/lib/waitingInputDisplay';
import LiveSessionPreviewCard from '@/components/runtime/LiveSessionPreviewCard';
import InlineRecoveryPanel from '@/features/executions/components/InlineRecoveryPanel';
import { usePreferencesStore } from '@/shared/store/preferencesStore';

const { Title, Text } = Typography;

const statusColors = EXECUTION_STATUS_COLORS;

const fixLocalhostLink = (url?: string): string | undefined => replaceLocalhostWithCurrentHost(url);

const getRecoveryPatchSummary = (patch: unknown, isEnglish: boolean): string | undefined => {
  const record = asRecord(tryParseJsonValue(patch));
  if (!record) {
    return undefined;
  }

  const type = typeof record.type === 'string' ? record.type : undefined;
  const selector = typeof record.selector === 'string' ? record.selector : undefined;
  const durationMs = typeof record.duration_ms === 'number' ? record.duration_ms : undefined;
  const note = typeof record.note === 'string' ? record.note : undefined;

  if (type === 'append_wait') {
    return isEnglish
      ? `Append wait ${durationMs ?? 0}ms`
      : `追加等待 ${durationMs ?? 0}ms`;
  }
  if (type === 'replace_selector') {
    return isEnglish
      ? `Replace selector: ${selector || '-'}`
      : `替换选择器: ${selector || '-'}`;
  }
  if (type === 'resolve_by_human') {
    return isEnglish
      ? `Resolved by human${note ? `: ${note}` : ''}`
      : `人工处理${note ? `: ${note}` : ''}`;
  }

  return type || undefined;
};

const BROWSER_ACTIVITY_ACTIONS = new Set([
  'navigate',
  'click',
  'fill',
  'type',
  'press',
  'select',
  'hover',
  'scroll',
  'wait',
  'screenshot',
  'upload',
  'drag',
]);

const isBrowserWorkflowActivity = (phase: ExecutionPhaseDto): boolean => {
  if (phase.phaseType !== 'workflow_activity') {
    return false;
  }

  if (extractWorkflowActivitySnapshotSources(phase).length > 0) {
    return true;
  }

  if (extractBrowserExecutionResult(phase.output)) {
    return true;
  }

  return (phase.steps || []).some((step) => {
    if (step.snapshotId) {
      return true;
    }

    if (extractPhaseStepImageSources(step, phase.artifacts || []).length > 0) {
      return true;
    }

    const action = step.action?.trim().toLowerCase();
    return Boolean(action && BROWSER_ACTIVITY_ACTIONS.has(action));
  });
};

const renderExecutionPayloadContent = (
  value: unknown,
  emptyText: string,
  treatSingleResultFieldAsMarkdown = false,
) => {
  const parsedValue = tryParseJsonValue(value);

  if (parsedValue === undefined || parsedValue === null || parsedValue === '') {
    return <Text type="secondary">{emptyText}</Text>;
  }

  if (typeof parsedValue === 'string') {
    return (
      <div
        className="chat-message-markdown"
        style={{
          background: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          border: '1px solid var(--bg-secondary)',
          padding: 12,
          borderRadius: 8,
          marginTop: 8,
          lineHeight: '1.6',
        }}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {beautifyText(parsedValue)}
        </ReactMarkdown>
      </div>
    );
  }

  const resultObj = asRecord(parsedValue);
  const resultText = typeof resultObj?.result === 'string' ? resultObj.result : undefined;
  const onlyHasResultField = treatSingleResultFieldAsMarkdown && resultObj
    ? Object.keys(resultObj).length === 1
      && Object.prototype.hasOwnProperty.call(resultObj, 'result')
    : false;

  if (resultText && onlyHasResultField) {
    return (
      <div
        className="chat-message-markdown"
        style={{
          background: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          border: '1px solid var(--bg-secondary)',
          padding: 12,
          borderRadius: 8,
          marginTop: 8,
          lineHeight: '1.6',
        }}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {beautifyText(resultText)}
        </ReactMarkdown>
      </div>
    );
  }

  return (
    <pre style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--bg-secondary)', padding: 12, borderRadius: 8, overflow: 'auto', marginTop: 8, lineHeight: '1.6', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {renderJsonValue(parsedValue)}
    </pre>
  );
};

const ExecutionDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const language = usePreferencesStore((state) => state.language);
  const isEnglish = language === 'en-US';
  const text = {
    loading: isEnglish ? 'Loading execution...' : '正在加载执行详情...',
    loadFailed: isEnglish ? 'Failed to load execution' : '加载执行详情失败',
    notFound: isEnglish ? 'Execution not found' : '未找到执行记录',
    backToExecutions: isEnglish ? 'Back to Executions' : '返回执行列表',
    enterTakeoverMode: isEnglish ? 'Enter Takeover Mode' : '进入接管模式',
    details: isEnglish ? 'Execution Details' : '执行详情',
    idLabel: isEnglish ? 'ID' : '执行单 ID',
    takeoverRequired: isEnglish ? 'Human Takeover Required' : '需要人工接管',
    takeoverDescDefault: isEnglish ? 'The execution requires human intervention.' : '该执行需要人工介入处理。',
    approvalRequired: isEnglish ? 'Approval Required' : '需要审批',
    approvalWaiting: isEnglish ? 'Execution is waiting for approval' : '执行正在等待审批',
    approvalStatusPrefix: isEnglish ? 'Current approval status:' : '当前审批状态：',
    approvalDescDefault: isEnglish ? 'Review the execution details and decide whether it can continue.' : '请先查看执行详情，再决定是否允许继续执行。',
    approveAndContinue: isEnglish ? 'Approve And Continue' : '批准并继续执行',
    rejectExecution: isEnglish ? 'Reject Execution' : '拒绝执行',
    missingInputRequired: isEnglish ? 'Missing Input Required' : '需要补充输入',
    waitingInput: isEnglish ? 'Execution is waiting for additional input' : '执行正在等待补充输入',
    waitingInputDesc: isEnglish ? 'Fill in the missing parameters below to resume execution.' : '请填写下面缺失的参数后恢复执行。',
    invalidJson: isEnglish ? 'Invalid JSON input' : 'JSON 输入格式无效',
    submitAndResume: isEnglish ? 'Submit And Resume' : '提交并恢复执行',
    reset: isEnglish ? 'Reset' : '重置',
    status: isEnglish ? 'Status' : '状态',
    skillId: isEnglish ? 'Skill ID' : '技能标识',
    runtimeType: isEnglish ? 'Runtime Type' : '运行时类型',
    riskLevel: isEnglish ? 'Risk Level' : '风险等级',
    approvalStatus: isEnglish ? 'Approval Status' : '审批状态',
    createdBy: isEnglish ? 'Created By' : '创建人',
    createdAt: isEnglish ? 'Created At' : '创建时间',
    startedAt: isEnglish ? 'Started At' : '开始时间',
    endedAt: isEnglish ? 'Ended At' : '结束时间',
    failureReason: isEnglish ? 'Failure Reason' : '失败原因',
    failureCode: isEnglish ? 'Failure Code' : '失败代码',
    inputOutput: isEnglish ? 'Input & Output' : '输入与输出',
    input: isEnglish ? 'Input' : '输入',
    result: isEnglish ? 'Result' : '结果',
    stepsProgress: isEnglish ? 'Steps Progress' : '步骤进度',
    stepsDetails: isEnglish ? 'Steps Details' : '步骤详情',
    noSteps: isEnglish ? 'No steps recorded' : '暂无步骤记录',
    inputSubmitted: isEnglish ? 'Input submitted and execution resumed' : '输入已提交，执行已恢复',
    submitInputFailed: isEnglish ? 'Failed to submit input' : '提交输入失败',
    executionApproved: isEnglish ? 'Execution approved' : '执行已批准',
    approveFailed: isEnglish ? 'Failed to approve execution' : '批准执行失败',
    executionRejected: isEnglish ? 'Execution rejected' : '执行已拒绝',
    rejectFailed: isEnglish ? 'Failed to reject execution' : '拒绝执行失败',
    provideField: isEnglish ? 'Please provide' : '请输入',
    enterJsonString: isEnglish ? 'Enter JSON string' : '请输入 JSON 字符串',
    enterField: isEnglish ? 'Enter' : '请输入',
    source: isEnglish ? 'Source' : '来源',
    step: isEnglish ? 'Step' : '步骤',
    name: isEnglish ? 'Name' : '名称',
    type: isEnglish ? 'Type' : '类型',
    action: isEnglish ? 'Action' : '动作',
    error: isEnglish ? 'Error' : '错误',
    duration: isEnglish ? 'Duration' : '耗时',
    browserExecutionResult: isEnglish ? 'Browser Execution Result' : '浏览器执行结果',
    browserRuntimeInfo: isEnglish ? 'Browser Runtime Info' : '浏览器运行信息',
    browserSteps: isEnglish ? 'Browser Steps' : '浏览器步骤结果',
    browserStepOutput: isEnglish ? 'Step Output' : '步骤输出',
    browserSnapshotId: isEnglish ? 'Snapshot ID' : '快照 ID',
    browserTarget: isEnglish ? 'Target' : '目标',
    browserBackend: isEnglish ? 'Backend' : '执行后端',
    browserRuntimeSessionId: isEnglish ? 'Runtime Session' : '运行会话',
    browserStepCount: isEnglish ? 'Step Count' : '步骤数',
    browserFailedStep: isEnglish ? 'Failed Step' : '失败步骤',
    browserFailedAction: isEnglish ? 'Failed Action' : '失败动作',
    browserNoOutput: isEnglish ? 'No structured output' : '暂无结构化输出',
    phaseTimeline: isEnglish ? 'Phase Timeline' : '阶段时间线',
    currentPhase: isEnglish ? 'Current Phase' : '当前阶段',
    currentActivity: isEnglish ? 'Current Activity' : '当前 Activity',
    activityProgress: isEnglish ? 'Activity Progress' : 'Activity 进度',
    activityKey: isEnglish ? 'Activity Key' : 'Activity Key',
    activityRetryOrResume: isEnglish ? 'Retry / Resume' : '重试 / 继续',
    activityTakeoverHint: isEnglish ? 'Take over this activity before retrying' : '如需重试该 Activity，请先接管后继续',
    phaseType: isEnglish ? 'Phase Type' : '阶段类型',
    phaseAttempt: isEnglish ? 'Attempt' : '尝试次数',
    phaseRuntimeSession: isEnglish ? 'Phase Session' : '阶段会话',
    phaseArtifacts: isEnglish ? 'Phase Artifacts' : '阶段产物',
    phaseArtifactCount: isEnglish ? 'Artifact Count' : '产物数量',
    phaseArtifactType: isEnglish ? 'Artifact Type' : '产物类型',
    phaseArtifactCommand: isEnglish ? 'Command' : '命令',
    phaseArtifactStatus: isEnglish ? 'Artifact Status' : '产物状态',
    phaseArtifactPath: isEnglish ? 'Artifact Path' : '产物路径',
    phaseArtifactSnapshotId: isEnglish ? 'Snapshot ID' : '快照 ID',
    phaseArtifactPageFingerprint: isEnglish ? 'Page Fingerprint' : '页面指纹',
    phaseNoData: isEnglish ? 'No phase records' : '暂无阶段记录',
    executionEnded: isEnglish ? 'Execution ended' : '执行已结束',
    endExecution: isEnglish ? 'End Execution' : '结束执行',
    phaseActionFailed: isEnglish ? 'Phase action failed' : '阶段操作失败',
    semanticOverview: isEnglish ? 'Semantic Overview' : '语义摘要',
    semanticMode: isEnglish ? 'Semantic Mode' : '语义模式',
    semanticSummary: isEnglish ? 'Semantic Summary' : '语义总结',
    previewReady: isEnglish ? 'Preview Ready' : '可预览',
    finalReady: isEnglish ? 'Final Ready' : '可正式生成',
    groupedMissing: isEnglish ? 'Missing Business Groups' : '缺失业务组',
    complexity: isEnglish ? 'Complexity' : '复杂度',
    missingFields: isEnglish ? 'Missing Fields' : '缺失字段数',
    arrayGroups: isEnglish ? 'Array Groups' : '数组组数',
    waitingInputSemanticHint: isEnglish ? 'Business-group hint' : '业务组提示',
    yes: isEnglish ? 'Yes' : '是',
    no: isEnglish ? 'No' : '否',
    groupLabel: isEnglish ? 'Group' : '分组',
    fieldLabel: isEnglish ? 'Field' : '字段',
    blockingLabel: isEnglish ? 'Blocking' : '阻塞',
    previewOkLabel: isEnglish ? 'Preview OK' : '可先预览',
    phaseSteps: isEnglish ? 'Phase Steps' : '阶段步骤',
    phaseStepIndex: isEnglish ? 'Index' : '序号',
    phaseStepAction: isEnglish ? 'Action' : '动作',
    phaseStepStatus: isEnglish ? 'Status' : '状态',
    phaseStepSnapshot: isEnglish ? 'Snapshot' : '快照',
    phaseStepDuration: isEnglish ? 'Duration' : '耗时',
  };
  const statusLabels = isEnglish ? EXECUTION_STATUS_LABELS_EN : EXECUTION_STATUS_LABELS_ZH;

  // Fetch execution details
  const { data: execution, isLoading: isLoadingExecution, error: errorExecution } = useQuery<ExecutionDto, Error>(
    ['execution', id],
    () => executionApi.getById(id!),
    {
      enabled: !!id,
      refetchInterval: (data) => {
        if (!data) return false;
        return EXECUTION_ACTIVE_POLLING_STATUSES.includes(data.status) ? 3000 : false;
      },
    }
  );

  // Fetch execution steps
  const { data: steps } = useQuery<ExecutionStepDto[], Error>(
    ['execution-steps', id],
    () => executionApi.getSteps(id!),
    {
      enabled: !!id,
      refetchInterval: () => {
        // 如果详情在轮询，步骤也一起轮询
        if (!execution) return false;
        return EXECUTION_ACTIVE_POLLING_STATUSES.includes(execution.status) ? 3000 : false;
      },
    }
  );
  const { data: phasesData } = useQuery<ExecutionPhaseDto[], Error>(
    ['execution-phases', id],
    () => executionApi.getPhases(id!),
    {
      enabled: !!id,
      refetchInterval: () => {
        if (!execution) return false;
        return EXECUTION_ACTIVE_POLLING_STATUSES.includes(execution.status) ? 3000 : false;
      },
    }
  );

  const { data: skillsData } = useQuery(['execution-detail-skills-name-map'], () => skillApi.list());
  const { data: releasesData } = useQuery(
    ['execution-detail-published-skills-name-map'],
    () => capabilityReleaseApi.listReleaseCenter(),
  );

  const skillNameMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (releasesData?.releases || []).forEach((release) => {
      if (release.publishedSkillId) {
        map.set(
          release.publishedSkillId,
          release.sourceName || release.sourceId || release.publishedSkillId,
        );
      }
    });
    (skillsData?.skills || []).forEach((skill) => {
      if (!map.has(skill.id)) {
        map.set(skill.id, skill.name);
      }
    });
    return map;
  }, [releasesData?.releases, skillsData?.skills]);

  const getSkillDisplayName = (skillId?: string) => {
    if (!skillId) {
      return '-';
    }
    return skillNameMap.get(skillId) || skillId;
  };

  const waitingInputStep = execution?.status === 'waiting_input'
    ? steps?.find((step) =>
      step.id === execution.currentStepId ||
      (step.type === 'input_collection' && step.status === 'running')
    )
    : undefined;

  const requiredInputs = Array.isArray(waitingInputStep?.inputJson?.requiredInputs)
    ? (waitingInputStep.inputJson.requiredInputs as unknown as RequiredInputField[])
    : [];
  const requiredInputGroups = React.useMemo(
    () => buildWaitingInputDisplayGroups(requiredInputs),
    [requiredInputs],
  );
  const semantic = execution?.semantic;
  const parsedResult = asRecord(tryParseJsonValue(execution?.resultJson));
  const normalizedResult = resolveExecutionNormalizedResult(execution);
  const browserExecutionResult = extractBrowserExecutionResult(execution?.resultJson);
  const executionPhases = phasesData || execution?.phases || [];
  const sortedExecutionPhases = React.useMemo(
    () => [...executionPhases].sort(compareExecutionPhases),
    [executionPhases],
  );
  const isExecutionActive = Boolean(execution && EXECUTION_ACTIVE_POLLING_STATUSES.includes(execution.status));
  const workflowActivityPhases = React.useMemo(
    () => sortedExecutionPhases
      .filter((phase) => phase.phaseType === 'workflow_activity')
      .sort(compareExecutionPhases),
    [sortedExecutionPhases],
  );
  const displayActivityPhases = React.useMemo(
    () => {
      const basePhases = workflowActivityPhases.length > 0 ? workflowActivityPhases : sortedExecutionPhases;
      return [...basePhases].sort(compareExecutionPhases);
    },
    [sortedExecutionPhases, workflowActivityPhases],
  );
  const effectiveResultJson = React.useMemo(() => {
    if (hasMeaningfulExecutionResult(parsedResult)) {
      return parsedResult;
    }
    const phaseWithOutput = [...sortedExecutionPhases]
      .reverse()
      .find((phase) => hasMeaningfulExecutionResult(tryParseJsonValue(phase.output)));
    return phaseWithOutput ? tryParseJsonValue(phaseWithOutput.output) : undefined;
  }, [parsedResult, sortedExecutionPhases]);
  const effectiveBrowserExecutionResult = React.useMemo(
    () => browserExecutionResult || extractBrowserExecutionResult(effectiveResultJson),
    [browserExecutionResult, effectiveResultJson],
  );
  const resultPreviewValue = normalizedResult?.structuredData ?? normalizedResult?.envelope;
  const primaryResultText = normalizedResult?.detailText || normalizedResult?.summary || normalizedResult?.body;
  const shouldRenderPrimaryAsMarkdown = normalizedResult?.detailFormat === 'markdown' || normalizedResult?.summaryFormat === 'markdown';
  const shouldShowStructuredResult = Boolean(
    resultPreviewValue !== undefined
    && resultPreviewValue !== null
    && (
      normalizedResult?.envelope?.presentation?.preferStructuredView
      || normalizedResult?.structuredData !== undefined
      || !primaryResultText
    ),
  );
  const phaseRuntimeSessionId = React.useMemo(
    () => [...sortedExecutionPhases]
      .reverse()
      .find((phase) => typeof phase.runtimeSessionId === 'string' && phase.runtimeSessionId.trim().length > 0)
      ?.runtimeSessionId,
    [sortedExecutionPhases],
  );
  const executionRuntimeSessionId =
    execution?.runtimeSessionId || effectiveBrowserExecutionResult?.runtimeSessionId || phaseRuntimeSessionId;
  const isBrowserExecution = React.useMemo(
    () => (
      hasBrowserExecutionEvidence({
        runtimeType: execution?.runtimeType,
        runtimeSessionId: executionRuntimeSessionId,
        browserExecutionResult: effectiveBrowserExecutionResult,
        phases: sortedExecutionPhases,
      })
      || sortedExecutionPhases.some((phase) => isBrowserWorkflowActivity(phase))
    ),
    [effectiveBrowserExecutionResult, execution?.runtimeType, executionRuntimeSessionId, sortedExecutionPhases],
  );
  const displayRuntimeType = isBrowserExecution ? 'browser' : (execution?.runtimeType || '-');
  const hasWorkflowActivityPhases = workflowActivityPhases.length > 0;
  const shouldShowLegacySteps = React.useMemo(
    () => sortedExecutionPhases.length === 0,
    [sortedExecutionPhases],
  );
  const semanticOverviewCard: React.ReactNode = semantic
    ? <SemanticOverviewCard semantic={semantic} text={text} />
    : null;
  const { data: runtimeSession } = useQuery(
    ['execution-runtime-session', executionRuntimeSessionId],
    () => runtimeSessionApi.getByIdOrExecutionId(executionRuntimeSessionId!, execution?.id),
    {
      enabled: Boolean(executionRuntimeSessionId),
      refetchInterval: (data) => {
        if (isLiveRuntimeSessionState(data?.state)) {
          return 3000;
        }
        return execution && EXECUTION_ACTIVE_POLLING_STATUSES.includes(execution.status) ? 3000 : false;
      },
    }
  );
  const runtimeSessionNovncUrl = getRuntimeSessionNovncUrl(runtimeSession);
  const lastKnownRuntimeSessionNovncUrlRef = React.useRef<string | undefined>(undefined);
  React.useEffect(() => {
    if (runtimeSessionNovncUrl) {
      lastKnownRuntimeSessionNovncUrlRef.current = runtimeSessionNovncUrl;
    }
  }, [runtimeSessionNovncUrl]);
  const stableRuntimeSessionNovncUrl = runtimeSessionNovncUrl || lastKnownRuntimeSessionNovncUrlRef.current;
  const executionInput = execution ? extractExecutionDisplayInput(execution) : undefined;
  const currentPhase = React.useMemo(
    () => displayActivityPhases.find((phase) => phase.phaseKey === execution?.currentPhaseKey)
      || displayActivityPhases.find((phase) => phase.status === 'running')
      || displayActivityPhases.find((phase) => ['waiting_takeover', 'resumable', 'pending'].includes(phase.status))
      || displayActivityPhases[displayActivityPhases.length - 1],
    [execution?.currentPhaseKey, displayActivityPhases],
  );
  const shouldShowCurrentPhaseInfo = Boolean(
    execution && (
      execution.status === 'running'
      || execution.status === 'human_control'
      || execution.status === 'failed'
    ),
  );

  const submitInputMutation = useMutation(
    (values: Record<string, unknown>) => executionApi.submitInput(id!, {
      stepId: waitingInputStep!.id,
      input: values,
    }),
    {
      onSuccess: () => {
        void message.success(text.inputSubmitted);
        void queryClient.invalidateQueries(['execution', id]);
        void queryClient.invalidateQueries(['execution-steps', id]);
      },
      onError: (error: Error) => {
        void message.error(`${text.submitInputFailed}: ${error.message}`);
      },
    }
  );

  const approveMutation = useMutation(
    () => executionApi.approve(id!),
    {
      onSuccess: () => {
        void message.success(text.executionApproved);
        void queryClient.invalidateQueries(['execution', id]);
        void queryClient.invalidateQueries(['execution-steps', id]);
      },
      onError: (error: Error) => {
        void message.error(`${text.approveFailed}: ${error.message}`);
      },
    }
  );

  const rejectMutation = useMutation(
    () => executionApi.reject(id!),
    {
      onSuccess: () => {
        void message.success(text.executionRejected);
        void queryClient.invalidateQueries(['execution', id]);
        void queryClient.invalidateQueries(['execution-steps', id]);
      },
      onError: (error: Error) => {
        void message.error(`${text.rejectFailed}: ${error.message}`);
      },
    }
  );

  if (isLoadingExecution) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" tip={text.loading} />
      </div>
    );
  }

  if (errorExecution || !execution) {
    return (
      <div style={{ padding: 24 }}>
        <Alert
          type="error"
          message={text.loadFailed}
          description={errorExecution?.message || text.notFound}
          showIcon
          action={
            <Button onClick={() => navigate('/executions')}>
              {text.backToExecutions}
            </Button>
          }
        />
      </div>
    );
  }

  const getCurrentStepIndex = () => {
    if (!steps || !execution.currentStepId) return -1;
    return steps.findIndex(s => s.id === execution.currentStepId);
  };

  const handleSubmitInput = (values: Record<string, unknown>) => {
    submitInputMutation.mutate(values);
  };

  const stepColumns = [
    {
      title: text.step,
      dataIndex: 'stepIndex',
      key: 'stepIndex',
      width: 80,
      render: (index: number) => `${text.step} ${index + 1}`,
    },
    {
      title: text.name,
      dataIndex: 'name',
      key: 'name',
      width: 150,
    },
    {
      title: text.type,
      dataIndex: 'type',
      key: 'type',
      width: 120,
      render: (type: string) => stepTypeLabels[type]?.[isEnglish ? 'en' : 'zh'] || type,
    },
    {
      title: text.status,
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string) => (
        <Space>{stepStatusIcons[status]} {stepStatusLabels[status]?.[isEnglish ? 'en' : 'zh'] || status}</Space>
      ),
    },
    {
      title: text.action,
      dataIndex: 'action',
      key: 'action',
      width: 100,
      render: (action?: string) => action || '-',
    },
    {
      title: text.error,
      dataIndex: 'errorMessage',
      key: 'errorMessage',
      render: (error?: string) => error ? <Text type="danger">{error}</Text> : '-',
    },
    {
      title: text.duration,
      key: 'duration',
      render: (_: unknown, record: ExecutionStepDto) => {
        if (record.startedAt && record.endedAt) {
          const duration = new Date(record.endedAt).getTime() - new Date(record.startedAt).getTime();
          return `${(duration / 1000).toFixed(1)}s`;
        }
        return '-';
      },
    },
  ];


  const browserTimelineItems = effectiveBrowserExecutionResult
    ? [
        {
          color: 'gray' as const,
          children: (
            <TimelineNodeCard
              title={text.browserRuntimeInfo}
              subtitle={execution.endedAt ? new Date(execution.endedAt).toLocaleString() : undefined}
              color="gray"
              preview={renderSummaryChips([
                { label: text.browserBackend, value: effectiveBrowserExecutionResult.backend || '-', color: 'blue' },
                { label: text.browserStepCount, value: effectiveBrowserExecutionResult.stepResults.length, color: 'processing' },
                { label: text.status, value: statusLabels[execution.status], color: statusColors[execution.status] },
              ])}
              details={renderTimelineDetails([
                { label: text.browserRuntimeSessionId, value: effectiveBrowserExecutionResult.runtimeSessionId || '-' },
                { label: 'Runtime', value: {
                  backend: effectiveBrowserExecutionResult.backend,
                  runtimeSessionId: effectiveBrowserExecutionResult.runtimeSessionId,
                  stepCount: effectiveBrowserExecutionResult.stepResults.length,
                  failedStep: effectiveBrowserExecutionResult.failedStep,
                  failedAction: effectiveBrowserExecutionResult.failedAction,
                } },
              ])}
            />
          ),
        },
        ...effectiveBrowserExecutionResult.stepResults.map((stepResult, index) => {
          const outputDisplay = buildBrowserOutputDisplay(stepResult.output || null);
          const waitSeconds = resolveBrowserWaitSeconds(stepResult, stepResult.output || null);
          const isWaitStep = stepResult.action === 'wait';
          const imageSources = outputDisplay.imageSources.length > 0
            ? outputDisplay.imageSources
            : outputDisplay.imageSrc
              ? [outputDisplay.imageSrc]
              : [];

          return {
            color: getBrowserStepColor(
              stepResult,
              index,
              effectiveBrowserExecutionResult.stepResults.length,
              Boolean(effectiveBrowserExecutionResult.failedStep),
            ),
            children: (
              <TimelineNodeCard
                key={`${stepResult.stepId || stepResult.name || stepResult.action || 'browser-step'}-${index}`}
                title={`${text.step} ${index + 1}: ${isWaitStep && waitSeconds ? `wait ${waitSeconds}s` : stepResult.name || stepResult.action || '-'}`}
                subtitle={
                  isWaitStep
                    ? waitSeconds
                      ? `等待 ${waitSeconds} 秒`
                      : '等待'
                    : stepResult.target || outputDisplay.command || stepResult.stepId || '-'
                }
                color={getBrowserStepColor(
                  stepResult,
                  index,
                  effectiveBrowserExecutionResult.stepResults.length,
                  Boolean(effectiveBrowserExecutionResult.failedStep),
                )}
                preview={
                  <Space direction="vertical" size={10} style={{ width: '100%' }}>
                    {isWaitStep ? (
                      renderSummaryChips([
                        { label: '等待', value: waitSeconds ? `${waitSeconds} 秒` : '-', color: 'processing' },
                        {
                          label: 'status',
                          value: outputDisplay.status || '-',
                          color: outputDisplay.status === 'success' ? 'green' : 'default',
                        },
                      ])
                    ) : (
                      <>
                        {renderSummaryChips([
                          { label: text.action, value: stepResult.action || '-', color: 'processing' },
                          { label: text.browserTarget, value: stepResult.target || '-', color: 'blue' },
                          { label: text.browserSnapshotId, value: stepResult.snapshotId || '-', color: 'default' },
                          {
                            label: 'status',
                            value: outputDisplay.status || '-',
                            color: outputDisplay.status === 'success' ? 'green' : 'default',
                          },
                        ])}
                        <Text
                          type="secondary"
                          style={{
                            display: 'block',
                            textAlign: 'left',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            lineHeight: 1.6,
                          }}
                        >
                          {previewText(outputDisplay.summary || text.browserNoOutput, 220)}
                        </Text>
                      </>
                    )}
                    {imageSources.length > 0 ? (
                      <div
                        style={{
                          marginTop: 4,
                          borderRadius: 12,
                          overflow: 'hidden',
                          border: '1px solid var(--bg-secondary)',
                          background: 'var(--bg-card)',
                          padding: 12,
                        }}
                      >
                        <Image.PreviewGroup>
                          {imageSources.length === 1 ? (
                            <Image
                              src={imageSources[0]}
                              alt={stepResult.name || stepResult.action || 'browser screenshot'}
                              style={{
                                width: '100%',
                                maxHeight: 280,
                                objectFit: 'contain',
                                background: 'var(--bg-secondary)',
                                borderRadius: 8,
                              }}
                            />
                          ) : (
                            <Carousel dots>
                              {imageSources.map((src, imageIndex) => (
                                <div key={`${src}-${imageIndex}`}>
                                  <div
                                    style={{
                                      display: 'flex',
                                      justifyContent: 'center',
                                      background: 'var(--bg-secondary)',
                                      borderRadius: 8,
                                      padding: 8,
                                    }}
                                  >
                                    <Image
                                      src={src}
                                      alt={`${stepResult.name || stepResult.action || 'browser screenshot'}-${imageIndex + 1}`}
                                      style={{
                                        maxHeight: 280,
                                        objectFit: 'contain',
                                        borderRadius: 8,
                                      }}
                                    />
                                  </div>
                                </div>
                              ))}
                            </Carousel>
                          )}
                        </Image.PreviewGroup>
                      </div>
                    ) : null}
                  </Space>
                }
                details={renderTimelineDetails([
                  { label: 'Step', value: {
                    stepId: stepResult.stepId,
                    name: stepResult.name,
                    action: stepResult.action,
                    target: stepResult.target,
                    snapshotId: stepResult.snapshotId,
                  } },
                  { label: text.browserStepOutput, value: outputDisplay.details || text.browserNoOutput },
                ])}
              />
            ),
          };
        }),
      ]
    : [];
  const executionInfoRecord = asRecord(tryParseJsonValue(execution.resultJson));
  const executionInfoTemporalLink = fixLocalhostLink(
    normalizedResult?.temporalLink || (typeof executionInfoRecord?.temporalLink === 'string' ? executionInfoRecord.temporalLink : undefined),
  );

  const activityProgressCard: React.ReactNode = isBrowserExecution && displayActivityPhases.length > 0 ? (
    <Card title={text.stepsProgress} style={{ marginBottom: 16 }}>
      <Steps
        current={Math.max(displayActivityPhases.findIndex((phase) => phase.phaseKey === currentPhase?.phaseKey), 0)}
        size="small"
        responsive
        style={{ marginBottom: 16 }}
        items={displayActivityPhases.map((phase, index) => {
          const isCurrentActivity = currentPhase?.phaseKey === phase.phaseKey;
          return {
            title: phase.phaseName || phase.phaseKey || `${text.step} ${index + 1}`,
            status: getPhaseStepStatus(phase.status),
            description: (
              <Space direction="vertical" size={4}>
                <Space wrap size={[8, 4]}>
                  <Tag color={getPhaseStatusColor(phase.status)}>
                    {getPhaseStatusLabel(phase.status, isEnglish)}
                  </Tag>
                  <Tag>{phase.phaseType}</Tag>
                  {isCurrentActivity ? <Tag color="processing">{text.currentActivity}</Tag> : null}
                </Space>
                <Space wrap size={[12, 0]}>
                  <Text type="secondary">{`${text.phaseAttempt}: ${phase.attempt}`}</Text>
                  <Text type="secondary">{`${text.phaseSteps}: ${phase.steps?.length || 0}`}</Text>
                </Space>
                {phase.errorMessage ? <Text type="danger">{phase.errorMessage}</Text> : null}
              </Space>
            ),
          };
        })}
      />
      {shouldShowCurrentPhaseInfo && currentPhase ? (
        <Alert
          type="info"
          showIcon
          message={`${text.currentPhase}: ${currentPhase.phaseName || currentPhase.phaseKey}`}
          description={
            <Space wrap size={[12, 4]}>
              <Text type="secondary">{`${text.activityKey}: ${currentPhase.phaseKey}`}</Text>
              <Text type="secondary">
                {new Date(currentPhase.startedAt || currentPhase.createdAt).toLocaleString()}
              </Text>
            </Space>
          }
        />
      ) : null}
    </Card>
  ) : null;
  const currentPhaseRecoveryDecision = asRecord(tryParseJsonValue(currentPhase?.recoveryDecision));
  const currentPhaseTakeovers = currentPhase?.takeovers || [];
  const latestTakeoverRecord = currentPhaseTakeovers.length > 0
    ? currentPhaseTakeovers[currentPhaseTakeovers.length - 1]
    : undefined;
  const takeoverRecoveryCard: React.ReactNode = currentPhase && (currentPhaseTakeovers.length > 0 || currentPhaseRecoveryDecision) ? (
    <Card title={isEnglish ? 'Takeover Recovery' : '接管恢复信息'} style={{ marginBottom: 16 }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Descriptions column={2} size="small">
          <Descriptions.Item label={text.currentPhase}>
            {currentPhase.phaseName || currentPhase.phaseKey}
          </Descriptions.Item>
          <Descriptions.Item label={text.status}>
            <Tag color={getPhaseStatusColor(currentPhase.status)}>
              {getPhaseStatusLabel(currentPhase.status, isEnglish)}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label={isEnglish ? 'Latest Takeover' : '最近接管'}>
            {latestTakeoverRecord ? (
              <Space wrap size={[8, 4]}>
                <Tag color={latestTakeoverRecord.status === 'resolved' ? 'green' : latestTakeoverRecord.status === 'requested' ? 'orange' : 'default'}>
                  {latestTakeoverRecord.status}
                </Tag>
                <Text type="secondary">
                  {new Date(latestTakeoverRecord.createdAt).toLocaleString()}
                </Text>
              </Space>
            ) : '-'}
          </Descriptions.Item>
          <Descriptions.Item label={isEnglish ? 'Recovery Patch' : '恢复补丁'}>
            {getRecoveryPatchSummary(currentPhaseRecoveryDecision?.patch, isEnglish) || '-'}
          </Descriptions.Item>
          <Descriptions.Item label={text.failureReason} span={2}>
            {latestTakeoverRecord?.reason || currentPhase.errorMessage || '-'}
          </Descriptions.Item>
          <Descriptions.Item label={isEnglish ? 'Resolution Note' : '处理说明'} span={2}>
            {latestTakeoverRecord?.resolutionNote
              || (typeof currentPhaseRecoveryDecision?.comment === 'string' ? currentPhaseRecoveryDecision.comment : '-')}
          </Descriptions.Item>
        </Descriptions>

        {currentPhaseTakeovers.length > 0 ? (
          <Timeline
            items={currentPhaseTakeovers.map((takeover) => ({
              color: takeover.status === 'resolved' ? 'green' : takeover.status === 'requested' ? 'orange' : 'gray',
              children: (
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <Space wrap size={[8, 4]}>
                    <Tag color={takeover.status === 'resolved' ? 'green' : takeover.status === 'requested' ? 'orange' : 'default'}>
                      {takeover.status}
                    </Tag>
                    <Text>{new Date(takeover.createdAt).toLocaleString()}</Text>
                    {takeover.resolvedAt ? (
                      <Text type="secondary">
                        {`${isEnglish ? 'Resolved at' : '完成于'} ${new Date(takeover.resolvedAt).toLocaleString()}`}
                      </Text>
                    ) : null}
                  </Space>
                  {takeover.reason ? <Text>{takeover.reason}</Text> : null}
                  {(takeover.requestedBy || takeover.resolvedBy) ? (
                    <Space wrap size={[12, 4]}>
                      {takeover.requestedBy ? (
                        <Text type="secondary">{`${isEnglish ? 'Requested by' : '发起人'}: ${takeover.requestedBy}`}</Text>
                      ) : null}
                      {takeover.resolvedBy ? (
                        <Text type="secondary">{`${isEnglish ? 'Resolved by' : '处理人'}: ${takeover.resolvedBy}`}</Text>
                      ) : null}
                    </Space>
                  ) : null}
                  {takeover.resolutionNote ? (
                    <Text type="secondary">{takeover.resolutionNote}</Text>
                  ) : null}
                </Space>
              ),
            }))}
          />
        ) : null}

        {currentPhaseRecoveryDecision ? (
          <div>
            <Text strong>{isEnglish ? 'Recovery Decision Payload' : '恢复决策详情'}</Text>
            <pre style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--bg-secondary)', padding: 12, borderRadius: 8, overflow: 'auto', marginTop: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {renderJsonValue(currentPhaseRecoveryDecision)}
            </pre>
          </div>
        ) : null}
      </Space>
    </Card>
  ) : null;

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Space align="center" style={{ marginBottom: 16 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/executions')}>
            {text.backToExecutions}
          </Button>
        </Space>
        <Title level={2}>{text.details}</Title>
        <Text type="secondary">{text.idLabel}: {execution.id}</Text>
      </div>

      {/* Takeover Alert */}
      {execution.status === 'human_control' ? (
        <Alert
          type="warning"
          message={text.takeoverRequired}
          description={
            <div>
              <p>{execution.takeoverReason || text.takeoverDescDefault}</p>
              {shouldShowCurrentPhaseInfo && currentPhase ? (
                <Text type="secondary">{`${text.currentPhase}: ${currentPhase.phaseName || currentPhase.phaseKey}`}</Text>
              ) : null}
            </div>
          }
          icon={<WarningOutlined />}
          showIcon
          style={{ marginBottom: 24 }}
        />
      ) : null}

      {execution.status === 'pending_approval' ? (
        <Card title={text.approvalRequired} style={{ marginBottom: 16 }}>
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message={text.approvalWaiting}
            description={
              execution.approvalStatus
                ? `${text.approvalStatusPrefix} ${execution.approvalStatus}`
                : text.approvalDescDefault
            }
          />
          <Space>
            <Button type="primary" loading={approveMutation.isLoading} onClick={() => approveMutation.mutate()}>
              {text.approveAndContinue}
            </Button>
            <Button danger loading={rejectMutation.isLoading} onClick={() => rejectMutation.mutate()}>
              {text.rejectExecution}
            </Button>
          </Space>
        </Card>
      ) : null}

      {execution.status === 'waiting_input' && waitingInputStep ? (
        <Card title={text.missingInputRequired} style={{ marginBottom: 16 }}>
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message={text.waitingInput}
            description={
              <Space direction="vertical" size={8}>
                <Text>{text.waitingInputDesc}</Text>
                {semantic?.summary ? (
                  <Text type="secondary">{`${text.waitingInputSemanticHint}: ${semantic.summary}`}</Text>
                ) : null}
              </Space>
            }
          />
          <Form
            form={form}
            layout="vertical"
            initialValues={requiredInputs.reduce<Record<string, unknown>>((acc, field) => {
              acc[field.name] = field.value;
              return acc;
            }, {})}
            onFinish={(values: Record<string, unknown>) => {
              try {
                handleSubmitInput(normalizeRequiredInputValues(values, requiredInputs, { treatArrayAsJson: true }));
              } catch (error) {
                void message.error(error instanceof Error ? error.message : text.invalidJson);
              }
            }}
          >
            {requiredInputGroups.length > 0 ? (
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                {requiredInputGroups.map((group) => (
                  <Card
                    key={group.label}
                    size="small"
                    title={group.label}
                    style={{ borderRadius: 12, background: 'var(--bg-card)' }}
                  >
                    {group.items.map((field) => (
                      <React.Fragment key={field.name}>
                        <Form.Item
                          name={field.name}
                          label={`${resolveWaitingInputDisplayLabel(field)} (${field.type})`}
                          extra={field.description || `${text.source}: ${field.source}`}
                          rules={[
                            {
                              required: field.required,
                              message: `${text.provideField} ${resolveWaitingInputDisplayLabel(field)}`,
                            },
                          ]}
                          valuePropName={field.type.toLowerCase() === 'boolean' ? 'checked' : 'value'}
                        >
                          {renderRequiredInputField(field, {
                            jsonPlaceholder: text.enterJsonString,
                            textPlaceholderPrefix: text.enterField,
                            treatArrayAsJson: true,
                          })}
                        </Form.Item>
                        {field.needs_confirmation ? (
                          <Tag color="gold" style={{ marginBottom: 12 }}>待确认</Tag>
                        ) : null}
                      </React.Fragment>
                    ))}
                  </Card>
                ))}
              </Space>
            ) : (
              requiredInputs.map((field) => (
                <React.Fragment key={field.name}>
                  <Form.Item
                    name={field.name}
                    label={`${resolveWaitingInputDisplayLabel(field)} (${field.type})`}
                    extra={field.description || `${text.source}: ${field.source}`}
                    rules={[
                      {
                        required: field.required,
                        message: `${text.provideField} ${resolveWaitingInputDisplayLabel(field)}`,
                      },
                    ]}
                    valuePropName={field.type.toLowerCase() === 'boolean' ? 'checked' : 'value'}
                  >
                    {renderRequiredInputField(field, {
                      jsonPlaceholder: text.enterJsonString,
                      textPlaceholderPrefix: text.enterField,
                      treatArrayAsJson: true,
                    })}
                  </Form.Item>
                  {field.needs_confirmation ? (
                    <Tag color="gold" style={{ marginBottom: 12 }}>待确认</Tag>
                  ) : null}
                </React.Fragment>
              ))
            )}
            <Space>
              <Button type="primary" htmlType="submit" loading={submitInputMutation.isLoading}>
                {text.submitAndResume}
              </Button>
              <Button onClick={() => form.resetFields()}>
                {text.reset}
              </Button>
            </Space>
          </Form>
        </Card>
      ) : null}

      {/* Execution Info */}
      <Card style={{ marginBottom: 16 }}>
        <Descriptions column={2}>
          <Descriptions.Item label={text.status}>
            <Tag color={statusColors[execution.status]}>{statusLabels[execution.status]}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label={isEnglish ? 'Skill' : '技能'}>
            <Space direction="vertical" size={0}>
              <Text>{getSkillDisplayName(execution.skillId)}</Text>
              {getSkillDisplayName(execution.skillId) !== execution.skillId ? (
                <Text type="secondary">{`${text.skillId}: ${execution.skillId}`}</Text>
              ) : null}
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label={isEnglish ? 'Browser Session' : '浏览器会话'}>
            {executionRuntimeSessionId ? (
              <Space wrap>
                <Text copyable={{ text: executionRuntimeSessionId }}>
                  {executionRuntimeSessionId}
                </Text>
                {stableRuntimeSessionNovncUrl ? (
                  <Button
                    type="link"
                    style={{ paddingInline: 0 }}
                    onClick={() => window.open(fixLocalhostLink(stableRuntimeSessionNovncUrl), '_blank', 'noopener,noreferrer')}
                  >
                    {isEnglish ? 'Open Live View' : '打开实时画面'}
                  </Button>
                ) : null}
              </Space>
            ) : (
              '-'
            )}
          </Descriptions.Item>
          <Descriptions.Item label={text.runtimeType}>{displayRuntimeType}</Descriptions.Item>
          <Descriptions.Item label={text.riskLevel}>{execution.riskLevel}</Descriptions.Item>
          <Descriptions.Item label={text.approvalStatus}>{execution.approvalStatus || '-'}</Descriptions.Item>
          <Descriptions.Item label={text.createdAt}>
            {new Date(execution.createdAt).toLocaleString()}
          </Descriptions.Item>
          {execution.startedAt ? (
            <Descriptions.Item label={text.startedAt}>
              {new Date(execution.startedAt).toLocaleString()}
            </Descriptions.Item>
          ) : null}
          {execution.endedAt ? (
            <Descriptions.Item label={text.endedAt}>
              {new Date(execution.endedAt).toLocaleString()}
            </Descriptions.Item>
          ) : null}
          {execution.failureReason ? (
            <Descriptions.Item label={text.failureReason} span={2}>
              <Text type="danger">{execution.failureReason}</Text>
            </Descriptions.Item>
          ) : null}
          {execution.failureCode ? (
            <Descriptions.Item label={text.failureCode}>
              <Text type="danger">{execution.failureCode}</Text>
            </Descriptions.Item>
          ) : null}
          {executionInfoTemporalLink ? (
            <Descriptions.Item label={isEnglish ? 'Temporal Link' : 'Temporal 链接'} span={2}>
              <a href={executionInfoTemporalLink} target="_blank" rel="noopener noreferrer">
                <Space>
                  <ThunderboltOutlined />
                  {executionInfoTemporalLink}
                </Space>
              </a>
            </Descriptions.Item>
          ) : null}
        </Descriptions>
      </Card>

      {isBrowserExecution && stableRuntimeSessionNovncUrl && (isExecutionActive || isPreviewRuntimeSessionState(runtimeSession?.state)) ? (
        <div style={{ marginBottom: 16 }}>
          <LiveSessionPreviewCard
            novncUrl={stableRuntimeSessionNovncUrl}
            title={isEnglish ? 'Live Browser View' : '实时画面'}
            statusLabel={getRuntimeSessionStatusLabel(runtimeSession?.state, isEnglish)}
            height={420}
          />
        </div>
      ) : null}

      <InlineRecoveryPanel
        executionId={execution.id}
        executionStatus={execution.status}
        currentStepId={execution.currentStepId}
        phase={currentPhase}
      />

      {takeoverRecoveryCard}

      {activityProgressCard}

      {React.isValidElement(semanticOverviewCard) ? semanticOverviewCard : null}

      {/* Output */}
      {!isBrowserExecution ? (
        <Card title={text.inputOutput} style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 16 }}>
            <Text strong>{text.input}:</Text>
            {renderExecutionPayloadContent(executionInput, isEnglish ? 'No input' : '暂无输入内容')}
          </div>
          <div>
            <Text strong>{text.result}:</Text>
            {normalizedResult?.hasBusinessResult ? (
              <Space direction="vertical" size={12} style={{ width: '100%', marginTop: 8 }}>
                {normalizedResult.title ? (
                  <Space wrap size={[8, 8]}>
                    <Text strong>{normalizedResult.title}</Text>
                    {normalizedResult.resultType ? <Tag>{normalizedResult.resultType}</Tag> : null}
                  </Space>
                ) : null}
                {primaryResultText ? (
                  shouldRenderPrimaryAsMarkdown ? (
                    <div className="chat-message-markdown" style={{ lineHeight: 1.7 }}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {beautifyText(primaryResultText)}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <Text style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                      {primaryResultText}
                    </Text>
                  )
                ) : null}
                {normalizedResult.artifacts.length > 0 ? (
                  <Space wrap>
                    {normalizedResult.artifacts.map((artifact, index) => {
                      const href = fixLocalhostLink(artifact.downloadUrl || artifact.url);
                      if (!href) {
                        return null;
                      }
                      return (
                        <Button
                          key={`${href}-${index}`}
                          type="link"
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ paddingInline: 0 }}
                        >
                          {artifact.label || artifact.name || `${text.result} ${index + 1}`}
                        </Button>
                      );
                    })}
                  </Space>
                ) : null}
                {normalizedResult.temporalLink ? (
                  <Button
                    type="link"
                    href={fixLocalhostLink(normalizedResult.temporalLink)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ paddingInline: 0, width: 'fit-content' }}
                  >
                    {isEnglish ? 'Open Temporal Execution' : '打开 Temporal 执行链路'}
                  </Button>
                ) : null}
                {shouldShowStructuredResult ? renderExecutionPayloadContent(
                  resultPreviewValue,
                  isEnglish ? 'No structured result' : '暂无结构化结果',
                ) : null}
              </Space>
            ) : (
              renderExecutionPayloadContent(effectiveResultJson, isEnglish ? 'No result output' : '暂无结果输出', true)
            )}
          </div>
        </Card>
      ) : null}

      {isBrowserExecution && effectiveBrowserExecutionResult && !isExecutionActive && !hasWorkflowActivityPhases ? (
        <Card title={text.browserExecutionResult} style={{ marginBottom: 16 }}>
          {effectiveBrowserExecutionResult.runtimeSessionId ? (
            <div style={{ marginBottom: 12 }}>
              <Text copyable={{ text: effectiveBrowserExecutionResult.runtimeSessionId }}>
                {`${text.browserRuntimeSessionId}: ${effectiveBrowserExecutionResult.runtimeSessionId}`}
              </Text>
            </div>
          ) : null}
          <Timeline items={browserTimelineItems} />
        </Card>
      ) : null}

      {isBrowserExecution && !displayActivityPhases.length && shouldShowLegacySteps && steps && steps.length > 0 ? (
        <Card title={text.stepsProgress} style={{ marginBottom: 16 }}>
          <Steps
            current={getCurrentStepIndex()}
            size="small"
            style={{ marginBottom: 24 }}
            items={steps.map((step, index) => ({
              title: step.name || `${text.step} ${index + 1}`,
              status: step.status as 'wait' | 'process' | 'finish' | 'error',
              description: stepStatusLabels[step.status]?.[isEnglish ? 'en' : 'zh'] || step.action,
            }))}
          />
        </Card>
      ) : null}

      {/* Steps Table */}
      {isBrowserExecution ? (
        <Card title={text.stepsDetails}>
          {!displayActivityPhases.length && shouldShowLegacySteps && steps && steps.length > 0 ? (
          <Table
            columns={stepColumns}
            dataSource={steps}
            rowKey="id"
            pagination={false}
            size="small"
          />
          ) : (
          <Alert
            type="info"
            showIcon
            message={isEnglish ? 'Phase-driven execution view' : '当前执行已切换为阶段视图'}
            description={isEnglish
              ? 'This execution is driven by phases and activity steps. Legacy execution steps are hidden to avoid showing stale error records.'
              : '该执行当前以阶段与 Activity 步骤为主视图，已隐藏旧版顶层步骤，避免继续显示恢复前的历史错误。'}
          />
          )}
        </Card>
      ) : null}
    </div>
  );
};

export default ExecutionDetailPage;
