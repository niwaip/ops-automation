/**
 * ExecutionDetailPage
 * View execution details and steps
 * Phase 4: Portal Execution views
 */

import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Collapse,
  Descriptions,
  Tag,
  Button,
  Space,
  Typography,
  Spin,
  Alert,
  Table,
  Steps,
  Timeline,
  Image,
  Carousel,
  Empty,
  message,
} from 'antd';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import '../../chat/ChatMessage.css';
import { resolveExecutionNormalizedResult } from '@ops/user-core';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  CloseOutlined,
  ThunderboltOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import {
  executionApi,
  ExecutionDto,
  ExecutionPhaseArtifactDto,
  ExecutionPhaseDto,
  ExecutionStatus,
  ExecutionStepDto,
  ExecutionTakeoverRecordDto,
} from '@/api/execution';
import { runtimeSessionApi } from '@/api/runtimeSession';
import { skillApi } from '@/api/skill';
import { capabilityReleaseApi } from '@/api/capabilities';
import SemanticOverviewCard from '../components/SemanticOverviewCard';
import TimelineNodeCard from '../components/TimelineNodeCard';
import {
  buildBrowserOutputDisplay,
  hasBrowserAuditEvidence,
  extractBrowserExecutionResult,
  hasBrowserExecutionEvidence,
} from '../lib/browser';
import {
  asRecord,
  hasMeaningfulExecutionResult,
  tryParseJsonValue,
} from '../lib/common';
import {
  extractPhaseStepUrl,
  extractPhaseStepImageSources,
  extractWorkflowActivitySnapshotSources,
  getVisiblePhaseSteps,
  sortExecutionPhaseArtifactsByTime,
  sortExecutionPhaseStepsByTime,
} from '../lib/artifacts';
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
} from '../lib/detailView';
import {
  normalizeRequiredInputValues,
  type RequiredInputField,
} from '../lib/inputFields';
import { renderJsonValue } from '../lib/json';
import { extractExecutionDisplayInput } from '../lib/listHelpers';
import { buildExecutionLoopSummary } from '../lib/executionSummary';
import {
  compareExecutionPhasesByTime,
  compareExecutionPhases,
  getPhaseStatusColor,
  getPhaseStatusLabel,
  getPhaseStepStatus,
} from '../lib/phase';
import {
  getRuntimeSessionNovncUrl,
  getRuntimeSessionStatusLabel,
  isLiveRuntimeSessionState,
  isPreviewRuntimeSessionState,
} from '../lib/runtimeSession';
import { replaceLocalhostWithCurrentHost } from '@/shared/lib/publicUrl';
import {
  EXECUTION_ACTIVE_POLLING_STATUSES,
  EXECUTION_STATUS_COLORS,
  EXECUTION_STATUS_LABELS_EN,
  EXECUTION_STATUS_LABELS_ZH,
} from '@/shared/lib/executionStatusMeta';
import {
  buildWaitingInputDisplayGroups,
} from '@/shared/lib/waitingInputDisplay';
import LiveSessionPreviewCard from '../../../components/runtime/LiveSessionPreviewCard';
import InlineRecoveryPanel from '../components/InlineRecoveryPanel';
import WaitingInputActionPanel from '../components/WaitingInputActionPanel';
import { usePreferencesStore } from '@/shared/store/preferencesStore';

const { Title, Text } = Typography;

const statusColors = EXECUTION_STATUS_COLORS;

const fixLocalhostLink = (url?: string): string | undefined => replaceLocalhostWithCurrentHost(url);

const normalizeLegacyGrossMarginThresholdText = (value?: string): string | undefined => {
  if (!value) {
    return value;
  }

  if (
    !/(毛利率|粗利率|gross.?margin|profit.?margin|自动化承认|承认操作|人工介入|人工接管|阈值|承认标准)/i.test(
      value
    )
  ) {
    return value;
  }

  return value.replace(/(?<![\d.])20(?:\.0+)?(?=\s*%)/g, '15');
};

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
    return isEnglish ? `Append wait ${durationMs ?? 0}ms` : `追加等待 ${durationMs ?? 0}ms`;
  }
  if (type === 'replace_selector') {
    return isEnglish ? `Replace selector: ${selector || '-'}` : `替换选择器: ${selector || '-'}`;
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

  return getPhaseSteps(phase).some((step) => {
    if (step.snapshotId) {
      return true;
    }

    if (extractPhaseStepImageSources(step, getPhaseArtifacts(phase)).length > 0) {
      return true;
    }

    const action = step.action?.trim().toLowerCase();
    return Boolean(action && BROWSER_ACTIVITY_ACTIONS.has(action));
  });
};

const getPhaseSteps = (phase?: ExecutionPhaseDto) =>
  sortExecutionPhaseStepsByTime(
    (Array.isArray(phase?.steps) ? phase.steps : []) as NonNullable<ExecutionPhaseDto['steps']>
  );

const getPhaseArtifacts = (phase?: ExecutionPhaseDto) =>
  sortExecutionPhaseArtifactsByTime(
    (Array.isArray(phase?.artifacts) ? phase.artifacts : []) as ExecutionPhaseArtifactDto[]
  );

const getPhaseTakeovers = (phase?: ExecutionPhaseDto) =>
  (Array.isArray(phase?.takeovers) ? phase.takeovers : []) as ExecutionTakeoverRecordDto[];

const getPhaseLoopIteration = (phase?: ExecutionPhaseDto): number | undefined => {
  const phaseInput = asRecord(tryParseJsonValue(phase?.input));
  const value = phaseInput?.loopIteration;
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
};

const formatPhaseDisplayName = (
  phase: ExecutionPhaseDto,
  isEnglish: boolean,
  fallbackIndex?: number
): string => {
  const baseName =
    normalizeLegacyGrossMarginThresholdText(phase.phaseName || phase.phaseKey) ||
    `${isEnglish ? 'Step' : '步骤'} ${fallbackIndex ?? 0}`;
  const loopIteration = getPhaseLoopIteration(phase);
  return loopIteration
    ? `${baseName} · ${isEnglish ? `Loop ${loopIteration}` : `第 ${loopIteration} 轮`}`
    : baseName;
};

const isExecutionPhaseLike = (value: unknown): value is ExecutionPhaseDto =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const renderExecutionPayloadContent = (
  value: unknown,
  emptyText: string,
  treatSingleResultFieldAsMarkdown = false
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
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{beautifyText(parsedValue)}</ReactMarkdown>
      </div>
    );
  }

  const resultObj = asRecord(parsedValue);
  const resultText = typeof resultObj?.result === 'string' ? resultObj.result : undefined;
  const onlyHasResultField =
    treatSingleResultFieldAsMarkdown && resultObj
      ? Object.keys(resultObj).length === 1 &&
        Object.prototype.hasOwnProperty.call(resultObj, 'result')
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
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{beautifyText(resultText)}</ReactMarkdown>
      </div>
    );
  }

  return (
    <pre
      style={{
        background: 'var(--bg-secondary)',
        color: 'var(--text-primary)',
        border: '1px solid var(--bg-secondary)',
        padding: 12,
        borderRadius: 8,
        overflow: 'auto',
        marginTop: 8,
        lineHeight: '1.6',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {renderJsonValue(parsedValue)}
    </pre>
  );
};

const formatDateTime = (value?: string | null): string =>
  value ? new Date(value).toLocaleString() : '-';

const ExecutionDetailPage: React.FC = () => {
  const runtimeSessionLookupEnabled = true;
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
    takeoverDescDefault: isEnglish
      ? 'The execution requires human intervention.'
      : '该执行需要人工介入处理。',
    takeoverApproveAndContinue: isEnglish ? 'Approve And Continue' : '同意并继续',
    takeoverApproveSuccess: isEnglish
      ? 'Human review accepted, execution resumed'
      : '已同意人工处理结果，执行继续中',
    takeoverApproveFailed: isEnglish ? 'Failed to continue execution' : '继续执行失败',
    approvalRequired: isEnglish ? 'Approval Required' : '需要审批',
    approvalWaiting: isEnglish ? 'Execution is waiting for approval' : '执行正在等待审批',
    approvalStatusPrefix: isEnglish ? 'Current approval status:' : '当前审批状态：',
    approvalDescDefault: isEnglish
      ? 'Review the execution details and decide whether it can continue.'
      : '请先查看执行详情，再决定是否允许继续执行。',
    approveAndContinue: isEnglish ? 'Approve And Continue' : '批准并继续执行',
    rejectExecution: isEnglish ? 'Reject Execution' : '拒绝执行',
    missingInputRequired: isEnglish ? 'Missing Input Required' : '需要补充输入',
    waitingInput: isEnglish ? 'Execution is waiting for additional input' : '执行正在等待补充输入',
    waitingInputDesc: isEnglish
      ? 'Fill in the missing parameters below to resume execution.'
      : '请填写下面缺失的参数后恢复执行。',
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
    browserAuditEvidence: isEnglish ? 'Audit & Takeover Evidence' : '审计与接管证据',
    browserExecutionPlanVersion: isEnglish ? 'Plan Version' : '计划版本',
    browserDegradedMode: isEnglish ? 'Degraded Mode' : '退化模式',
    browserDegradeReason: isEnglish ? 'Degrade Reason' : '退化原因',
    browserCurrentStepId: isEnglish ? 'Current Step ID' : '当前步骤 ID',
    browserCurrentLoopIteration: isEnglish ? 'Loop Iteration' : '循环轮次',
    browserCurrentRiskLevel: isEnglish ? 'Current Risk' : '当前风险',
    browserRiskReason: isEnglish ? 'Risk Reason' : '风险原因',
    browserTakeoverReason: isEnglish ? 'Takeover Reason' : '接管原因',
    browserLastReadValue: isEnglish ? 'Last Read Value' : '最近读取值',
    browserLastBranchDecision: isEnglish ? 'Last Branch Decision' : '最近分支判断',
    browserTraceability: isEnglish ? 'Traceability' : '链路追踪',
    browserRecorderSessionId: isEnglish ? 'Recorder Session' : '录制会话',
    browserExportArtifactId: isEnglish ? 'Export Artifact' : '导出产物',
    browserReleaseId: isEnglish ? 'Release ID' : '发布版本',
    browserSkillDraftId: isEnglish ? 'Skill Draft' : '技能草稿',
    browserPublishedSkillId: isEnglish ? 'Published Skill' : '已发布技能',
    browserRuntimeExecutionId: isEnglish ? 'Runtime Execution' : '运行时执行 ID',
    browserNoOutput: isEnglish ? 'No structured output' : '暂无结构化输出',
    phaseTimeline: isEnglish ? 'Phase Timeline' : '阶段时间线',
    currentPhase: isEnglish ? 'Current Phase' : '当前阶段',
    currentActivity: isEnglish ? 'Current Activity' : '当前 Activity',
    activityProgress: isEnglish ? 'Activity Progress' : 'Activity 进度',
    activityKey: isEnglish ? 'Activity Key' : 'Activity Key',
    activityRetryOrResume: isEnglish ? 'Retry / Resume' : '重试 / 继续',
    activityTakeoverHint: isEnglish
      ? 'Take over this activity before retrying'
      : '如需重试该 Activity，请先接管后继续',
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
    executionResult: isEnglish ? 'Execution Result' : '执行结果',
    humanReview: isEnglish ? 'Human Review' : '人工审查',
    reviewDecision: isEnglish ? 'Review Decision' : '审查结论',
    reviewPhase: isEnglish ? 'Review Phase' : '审查阶段',
    reviewedAt: isEnglish ? 'Reviewed At' : '审查时间',
    reviewContext: isEnglish ? 'Review Context' : '审查背景',
    reviewed: isEnglish ? 'Reviewed' : '已审查',
    manualReviewPending: isEnglish ? 'Waiting for Manual Review' : '待人工处理',
    openCurrentPage: isEnglish ? 'Open Current Page' : '打开当前页面',
    currentPageLink: isEnglish ? 'Current Page' : '当前页面',
    summaryInfo: isEnglish ? 'Summary' : '概要信息',
    operationsArea: isEnglish ? 'Operations' : '操作区域',
    runtimeInfo: isEnglish ? 'Runtime' : '运行时',
    thresholdSetting: isEnglish ? 'Threshold' : '阈值',
    noPendingActions: isEnglish ? 'No pending operations at the moment.' : '当前没有待处理操作。',
    expandPhaseTimeline: isEnglish ? 'Expand phase timeline' : '展开阶段时间线',
    currentStepLabel: isEnglish ? 'Current Step' : '当前步骤',
    currentStepHint: isEnglish ? 'Showing the step that is currently being executed.' : '展示当前正在执行的步骤。',
    executionSummaryTitle: isEnglish ? 'Execution Summary' : '执行总结',
    executionSummaryHint: isEnglish
      ? 'Showing the final outcome and key information after execution ends.'
      : '执行结束后，展示最终结果和关键信息。',
    progressOverview: isEnglish ? 'Progress' : '进度',
    totalActivities: isEnglish ? 'Total Activities' : '总阶段数',
    completedActivities: isEnglish ? 'Completed' : '已完成',
    pendingActivities: isEnglish ? 'Pending' : '待处理',
    loopCount: isEnglish ? 'Loops' : '轮次',
    processedItems: isEnglish ? 'Processed Items' : '处理条数',
    autoApprovedItems: isEnglish ? 'Auto Approved' : '自动承认',
    manualHandledItems: isEnglish ? 'Manual Handling' : '人工处理',
    manualHandledFlag: isEnglish ? 'Manual Intervention' : '人工介入',
    latestUpdate: isEnglish ? 'Latest Update' : '最近更新',
    noSummary: isEnglish ? 'No summary available.' : '暂无总结信息。',
  };
  const statusLabels = isEnglish ? EXECUTION_STATUS_LABELS_EN : EXECUTION_STATUS_LABELS_ZH;
  const statusLabelMap = statusLabels as Record<string, string>;
  const statusColorMap = statusColors as Record<string, string>;
  const getExecutionStatusLabel = React.useCallback(
    (status?: ExecutionStatus | string) => {
      if (!status) {
        return '-';
      }
      if (status === 'human_control') {
        return text.manualReviewPending;
      }
      return statusLabelMap[status] || status;
    },
    [statusLabelMap, text.manualReviewPending]
  );
  const getExecutionStatusColor = React.useCallback(
    (status?: ExecutionStatus | string) => {
      if (!status) {
        return 'default';
      }
      if (status === 'human_control') {
        return 'warning';
      }
      return statusColorMap[status] || 'default';
    },
    [statusColorMap]
  );

  // Fetch execution details
  const {
    data: execution,
    isLoading: isLoadingExecution,
    error: errorExecution,
  } = useQuery<ExecutionDto, Error>(['execution', id], () => executionApi.getById(id!), {
    enabled: !!id,
    refetchInterval: (data) => {
      if (!data) return false;
      return EXECUTION_ACTIVE_POLLING_STATUSES.includes(data.status) ? 3000 : false;
    },
  });

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

  const { data: skillsData } = useQuery(['execution-detail-skills-name-map'], () =>
    skillApi.list()
  );
  const { data: releasesData } = useQuery(['execution-detail-published-skills-name-map'], () =>
    capabilityReleaseApi.listReleaseCenter()
  );

  const skillNameMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (releasesData?.releases || []).forEach((release) => {
      if (release.publishedSkillId) {
        map.set(
          release.publishedSkillId,
          release.sourceName || release.sourceId || release.publishedSkillId
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

  const waitingInputStep =
    execution?.status === 'waiting_input'
      ? steps?.find(
          (step) =>
            step.id === execution.currentStepId ||
            (step.type === 'input_collection' && step.status === 'running')
        )
      : undefined;

  const requiredInputs = Array.isArray(waitingInputStep?.inputJson?.requiredInputs)
    ? (waitingInputStep.inputJson.requiredInputs as unknown as RequiredInputField[])
    : [];
  const requiredInputGroups = React.useMemo(
    () => buildWaitingInputDisplayGroups(requiredInputs),
    [requiredInputs]
  );
  const semantic = execution?.semantic;
  const parsedResult = asRecord(tryParseJsonValue(execution?.resultJson));
  const normalizedResult = resolveExecutionNormalizedResult(execution);
  const browserExecutionResult = extractBrowserExecutionResult(execution?.resultJson);
  const executionPhases = (phasesData || execution?.phases || []).filter(isExecutionPhaseLike);
  const sortedExecutionPhases = React.useMemo(
    () => [...executionPhases].sort(compareExecutionPhases),
    [executionPhases]
  );
  const timeSortedExecutionPhases = React.useMemo(
    () => [...executionPhases].sort(compareExecutionPhasesByTime),
    [executionPhases]
  );
  const isExecutionActive = Boolean(
    execution && EXECUTION_ACTIVE_POLLING_STATUSES.includes(execution.status)
  );
  const workflowActivityPhases = React.useMemo(
    () =>
      timeSortedExecutionPhases
        .filter((phase) => phase.phaseType === 'workflow_activity')
        .sort(compareExecutionPhasesByTime),
    [timeSortedExecutionPhases]
  );
  const displayActivityPhases = React.useMemo(
    () => timeSortedExecutionPhases,
    [timeSortedExecutionPhases]
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
    [browserExecutionResult, effectiveResultJson]
  );
  const resultPreviewValue = normalizedResult?.structuredData ?? normalizedResult?.envelope;
  const primaryResultText =
    normalizedResult?.detailText || normalizedResult?.summary || normalizedResult?.body;
  const shouldRenderPrimaryAsMarkdown =
    normalizedResult?.detailFormat === 'markdown' || normalizedResult?.summaryFormat === 'markdown';
  const shouldShowStructuredResult = Boolean(
    resultPreviewValue !== undefined &&
    resultPreviewValue !== null &&
    (normalizedResult?.envelope?.presentation?.preferStructuredView ||
      normalizedResult?.structuredData !== undefined ||
      !primaryResultText)
  );
  const phaseRuntimeSessionId = React.useMemo(
    () =>
      [...sortedExecutionPhases]
        .reverse()
        .find(
          (phase) =>
            typeof phase.runtimeSessionId === 'string' && phase.runtimeSessionId.trim().length > 0
        )?.runtimeSessionId,
    [sortedExecutionPhases]
  );
  const executionRuntimeSessionId =
    execution?.runtimeSessionId ||
    effectiveBrowserExecutionResult?.runtimeSessionId ||
    phaseRuntimeSessionId;
  const isBrowserExecution = React.useMemo(
    () =>
      hasBrowserExecutionEvidence({
        runtimeType: execution?.runtimeType,
        runtimeSessionId: executionRuntimeSessionId,
        browserExecutionResult: effectiveBrowserExecutionResult,
        phases: sortedExecutionPhases,
      }) || sortedExecutionPhases.some((phase) => isBrowserWorkflowActivity(phase)),
    [
      effectiveBrowserExecutionResult,
      execution?.runtimeType,
      executionRuntimeSessionId,
      sortedExecutionPhases,
    ]
  );
  const displayRuntimeType = isBrowserExecution ? 'browser' : execution?.runtimeType || '-';
  const hasWorkflowActivityPhases = workflowActivityPhases.length > 0;
  const shouldShowLegacySteps = React.useMemo(
    () => sortedExecutionPhases.length === 0,
    [sortedExecutionPhases]
  );
  const semanticOverviewCard: React.ReactNode =
    semantic && execution?.status !== 'waiting_input' ? (
    <SemanticOverviewCard semantic={semantic} text={text} />
    ) : null;
  const waitingInputSummary =
    typeof semantic?.summary === 'string' && semantic.summary.trim()
      ? semantic.summary.trim()
      : text.waitingInputDesc;
  const { data: runtimeSession } = useQuery(
    ['execution-runtime-session', executionRuntimeSessionId],
    () => runtimeSessionApi.getByIdOrExecutionId(executionRuntimeSessionId!, execution?.id),
    {
      enabled: runtimeSessionLookupEnabled && Boolean(executionRuntimeSessionId),
      refetchInterval: (data) => {
        if (isLiveRuntimeSessionState(data?.state)) {
          return 3000;
        }
        return execution && EXECUTION_ACTIVE_POLLING_STATUSES.includes(execution.status)
          ? 3000
          : false;
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
  const stableRuntimeSessionNovncUrl =
    runtimeSessionNovncUrl || lastKnownRuntimeSessionNovncUrlRef.current;
  const executionInput = execution ? extractExecutionDisplayInput(execution) : undefined;
  const currentPhase = React.useMemo(() => {
    const latestPhases = [...displayActivityPhases].reverse();
    return (
      latestPhases.find(
        (phase) =>
          phase.phaseKey === execution?.currentPhaseKey &&
          ['running', 'retrying', 'waiting_takeover', 'resumable', 'pending'].includes(
            phase.status
          )
      ) ||
      latestPhases.find((phase) => phase.phaseKey === execution?.currentPhaseKey) ||
      latestPhases.find((phase) => ['running', 'retrying'].includes(phase.status)) ||
      latestPhases.find((phase) =>
        ['waiting_takeover', 'resumable', 'pending'].includes(phase.status)
      ) ||
      latestPhases[0]
    );
  }, [execution?.currentPhaseKey, displayActivityPhases]);
  const latestPhaseWithReview = React.useMemo(
    () =>
      [...sortedExecutionPhases].reverse().find((phase) => {
        const recoveryDecision = asRecord(tryParseJsonValue(phase.recoveryDecision));
        return getPhaseTakeovers(phase).length > 0 || Boolean(recoveryDecision);
      }),
    [sortedExecutionPhases]
  );
  const takeoverFocusPhase = React.useMemo(() => {
    if (currentPhase) {
      const currentRecoveryDecision = asRecord(tryParseJsonValue(currentPhase.recoveryDecision));
      if (getPhaseTakeovers(currentPhase).length > 0 || currentRecoveryDecision) {
        return currentPhase;
      }
    }
    return latestPhaseWithReview;
  }, [currentPhase, latestPhaseWithReview]);
  const failedCurrentPhaseStep = React.useMemo(() => {
    const phaseSteps = getPhaseSteps(currentPhase);
    return (
      phaseSteps.find((step) => ['failed', 'takeover_required', 'blocked'].includes(step.status)) ||
      phaseSteps.find((step) => step.status !== 'completed') ||
      phaseSteps[phaseSteps.length - 1]
    );
  }, [currentPhase]);
  const failedCurrentPhaseStepId = React.useMemo(() => {
    if (failedCurrentPhaseStep?.stepId || failedCurrentPhaseStep?.id) {
      return failedCurrentPhaseStep.stepId || failedCurrentPhaseStep.id;
    }
    return execution?.currentStepId;
  }, [execution?.currentStepId, failedCurrentPhaseStep]);
  const currentPhaseDetailUrl = React.useMemo(() => {
    if (!currentPhase) {
      return undefined;
    }
    const phaseSteps = [...getVisiblePhaseSteps({ ...currentPhase, steps: getPhaseSteps(currentPhase) })].reverse();
    for (const step of phaseSteps) {
      const stepUrl = fixLocalhostLink(extractPhaseStepUrl(step));
      if (stepUrl) {
        return stepUrl;
      }
    }
    return undefined;
  }, [currentPhase]);
  const defaultResumeFromCurrentPhaseStepId = React.useMemo(() => {
    const phaseSteps = getPhaseSteps(currentPhase);
    if (!failedCurrentPhaseStepId) {
      return undefined;
    }
    const failedIndex = phaseSteps.findIndex(
      (step) => (step.stepId || step.id) === failedCurrentPhaseStepId
    );
    if (failedIndex >= 0 && phaseSteps[failedIndex + 1]) {
      return phaseSteps[failedIndex + 1].stepId || phaseSteps[failedIndex + 1].id;
    }
    return failedCurrentPhaseStepId;
  }, [currentPhase, failedCurrentPhaseStepId]);
  const currentPhaseLoopIteration = React.useMemo(() => {
    const phaseInput = asRecord(tryParseJsonValue(currentPhase?.input));
    const value = phaseInput?.loopIteration;
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
      return value;
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isInteger(parsed) && parsed > 0) {
        return parsed;
      }
    }
    return undefined;
  }, [currentPhase?.input]);
  const latestExecutionReview = React.useMemo(() => {
    const entries = sortedExecutionPhases.flatMap((phase) => {
      const recoveryDecision = asRecord(tryParseJsonValue(phase.recoveryDecision));
      const recoveryComment =
        typeof recoveryDecision?.comment === 'string' && recoveryDecision.comment.trim()
          ? recoveryDecision.comment.trim()
          : undefined;
      const takeoverEntries = getPhaseTakeovers(phase).map((takeover) => ({
        phaseKey: phase.phaseKey,
        phaseName: phase.phaseName,
        note: takeover.resolutionNote || recoveryComment,
        reason: takeover.reason || phase.errorMessage,
        createdAt: takeover.createdAt,
        resolvedAt: takeover.resolvedAt,
        status: takeover.status,
      }));

      if (takeoverEntries.length > 0) {
        return takeoverEntries;
      }

      if (!recoveryComment) {
        return [];
      }

      return [
        {
          phaseKey: phase.phaseKey,
          phaseName: phase.phaseName,
          note: recoveryComment,
          reason: phase.errorMessage,
          createdAt: phase.createdAt,
          resolvedAt: phase.completedAt || phase.updatedAt,
          status: phase.status,
        },
      ];
    });

    const meaningfulEntries = entries.filter((entry) => entry.note || entry.reason);
    meaningfulEntries.sort((left, right) => {
      const leftTime = new Date(left.resolvedAt || left.createdAt || 0).getTime();
      const rightTime = new Date(right.resolvedAt || right.createdAt || 0).getTime();
      return leftTime - rightTime;
    });
    return meaningfulEntries[meaningfulEntries.length - 1];
  }, [sortedExecutionPhases]);
  const shouldShowCurrentPhaseInfo = Boolean(
    execution &&
    (execution.status === 'running' ||
      execution.status === 'human_control' ||
      execution.status === 'failed')
  );
  const shouldShowLiveProgressInfo = Boolean(
    execution &&
    (execution.status === 'running' ||
      execution.status === 'human_control' ||
      execution.status === 'failed')
  );

  const submitInputMutation = useMutation(
    (values: Record<string, unknown>) =>
      executionApi.submitInput(id!, {
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

  const approveMutation = useMutation(() => executionApi.approve(id!), {
    onSuccess: () => {
      void queryClient.invalidateQueries(['execution-phases', id]);
      void message.success(text.executionApproved);
      void queryClient.invalidateQueries(['execution', id]);
      void queryClient.invalidateQueries(['execution-steps', id]);
    },
    onError: (error: Error) => {
      void message.error(`${text.approveFailed}: ${error.message}`);
    },
  });

  const rejectMutation = useMutation(() => executionApi.reject(id!), {
    onSuccess: () => {
      void message.success(text.executionRejected);
      void queryClient.invalidateQueries(['execution', id]);
      void queryClient.invalidateQueries(['execution-steps', id]);
    },
    onError: (error: Error) => {
      void message.error(`${text.rejectFailed}: ${error.message}`);
    },
  });
  const approveAndContinueMutation = useMutation(
    async () => {
      const phaseKey = execution?.currentPhaseKey || currentPhase?.phaseKey;
      const comment = isEnglish ? 'Approved by human review and continue' : '同意并继续';
      const resumeStepId = defaultResumeFromCurrentPhaseStepId;
      const payload = {
        stepId: resumeStepId || execution?.currentStepId || undefined,
        comment,
      };
      if (phaseKey) {
        if (currentPhase?.status === 'waiting_takeover' && failedCurrentPhaseStepId) {
          await executionApi.reconcilePhaseTakeover(id!, phaseKey, {
            patch: {
              type: 'resolve_by_human',
              failedStepId: failedCurrentPhaseStepId,
              ...(currentPhaseLoopIteration ? { loopIteration: currentPhaseLoopIteration } : {}),
              ...(resumeStepId && resumeStepId !== failedCurrentPhaseStepId
                ? { resumeFromStepId: resumeStepId }
                : {}),
              note: comment,
            },
            comment,
          });
        }
        return executionApi.resumePhaseTakeover(id!, phaseKey, payload);
      }
      return executionApi.releaseHumanControl(id!, payload);
    },
    {
      onSuccess: () => {
        void message.success(text.takeoverApproveSuccess);
        void queryClient.invalidateQueries(['execution', id]);
        void queryClient.invalidateQueries(['execution-steps', id]);
        void queryClient.invalidateQueries(['execution-phases', id]);
      },
      onError: (error: Error) => {
        void message.error(`${text.takeoverApproveFailed}: ${error.message}`);
      },
    }
  );
  if (isLoadingExecution) {
    return (
      <div
        style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}
      >
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
          action={<Button onClick={() => navigate('/executions')}>{text.backToExecutions}</Button>}
        />
      </div>
    );
  }

  const getCurrentStepIndex = () => {
    if (!steps || !execution.currentStepId) return -1;
    return steps.findIndex((s) => s.id === execution.currentStepId);
  };
  const currentStepIndex = getCurrentStepIndex();
  const currentExecutionStep =
    currentStepIndex >= 0 && steps?.[currentStepIndex] ? steps[currentStepIndex] : undefined;
  const completedActivityCount = displayActivityPhases.filter(
    (phase) => phase.status === 'completed'
  ).length;
  const pendingActivityCount = Math.max(displayActivityPhases.length - completedActivityCount, 0);
  const totalLoopCount = displayActivityPhases.reduce((maxLoop, phase) => {
    const loopIteration = getPhaseLoopIteration(phase);
    return loopIteration && loopIteration > maxLoop ? loopIteration : maxLoop;
  }, 0);
  const shouldShowExecutionSummary = ['succeeded', 'failed', 'cancelled'].includes(execution.status);
  const activityProgressCurrent = Math.max(
    displayActivityPhases.findIndex((phase) => phase.id === currentPhase?.id),
    0
  );
  const loopSummary = buildExecutionLoopSummary(displayActivityPhases, isEnglish);
  const summaryHeadline =
    normalizedResult?.summary ||
    normalizedResult?.body ||
    normalizedResult?.title ||
    loopSummary?.summaryText ||
    execution.failureReason ||
    execution.takeoverReason ||
    undefined;
  const latestActivityUpdateAt =
    currentPhase?.updatedAt ||
    currentPhase?.completedAt ||
    currentPhase?.startedAt ||
    currentPhase?.createdAt ||
    execution.endedAt ||
    execution.updatedAt;

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
        <Space>
          {stepStatusIcons[status]} {stepStatusLabels[status]?.[isEnglish ? 'en' : 'zh'] || status}
        </Space>
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
      render: (error?: string) => (error ? <Text type="danger">{error}</Text> : '-'),
    },
    {
      title: text.duration,
      key: 'duration',
      render: (_: unknown, record: ExecutionStepDto) => {
        if (record.startedAt && record.endedAt) {
          const duration =
            new Date(record.endedAt).getTime() - new Date(record.startedAt).getTime();
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
              subtitle={
                execution.endedAt ? new Date(execution.endedAt).toLocaleString() : undefined
              }
              color="gray"
              preview={renderSummaryChips([
                {
                  label: text.browserBackend,
                  value: effectiveBrowserExecutionResult.backend || '-',
                  color: 'blue',
                },
                {
                  label: text.browserStepCount,
                  value: effectiveBrowserExecutionResult.stepResults.length,
                  color: 'processing',
                },
                {
                  label: text.status,
                  value: getExecutionStatusLabel(execution.status),
                  color: getExecutionStatusColor(execution.status),
                },
              ])}
              details={renderTimelineDetails([
                {
                  label: text.browserRuntimeSessionId,
                  value: effectiveBrowserExecutionResult.runtimeSessionId || '-',
                },
                {
                  label: 'Runtime',
                  value: {
                    backend: effectiveBrowserExecutionResult.backend,
                    runtimeSessionId: effectiveBrowserExecutionResult.runtimeSessionId,
                    stepCount: effectiveBrowserExecutionResult.stepResults.length,
                    failedStep: effectiveBrowserExecutionResult.failedStep,
                    failedAction: effectiveBrowserExecutionResult.failedAction,
                  },
                },
              ])}
            />
          ),
        },
        ...effectiveBrowserExecutionResult.stepResults.map((stepResult, index) => {
          const outputDisplay = buildBrowserOutputDisplay(stepResult.output || null);
          const waitSeconds = resolveBrowserWaitSeconds(stepResult, stepResult.output || null);
          const isWaitStep = stepResult.action === 'wait';
          const imageSources =
            outputDisplay.imageSources.length > 0
              ? outputDisplay.imageSources
              : outputDisplay.imageSrc
                ? [outputDisplay.imageSrc]
                : [];

          return {
            color: getBrowserStepColor(
              stepResult,
              index,
              effectiveBrowserExecutionResult.stepResults.length,
              Boolean(effectiveBrowserExecutionResult.failedStep)
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
                  Boolean(effectiveBrowserExecutionResult.failedStep)
                )}
                preview={
                  <Space direction="vertical" size={10} style={{ width: '100%' }}>
                    {isWaitStep ? (
                      renderSummaryChips([
                        {
                          label: '等待',
                          value: waitSeconds ? `${waitSeconds} 秒` : '-',
                          color: 'processing',
                        },
                        {
                          label: 'status',
                          value: outputDisplay.status || '-',
                          color: outputDisplay.status === 'success' ? 'green' : 'default',
                        },
                      ])
                    ) : (
                      <>
                        {renderSummaryChips([
                          {
                            label: text.action,
                            value: stepResult.action || '-',
                            color: 'processing',
                          },
                          {
                            label: text.browserTarget,
                            value: stepResult.target || '-',
                            color: 'blue',
                          },
                          {
                            label: text.browserSnapshotId,
                            value: stepResult.snapshotId || '-',
                            color: 'default',
                          },
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
                  {
                    label: 'Step',
                    value: {
                      stepId: stepResult.stepId,
                      name: stepResult.name,
                      action: stepResult.action,
                      target: stepResult.target,
                      snapshotId: stepResult.snapshotId,
                    },
                  },
                  {
                    label: text.browserStepOutput,
                    value: outputDisplay.details || text.browserNoOutput,
                  },
                ])}
              />
            ),
          };
        }),
      ]
    : [];
  const browserAuditEvidenceCard: React.ReactNode =
    isBrowserExecution &&
    effectiveBrowserExecutionResult &&
    hasBrowserAuditEvidence(effectiveBrowserExecutionResult) ? (
      <Card title={text.browserAuditEvidence} style={{ marginBottom: 16 }}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Descriptions column={2} size="small">
            <Descriptions.Item label={text.browserExecutionPlanVersion}>
              {effectiveBrowserExecutionResult.executionPlanVersion || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={text.browserDegradedMode}>
              <Tag color={effectiveBrowserExecutionResult.degradedMode ? 'orange' : 'green'}>
                {effectiveBrowserExecutionResult.degradedMode ? text.yes : text.no}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label={text.browserDegradeReason} span={2}>
              {effectiveBrowserExecutionResult.degradeReason || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={text.browserCurrentStepId}>
              {effectiveBrowserExecutionResult.runtimeEvidence?.currentStepId || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={text.browserCurrentLoopIteration}>
              {effectiveBrowserExecutionResult.runtimeEvidence?.currentLoopIteration ?? '-'}
            </Descriptions.Item>
            <Descriptions.Item label={text.browserCurrentRiskLevel}>
              {effectiveBrowserExecutionResult.runtimeEvidence?.currentRiskLevel || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={text.browserRiskReason}>
              {effectiveBrowserExecutionResult.runtimeEvidence?.riskReason || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={text.browserTakeoverReason} span={2}>
              {effectiveBrowserExecutionResult.runtimeEvidence?.takeoverReason ||
                execution.takeoverReason ||
                '-'}
            </Descriptions.Item>
          </Descriptions>

          {effectiveBrowserExecutionResult.runtimeEvidence?.lastReadValue ? (
            <div>
              <Text strong>{text.browserLastReadValue}</Text>
              <pre
                style={{
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--bg-secondary)',
                  padding: 12,
                  borderRadius: 8,
                  overflow: 'auto',
                  marginTop: 8,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {renderJsonValue(effectiveBrowserExecutionResult.runtimeEvidence.lastReadValue)}
              </pre>
            </div>
          ) : null}

          {effectiveBrowserExecutionResult.runtimeEvidence?.lastBranchDecision ? (
            <div>
              <Text strong>{text.browserLastBranchDecision}</Text>
              <pre
                style={{
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--bg-secondary)',
                  padding: 12,
                  borderRadius: 8,
                  overflow: 'auto',
                  marginTop: 8,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {renderJsonValue(
                  effectiveBrowserExecutionResult.runtimeEvidence.lastBranchDecision
                )}
              </pre>
            </div>
          ) : null}

          {effectiveBrowserExecutionResult.trace?.recorderSessionId ||
          effectiveBrowserExecutionResult.trace?.exportArtifactId ||
          effectiveBrowserExecutionResult.trace?.releaseId ||
          effectiveBrowserExecutionResult.trace?.skillDraftId ||
          effectiveBrowserExecutionResult.trace?.publishedSkillId ||
          effectiveBrowserExecutionResult.trace?.runtimeExecutionId ? (
            <Descriptions column={2} size="small" title={text.browserTraceability}>
              <Descriptions.Item label={text.browserRecorderSessionId}>
                {effectiveBrowserExecutionResult.trace?.recorderSessionId || '-'}
              </Descriptions.Item>
              <Descriptions.Item label={text.browserExportArtifactId}>
                {effectiveBrowserExecutionResult.trace?.exportArtifactId || '-'}
              </Descriptions.Item>
              <Descriptions.Item label={text.browserReleaseId}>
                {effectiveBrowserExecutionResult.trace?.releaseId || '-'}
              </Descriptions.Item>
              <Descriptions.Item label={text.browserSkillDraftId}>
                {effectiveBrowserExecutionResult.trace?.skillDraftId || '-'}
              </Descriptions.Item>
              <Descriptions.Item label={text.browserPublishedSkillId}>
                {effectiveBrowserExecutionResult.trace?.publishedSkillId ||
                  execution.skillId ||
                  '-'}
              </Descriptions.Item>
              <Descriptions.Item label={text.browserRuntimeExecutionId}>
                {effectiveBrowserExecutionResult.trace?.runtimeExecutionId || '-'}
              </Descriptions.Item>
            </Descriptions>
          ) : null}
        </Space>
      </Card>
    ) : null;
  const executionInfoRecord = asRecord(tryParseJsonValue(execution.resultJson));
  const executionInfoTemporalLink = fixLocalhostLink(
    normalizedResult?.temporalLink ||
      (typeof executionInfoRecord?.temporalLink === 'string'
        ? executionInfoRecord.temporalLink
        : undefined)
  );

  const browserExecutionSummaryCard: React.ReactNode =
    isBrowserExecution && displayActivityPhases.length > 0 && shouldShowExecutionSummary ? (
      <Card title={text.executionSummaryTitle} style={{ marginBottom: 16 }}>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Space wrap size={[8, 8]}>
            <Tag color={getExecutionStatusColor(execution.status)}>
              {getExecutionStatusLabel(execution.status)}
            </Tag>
            <Tag>{`${text.totalActivities}: ${displayActivityPhases.length}`}</Tag>
            <Tag color="green">{`${text.completedActivities}: ${completedActivityCount}`}</Tag>
            {totalLoopCount > 0 ? <Tag>{`${text.loopCount}: ${totalLoopCount}`}</Tag> : null}
          </Space>
          <Alert
            type={
              execution.status === 'succeeded'
                ? 'success'
                : execution.status === 'failed'
                  ? 'error'
                  : 'warning'
            }
            showIcon
            message={summaryHeadline || text.noSummary}
            description={
              <Space wrap size={[12, 8]}>
                <Text type="secondary">{text.executionSummaryHint}</Text>
                {execution.endedAt ? (
                  <Text type="secondary">{`${text.endedAt}: ${formatDateTime(execution.endedAt)}`}</Text>
                ) : null}
                {execution.failureReason ? (
                  <Text type="danger">{execution.failureReason}</Text>
                ) : null}
              </Space>
            }
          />
          <Descriptions column={2} size="small">
            <Descriptions.Item label={text.progressOverview}>
              {`${completedActivityCount} / ${displayActivityPhases.length}`}
            </Descriptions.Item>
            <Descriptions.Item label={text.latestUpdate}>
              {formatDateTime(latestActivityUpdateAt)}
            </Descriptions.Item>
            {loopSummary ? (
              <Descriptions.Item label={text.processedItems}>
                {loopSummary.totalItems}
              </Descriptions.Item>
            ) : null}
            {loopSummary ? (
              <Descriptions.Item label={text.manualHandledFlag}>
                {loopSummary.hasManualHandling ? text.yes : text.no}
              </Descriptions.Item>
            ) : null}
            {loopSummary ? (
              <Descriptions.Item label={text.autoApprovedItems}>
                {`${loopSummary.autoApprovedCount} ${isEnglish ? 'items' : '条'}`}
              </Descriptions.Item>
            ) : null}
            {loopSummary ? (
              <Descriptions.Item label={text.manualHandledItems}>
                {`${loopSummary.manualHandledCount} ${isEnglish ? 'items' : '条'}`}
              </Descriptions.Item>
            ) : null}
            {shouldShowLiveProgressInfo && currentPhase ? (
              <Descriptions.Item label={text.currentPhase}>
                {formatPhaseDisplayName(currentPhase, isEnglish, activityProgressCurrent + 1)}
              </Descriptions.Item>
            ) : null}
            {shouldShowLiveProgressInfo && currentExecutionStep ? (
              <Descriptions.Item label={text.currentStepLabel}>
                {normalizeLegacyGrossMarginThresholdText(currentExecutionStep.name) ||
                  `${text.step} ${currentExecutionStep.stepIndex + 1}`}
              </Descriptions.Item>
            ) : null}
          </Descriptions>
        </Space>
      </Card>
    ) : null;
  const activityProgressCard: React.ReactNode =
    isBrowserExecution && displayActivityPhases.length > 0 && !shouldShowExecutionSummary ? (
      <Card title={text.stepsProgress} style={{ marginBottom: 16 }}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Space wrap size={[8, 8]}>
            <Tag color={getExecutionStatusColor(execution.status)}>
              {getExecutionStatusLabel(execution.status)}
            </Tag>
            {currentPhaseLoopIteration ? (
              <Tag>{`${text.loopCount}: ${currentPhaseLoopIteration}`}</Tag>
            ) : null}
            <Text type="secondary">{text.currentStepHint}</Text>
          </Space>
          <Space wrap size={[12, 8]}>
            <Text type="secondary">{`${text.progressOverview}: ${activityProgressCurrent + 1} / ${displayActivityPhases.length}`}</Text>
            <Text type="secondary">{`${text.completedActivities}: ${completedActivityCount}`}</Text>
            <Text type="secondary">{`${text.pendingActivities}: ${pendingActivityCount}`}</Text>
            {latestActivityUpdateAt ? (
              <Text type="secondary">{`${text.latestUpdate}: ${formatDateTime(latestActivityUpdateAt)}`}</Text>
            ) : null}
          </Space>
          <Steps
            current={activityProgressCurrent}
            size="small"
            responsive
            style={{ marginBottom: 0 }}
            items={displayActivityPhases.map((phase, index) => {
              const isCurrentActivity = currentPhase?.id === phase.id;
              return {
                title: formatPhaseDisplayName(phase, isEnglish, index + 1),
                status: getPhaseStepStatus(phase.status),
                description: (
                  <Space wrap size={[8, 4]}>
                    <Tag color={getPhaseStatusColor(phase.status)}>
                      {getPhaseStatusLabel(phase.status, isEnglish)}
                    </Tag>
                    {isCurrentActivity ? <Tag color="processing">{text.currentActivity}</Tag> : null}
                  </Space>
                ),
              };
            })}
          />
        </Space>
      </Card>
    ) : null;
  const takeoverFocusRecoveryDecision = asRecord(
    tryParseJsonValue(takeoverFocusPhase?.recoveryDecision)
  );
  const takeoverFocusTakeovers = getPhaseTakeovers(takeoverFocusPhase);
  const latestTakeoverRecord =
    takeoverFocusTakeovers.length > 0
      ? takeoverFocusTakeovers[takeoverFocusTakeovers.length - 1]
      : undefined;
  const executionReviewResultCard: React.ReactNode =
    execution && latestExecutionReview ? (
      <Card title={text.executionResult} style={{ marginBottom: 16 }}>
        <Descriptions column={2} size="small">
          <Descriptions.Item label={text.status}>
            <Tag color={getExecutionStatusColor(execution.status)}>
              {getExecutionStatusLabel(execution.status)}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label={text.humanReview}>
            <Tag color="blue">{text.reviewed}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label={text.reviewDecision} span={2}>
            <Text strong>{latestExecutionReview.note || '-'}</Text>
          </Descriptions.Item>
          <Descriptions.Item label={text.reviewPhase}>
            {latestExecutionReview.phaseName || latestExecutionReview.phaseKey || '-'}
          </Descriptions.Item>
          <Descriptions.Item label={text.reviewedAt}>
            {formatDateTime(latestExecutionReview.resolvedAt || latestExecutionReview.createdAt)}
          </Descriptions.Item>
          {latestExecutionReview.reason ? (
            <Descriptions.Item label={text.reviewContext} span={2}>
              {latestExecutionReview.reason}
            </Descriptions.Item>
          ) : null}
        </Descriptions>
      </Card>
    ) : null;
  const takeoverRecoveryCard: React.ReactNode =
    takeoverFocusPhase && (takeoverFocusTakeovers.length > 0 || takeoverFocusRecoveryDecision) ? (
      <Card title={isEnglish ? 'Takeover Recovery' : '接管恢复信息'} style={{ marginBottom: 16 }}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Descriptions column={2} size="small">
            <Descriptions.Item label={text.reviewPhase}>
              {takeoverFocusPhase.phaseName || takeoverFocusPhase.phaseKey}
            </Descriptions.Item>
            <Descriptions.Item label={text.status}>
              <Tag color={getPhaseStatusColor(takeoverFocusPhase.status)}>
                {getPhaseStatusLabel(takeoverFocusPhase.status, isEnglish)}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label={isEnglish ? 'Latest Takeover' : '最近接管'}>
              {latestTakeoverRecord ? (
                <Space wrap size={[8, 4]}>
                  <Tag
                    color={
                      latestTakeoverRecord.status === 'resolved'
                        ? 'green'
                        : latestTakeoverRecord.status === 'requested'
                          ? 'orange'
                          : 'default'
                    }
                  >
                    {latestTakeoverRecord.status}
                  </Tag>
                  <Text type="secondary">
                    {new Date(latestTakeoverRecord.createdAt).toLocaleString()}
                  </Text>
                </Space>
              ) : (
                '-'
              )}
            </Descriptions.Item>
            <Descriptions.Item label={isEnglish ? 'Recovery Patch' : '恢复补丁'}>
              {getRecoveryPatchSummary(takeoverFocusRecoveryDecision?.patch, isEnglish) || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={text.failureReason} span={2}>
              {latestTakeoverRecord?.reason || takeoverFocusPhase.errorMessage || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={isEnglish ? 'Resolution Note' : '处理说明'} span={2}>
              {latestTakeoverRecord?.resolutionNote ||
                (typeof takeoverFocusRecoveryDecision?.comment === 'string'
                  ? takeoverFocusRecoveryDecision.comment
                  : '-')}
            </Descriptions.Item>
          </Descriptions>

          {takeoverFocusTakeovers.length > 0 ? (
            <Timeline
              items={takeoverFocusTakeovers.map((takeover) => ({
                color:
                  takeover.status === 'resolved'
                    ? 'green'
                    : takeover.status === 'requested'
                      ? 'orange'
                      : 'gray',
                children: (
                  <Space direction="vertical" size={4} style={{ width: '100%' }}>
                    <Space wrap size={[8, 4]}>
                      <Tag
                        color={
                          takeover.status === 'resolved'
                            ? 'green'
                            : takeover.status === 'requested'
                              ? 'orange'
                              : 'default'
                        }
                      >
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
                    {takeover.requestedBy || takeover.resolvedBy ? (
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

          {takeoverFocusRecoveryDecision ? (
            <div>
              <Text strong>{isEnglish ? 'Recovery Decision Payload' : '恢复决策详情'}</Text>
              <pre
                style={{
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--bg-secondary)',
                  padding: 12,
                  borderRadius: 8,
                  overflow: 'auto',
                  marginTop: 8,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {renderJsonValue(takeoverFocusRecoveryDecision)}
              </pre>
            </div>
          ) : null}
        </Space>
      </Card>
    ) : null;
  const phaseDetailsCard: React.ReactNode =
    isBrowserExecution && displayActivityPhases.length > 0 ? (
      <Card title={text.phaseTimeline} style={{ marginBottom: 16 }}>
        <Collapse
          size="small"
          items={[
            {
              key: 'phase-timeline',
              label: `${text.expandPhaseTimeline} (${displayActivityPhases.length})`,
              children: (
                <Timeline
                  items={displayActivityPhases.map((phase) => {
                    const phaseSteps = getPhaseSteps(phase);
                    const phaseSnapshotSources = extractWorkflowActivitySnapshotSources(phase);
                    const phaseArtifacts = getPhaseArtifacts(phase);
                    return {
                      color: getPhaseStatusColor(phase.status),
                      children: (
                        <Card size="small">
                          <Space direction="vertical" size={12} style={{ width: '100%' }}>
                            <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
                              <Space wrap>
                                <Text strong>{formatPhaseDisplayName(phase, isEnglish)}</Text>
                                <Tag color={getPhaseStatusColor(phase.status)}>
                                  {getPhaseStatusLabel(phase.status, isEnglish)}
                                </Tag>
                                <Tag>{phase.phaseType}</Tag>
                              </Space>
                              <Text type="secondary">
                                {formatDateTime(phase.startedAt || phase.createdAt)}
                              </Text>
                            </Space>

                            <Space wrap size={[12, 4]}>
                              <Text type="secondary">{`${text.phaseAttempt}: ${phase.attempt}`}</Text>
                              <Text type="secondary">{`${text.phaseSteps}: ${getPhaseSteps(phase).length}`}</Text>
                              <Text type="secondary">{`${text.phaseArtifactCount}: ${phaseArtifacts.length}`}</Text>
                            </Space>

                            {phase.errorMessage &&
                            !(execution.status === 'human_control' && currentPhase?.id === phase.id) ? (
                              <Alert
                                type="error"
                                showIcon
                                message={phase.errorCode || text.phaseActionFailed}
                                description={phase.errorMessage}
                              />
                            ) : null}

                            {phaseSnapshotSources.length > 0 ? (
                              <div>
                                <Text strong>{text.phaseArtifacts}</Text>
                                <div style={{ marginTop: 8 }}>
                                  <Image.PreviewGroup>
                                    <Space wrap size={12}>
                                      {phaseSnapshotSources.map((src, index) => (
                                        <Image
                                          key={`${phase.id}-snapshot-${index + 1}`}
                                          src={src}
                                          alt={`${phase.phaseName || phase.phaseKey}-snapshot-${index + 1}`}
                                          style={{
                                            width: 320,
                                            maxWidth: '100%',
                                            maxHeight: 320,
                                            objectFit: 'contain',
                                            background: 'var(--bg-secondary)',
                                            borderRadius: 8,
                                            border: '1px solid var(--bg-secondary)',
                                            padding: 6,
                                          }}
                                        />
                                      ))}
                                    </Space>
                                  </Image.PreviewGroup>
                                </div>
                              </div>
                            ) : null}

                            {phaseSteps.length > 0 ? (
                              <Timeline
                                items={phaseSteps.map((step) => {
                                  const stepImageSources = extractPhaseStepImageSources(
                                    step,
                                    phaseArtifacts
                                  );
                                  const stepUrl = extractPhaseStepUrl(step);
                                  return {
                                    color: getPhaseStatusColor(step.status),
                                    children: (
                                      <Card size="small" styles={{ body: { padding: 12 } }}>
                                        <Space direction="vertical" size={10} style={{ width: '100%' }}>
                                          <Space
                                            wrap
                                            style={{ width: '100%', justifyContent: 'space-between' }}
                                          >
                                            <Space wrap>
                                              <Text strong>{`${text.step} ${step.stepIndex}`}</Text>
                                              <Text>{step.action || '-'}</Text>
                                              <Tag color={getPhaseStatusColor(step.status)}>
                                                {step.status}
                                              </Tag>
                                            </Space>
                                            <Text type="secondary">
                                              {formatDateTime(step.startedAt || step.createdAt)}
                                            </Text>
                                          </Space>
                                          {stepUrl ? (
                                            <Text copyable={{ text: stepUrl }}>{stepUrl}</Text>
                                          ) : null}
                                          {step.errorMessage ? (
                                            <Alert
                                              type="error"
                                              showIcon
                                              message={text.phaseActionFailed}
                                              description={step.errorMessage}
                                            />
                                          ) : null}
                                          {stepImageSources.length > 0 ? (
                                            <Image.PreviewGroup>
                                              <Space wrap size={12}>
                                                {stepImageSources.map((src, index) => (
                                                  <Image
                                                    key={`${src}-${index}`}
                                                    src={src}
                                                    alt={`${phase.phaseName || phase.phaseKey}-step-${index + 1}`}
                                                    style={{
                                                      width: 320,
                                                      maxWidth: '100%',
                                                      maxHeight: 320,
                                                      objectFit: 'contain',
                                                      background: 'var(--bg-secondary)',
                                                      borderRadius: 8,
                                                      border: '1px solid var(--bg-secondary)',
                                                      padding: 6,
                                                    }}
                                                  />
                                                ))}
                                              </Space>
                                            </Image.PreviewGroup>
                                          ) : null}
                                        </Space>
                                      </Card>
                                    ),
                                  };
                                })}
                              />
                            ) : (
                              <Empty
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                                description={text.phaseNoData}
                              />
                            )}
                          </Space>
                        </Card>
                      ),
                    };
                  })}
                />
              ),
            },
          ]}
        />
      </Card>
    ) : null;
  const browserSummaryCard: React.ReactNode =
    isBrowserExecution && execution ? (
      <Card
        title={text.summaryInfo}
        size="small"
        style={{ marginBottom: 12 }}
        styles={{ body: { padding: 12 } }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gap: 6,
          }}
        >
            <div
              style={{
                minWidth: 0,
                padding: 10,
                borderRadius: 8,
                border: '1px solid var(--bg-secondary)',
                background: 'var(--bg-card)',
              }}
            >
              <Text type="secondary">{text.status}</Text>
              <div style={{ marginTop: 6 }}>
                <Tag color={statusColors[execution.status]} style={{ marginInlineEnd: 0 }}>
                  {statusLabels[execution.status]}
                </Tag>
              </div>
            </div>
            <div
              style={{
                minWidth: 0,
                padding: 10,
                borderRadius: 8,
                border: '1px solid var(--bg-secondary)',
                background: 'var(--bg-card)',
              }}
            >
              <Text type="secondary">{isEnglish ? 'Skill' : '技能'}</Text>
              <div style={{ marginTop: 6 }}>
                <Text strong ellipsis={{ tooltip: getSkillDisplayName(execution.skillId) }}>
                  {getSkillDisplayName(execution.skillId)}
                </Text>
              </div>
            </div>
            <div
              style={{
                minWidth: 0,
                padding: 10,
                borderRadius: 8,
                border: '1px solid var(--bg-secondary)',
                background: 'var(--bg-card)',
              }}
            >
              <Text type="secondary">{text.runtimeInfo}</Text>
              <div style={{ marginTop: 6 }}>
                <Text strong>{displayRuntimeType}</Text>
              </div>
            </div>
            <div
              style={{
                minWidth: 0,
                padding: 10,
                borderRadius: 8,
                border: '1px solid var(--bg-secondary)',
                background: 'var(--bg-card)',
              }}
            >
              <Text type="secondary">{text.idLabel}</Text>
              <div style={{ marginTop: 6 }}>
                <Text copyable={{ text: execution.id }} strong>
                  {execution.id.length > 18
                    ? `${execution.id.slice(0, 8)}...${execution.id.slice(-4)}`
                    : execution.id}
                </Text>
              </div>
            </div>
        </div>
      </Card>
    ) : null;
  const browserActionAreaCard: React.ReactNode =
    isBrowserExecution && execution ? (
      execution.status === 'human_control' ? (
        <InlineRecoveryPanel
          title={text.operationsArea}
          executionId={execution.id}
          executionStatus={execution.status}
          currentStepId={execution.currentStepId}
          phase={currentPhase}
          hideStatusAlert
          auxiliaryContent={
            execution.takeoverReason || currentPhaseDetailUrl ? (
              <Space direction="vertical" size={6} style={{ width: '100%' }}>
                {execution.takeoverReason ? (
                  <div style={{ display: 'grid', gap: 2 }}>
                    <Text type="secondary">{text.browserTakeoverReason}</Text>
                    <Text>{execution.takeoverReason}</Text>
                  </div>
                ) : null}
                {currentPhaseDetailUrl ? (
                  <Space wrap size={[8, 4]}>
                    <Text type="secondary">{`${text.currentPageLink}:`}</Text>
                    <Typography.Link
                      href={currentPhaseDetailUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      copyable
                    >
                      {currentPhaseDetailUrl}
                    </Typography.Link>
                  </Space>
                ) : null}
              </Space>
            ) : undefined
          }
          extraActions={
            <Button
              type="default"
              icon={<CheckCircleOutlined />}
              loading={approveAndContinueMutation.isLoading}
              onClick={() => approveAndContinueMutation.mutate()}
            >
              {text.takeoverApproveAndContinue}
            </Button>
          }
        />
      ) : execution.status === 'pending_approval' ? (
        <Card
          title={text.operationsArea}
          size="small"
          style={{ marginBottom: 16 }}
          styles={{ body: { padding: 16 } }}
        >
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Alert
              type="warning"
              showIcon
              message={text.approvalWaiting}
              description={
                execution.approvalStatus
                  ? `${text.approvalStatusPrefix} ${execution.approvalStatus}`
                  : text.approvalDescDefault
              }
            />
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
                paddingTop: 12,
                borderTop: '1px solid var(--bg-secondary)',
              }}
            >
              <Text type="secondary" style={{ fontSize: 13 }}>
                {text.approvalDescDefault}
              </Text>
              <Space wrap size={[8, 8]}>
                <Button
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  loading={approveMutation.isLoading}
                  onClick={() => approveMutation.mutate()}
                >
                  {text.approveAndContinue}
                </Button>
                <Button
                  danger
                  ghost
                  icon={<CloseOutlined />}
                  loading={rejectMutation.isLoading}
                  onClick={() => rejectMutation.mutate()}
                >
                  {text.rejectExecution}
                </Button>
              </Space>
            </div>
          </Space>
        </Card>
      ) : execution.status === 'waiting_input' && waitingInputStep ? (
        <WaitingInputActionPanel
          title={text.operationsArea}
          cardSize="small"
          summaryText={waitingInputSummary}
          requiredInputs={requiredInputs}
          requiredInputGroups={requiredInputGroups}
          submitLoading={submitInputMutation.isLoading}
          onSubmit={(values) => {
            try {
              handleSubmitInput(
                normalizeRequiredInputValues(values, requiredInputs, { treatArrayAsJson: true })
              );
            } catch (error) {
              void message.error(error instanceof Error ? error.message : text.invalidJson);
            }
          }}
          submitLabel={text.submitAndResume}
          resetLabel={text.reset}
          provideFieldPrefix={text.provideField}
          sourceLabel={text.source}
          enterJsonString={text.enterJsonString}
          enterFieldPrefix={text.enterField}
          confirmTagLabel={isEnglish ? 'Needs confirmation' : '待确认'}
        />
      ) : (
        <Card
          title={text.operationsArea}
          size="small"
          style={{ marginBottom: 16 }}
          styles={{ body: { padding: 16 } }}
        >
          <Alert type="info" showIcon message={text.noPendingActions} />
        </Card>
      )
    ) : null;
  const nonBrowserExecutionInfoCard: React.ReactNode = !isBrowserExecution ? (
    <Card style={{ marginBottom: 16 }}>
      <Descriptions column={2}>
        <Descriptions.Item label={text.status}>
          <Tag color={statusColors[execution.status]}>{statusLabels[execution.status]}</Tag>
        </Descriptions.Item>
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
  ) : null;

  return (
    <div style={{ padding: 16 }}>
      {/* Header */}
      <div style={{ marginBottom: 12 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <Title level={3} style={{ margin: 0 }}>
            {text.details}
          </Title>
          <Button size="small" icon={<ArrowLeftOutlined />} onClick={() => navigate('/executions')}>
            {text.backToExecutions}
          </Button>
        </div>
      </div>

      {isBrowserExecution ? browserSummaryCard : null}

      {nonBrowserExecutionInfoCard}

      {/* Takeover Alert */}
      {!isBrowserExecution && execution.status === 'human_control' ? (
        <Card title={text.manualReviewPending} style={{ marginBottom: 16 }}>
          <Alert
            type="warning"
            message={text.manualReviewPending}
            description={
              <div style={{ display: 'grid', gap: 8 }}>
                <p style={{ marginBottom: 0 }}>{execution.takeoverReason || text.takeoverDescDefault}</p>
                {shouldShowCurrentPhaseInfo && currentPhase ? (
                  <Text type="secondary">{`${text.currentPhase}: ${currentPhase.phaseName || currentPhase.phaseKey}`}</Text>
                ) : null}
                {currentPhaseDetailUrl ? (
                  <Space wrap size={[8, 4]}>
                    <Text type="secondary">{`${text.currentPageLink}:`}</Text>
                    <Typography.Link
                      href={currentPhaseDetailUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      copyable
                    >
                      {currentPhaseDetailUrl}
                    </Typography.Link>
                  </Space>
                ) : null}
              </div>
            }
            icon={<WarningOutlined />}
            showIcon
            style={{ marginBottom: 16 }}
          />
          <Space>
            <Button
              type="primary"
              loading={approveAndContinueMutation.isLoading}
              onClick={() => approveAndContinueMutation.mutate()}
            >
              {text.takeoverApproveAndContinue}
            </Button>
            {currentPhaseDetailUrl ? (
              <Button href={currentPhaseDetailUrl} target="_blank" rel="noopener noreferrer">
                {text.openCurrentPage}
              </Button>
            ) : null}
          </Space>
        </Card>
      ) : null}

      {!isBrowserExecution && execution.status === 'pending_approval' ? (
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
            <Button
              type="primary"
              loading={approveMutation.isLoading}
              onClick={() => approveMutation.mutate()}
            >
              {text.approveAndContinue}
            </Button>
            <Button
              danger
              loading={rejectMutation.isLoading}
              onClick={() => rejectMutation.mutate()}
            >
              {text.rejectExecution}
            </Button>
          </Space>
        </Card>
      ) : null}

      {!isBrowserExecution && execution.status === 'waiting_input' && waitingInputStep ? (
        <WaitingInputActionPanel
          title={text.missingInputRequired}
          summaryText={waitingInputSummary}
          requiredInputs={requiredInputs}
          requiredInputGroups={requiredInputGroups}
          submitLoading={submitInputMutation.isLoading}
          onSubmit={(values) => {
            try {
              handleSubmitInput(
                normalizeRequiredInputValues(values, requiredInputs, { treatArrayAsJson: true })
              );
            } catch (error) {
              void message.error(error instanceof Error ? error.message : text.invalidJson);
            }
          }}
          submitLabel={text.submitAndResume}
          resetLabel={text.reset}
          provideFieldPrefix={text.provideField}
          sourceLabel={text.source}
          enterJsonString={text.enterJsonString}
          enterFieldPrefix={text.enterField}
          confirmTagLabel={isEnglish ? 'Needs confirmation' : '待确认'}
        />
      ) : null}

      {isBrowserExecution &&
      stableRuntimeSessionNovncUrl &&
      (isExecutionActive || isPreviewRuntimeSessionState(runtimeSession?.state)) ? (
        <div style={{ marginBottom: 16 }}>
          <LiveSessionPreviewCard
            novncUrl={stableRuntimeSessionNovncUrl}
            title={isEnglish ? 'Live Browser View' : '实时画面'}
            statusLabel={getRuntimeSessionStatusLabel(runtimeSession?.state, isEnglish)}
            height={420}
          />
        </div>
      ) : null}

      {isBrowserExecution ? browserActionAreaCard : null}

      {browserExecutionSummaryCard}

      {!isBrowserExecution ? (
        <InlineRecoveryPanel
          executionId={execution.id}
          executionStatus={execution.status}
          currentStepId={execution.currentStepId}
          phase={currentPhase}
        />
      ) : null}

      {!isBrowserExecution ? executionReviewResultCard : null}

      {!isBrowserExecution ? takeoverRecoveryCard : null}

      {!isBrowserExecution ? browserAuditEvidenceCard : null}

      {activityProgressCard}

      {phaseDetailsCard}

      {!isBrowserExecution && React.isValidElement(semanticOverviewCard) ? semanticOverviewCard : null}

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
                {shouldShowStructuredResult
                  ? renderExecutionPayloadContent(
                      resultPreviewValue,
                      isEnglish ? 'No structured result' : '暂无结构化结果'
                    )
                  : null}
              </Space>
            ) : (
              renderExecutionPayloadContent(
                effectiveResultJson,
                isEnglish ? 'No result output' : '暂无结果输出',
                true
              )
            )}
          </div>
        </Card>
      ) : null}

      {!isBrowserExecution &&
      isBrowserExecution &&
      effectiveBrowserExecutionResult &&
      !isExecutionActive &&
      !hasWorkflowActivityPhases ? (
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

      {isBrowserExecution &&
      !displayActivityPhases.length &&
      shouldShowLegacySteps &&
      steps &&
      steps.length > 0 ? (
        <Card title={text.stepsProgress} style={{ marginBottom: 16 }}>
          <Steps
            current={getCurrentStepIndex()}
            size="small"
            style={{ marginBottom: 24 }}
            items={steps.map((step, index) => ({
              title:
                normalizeLegacyGrossMarginThresholdText(step.name) ||
                `${text.step} ${index + 1}`,
              status: step.status as 'wait' | 'process' | 'finish' | 'error',
              description: stepStatusLabels[step.status]?.[isEnglish ? 'en' : 'zh'] || step.action,
            }))}
          />
        </Card>
      ) : null}

      {/* Steps Table */}
      {!isBrowserExecution && isBrowserExecution ? (
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
              description={
                isEnglish
                  ? 'This execution is driven by phases and activity steps. Legacy execution steps are hidden to avoid showing stale error records.'
                  : '该执行当前以阶段与 Activity 步骤为主视图，已隐藏旧版顶层步骤，避免继续显示恢复前的历史错误。'
              }
            />
          )}
        </Card>
      ) : null}
    </div>
  );
};

export default ExecutionDetailPage;
