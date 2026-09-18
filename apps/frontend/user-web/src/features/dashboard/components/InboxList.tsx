import {
  ArrowRightOutlined,
  BellOutlined,
  CheckCircleFilled,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleFilled,
  DeleteOutlined,
  DownloadOutlined,
  DownOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  EyeOutlined,
  FileWordOutlined,
  FolderOutlined,
  InboxOutlined,
  LoadingOutlined,
  MailOutlined,
  RobotOutlined,
  RollbackOutlined,
  SendOutlined,
  SwapOutlined,
  ThunderboltOutlined,
  UndoOutlined,
  UpOutlined,
} from "@ant-design/icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "react-query";
import { InboxContentPreview } from "./InboxContentPreview";
import {
  getContractComparisonPair,
  triggerContractComparisonInAi,
} from "../lib/contractComparisonHelper";
import {
  PARAM_LABEL_MAP,
  formatParamValue,
} from "./CoordinationActionModal";
import { replaceLocalhostWithCurrentHost } from "@/shared/utils/publicUrl";
import { useChatStore } from "../../chat";
import { useAuthStore } from "@/shared/store/authStore";
import { workbenchCoordinationApi } from "@/api/workbenchCoordination";
import {
  Button,
  Card,
  Empty,
  Input,
  List,
  Popconfirm,
  Segmented,
  Space,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import { useNavigate } from "react-router-dom";
import type { ExecutionDto } from "@ops/user-core";
import type { WorkbenchInboxItem } from "../../../api/workbenchInbox";
import type { WorkbenchInboxFilter } from "../hooks/useWorkbenchInbox";
import { InterventionList } from "./InterventionList";
import { InboxTaskDetailModal } from "./InboxTaskDetailModal";
import { classifyWorkflowNode, extractRollbackReason, extractApprovalComment } from "../lib/coordinationNodeClassifier";
import {
  applyOptimisticCoordinationSend,
  rollbackOptimisticCoordinationSend,
} from "../lib/coordinationOptimistic";
import { formatMonthDayTime } from "../../../shared/utils/dateText";
import styles from "../pages/DashboardPage.module.css";
import inboxStyles from "./InboxList.module.css";

interface InboxListProps {
  inboxItems: WorkbenchInboxItem[];
  inboxFilter: WorkbenchInboxFilter;
  inboxSummary: {
    total: number;
    unprocessed: number;
    clarified: number;
    converted: number;
    archived: number;
  };
  inboxDraft: string;
  clarifyingIds: Record<string, boolean>;
  isSyncingEmail?: boolean;
  priorityItems?: ExecutionDto[];
  onOpenExecution?: (executionId: string) => void;
  onIgnorePriorityItem?: (executionId: string) => void;
  onIgnoreAllPriorityItems?: () => void;
  onViewAllExecutions?: () => void;
  onLaunchAiAssistant?: (prompt: string) => void;
  getExecutionDisplayDescription?: (execution: ExecutionDto) => string;
  getExecutionDisplayTime?: (execution: ExecutionDto) => string;
  getSkillDisplayName?: (skillId?: string) => string;
  onFilterChange: (filter: WorkbenchInboxFilter) => void;
  onDraftChange: (draft: string) => void;
  onQuickIngest: () => void;
  onSyncEmail?: () => void;
  onClarifyItem: (item: WorkbenchInboxItem) => void;
  onConvertToTodo: (id: string) => void;
  onArchiveItem: (id: string) => void;
  onUnarchiveItem?: (id: string) => void;
  onDeleteItem: (id: string) => void;
}

export function InboxList({
  inboxItems,
  inboxFilter,
  inboxSummary,
  inboxDraft,
  clarifyingIds: _clarifyingIds,
  isSyncingEmail,
  priorityItems = [],
  onOpenExecution,
  onIgnorePriorityItem,
  onIgnoreAllPriorityItems,
  onViewAllExecutions,
  onLaunchAiAssistant,
  getExecutionDisplayDescription,
  getExecutionDisplayTime,
  getSkillDisplayName,
  onFilterChange,
  onDraftChange,
  onQuickIngest,
  onSyncEmail,
  onClarifyItem: _onClarifyItem,
  onConvertToTodo,
  onArchiveItem,
  onUnarchiveItem,
  onDeleteItem,
}: InboxListProps) {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const queryClient = useQueryClient();
  const [quickSendingId, setQuickSendingId] = useState<string | null>(null);
  const [detailModalItem, setDetailModalItem] = useState<WorkbenchInboxItem | null>(null);
  const [optimisticSentIds, setOptimisticSentIds] = useState<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const displayInboxItems: WorkbenchInboxItem[] = useMemo(() => {
    if (optimisticSentIds.size === 0) return inboxItems;
    return inboxItems.filter((i: WorkbenchInboxItem) => !optimisticSentIds.has(i.id));
  }, [inboxItems, optimisticSentIds]);

  const displaySummary = useMemo(() => {
    if (optimisticSentIds.size === 0) return inboxSummary;
    const sentCount = optimisticSentIds.size;
    return {
      ...inboxSummary,
      unprocessed: Math.max(0, inboxSummary.unprocessed - sentCount),
      total: Math.max(0, inboxSummary.total - sentCount),
    };
  }, [inboxSummary, optimisticSentIds]);

  const handleQuickCoordAction = async (item: WorkbenchInboxItem) => {
    try {
      setQuickSendingId(item.id);
      const nodeSemantics = classifyWorkflowNode(item, user?.username, user?.id);
      const payload = (item.unifiedPayload || {}) as Record<string, any>;

      // 针对归档/回执节点，快捷指令直接执行条目已阅归档
      if (nodeSemantics.cardActionType === 'archive') {
        onArchiveItem(item.id);
        void workbenchCoordinationApi.submitAction(item.id, {
          action: 'approve',
          comment: '协同回执已阅并归档。',
        }).catch(() => {});
        void message.success(`已归档「${nodeSemantics.displayTitle || item.title}」，可在「已厘清/归档」中查阅`);
        void queryClient.invalidateQueries(['workbench-inbox']);
        void queryClient.invalidateQueries(['workbench-inbox-summary']);
        return;
      }

      const isAssignment = payload.taskType === 'assignment' || nodeSemantics.cardActionType === 'flow';
      const actionType =
        nodeSemantics.cardActionType === 'send'
          ? 'approve'
          : isAssignment
          ? 'complete'
          : 'approve';

      // 立即执行乐观 UI 迁移：条目瞬间离开「待整理」，直接进入「已发事项」！
      if (nodeSemantics.cardActionType === 'send' || actionType === 'approve' || actionType === 'complete') {
        setOptimisticSentIds((prev) => new Set(prev).add(item.id));
        applyOptimisticCoordinationSend(queryClient, item, user);
      }

      void message.success(
        nodeSemantics.cardActionType === 'send'
          ? `已提交送审！系统正在进行智能合规诊断，已自动迁移至「已发事项」。`
          : `已成功处理「${nodeSemantics.displayTitle || item.title}」，已自动迁移至「已发事项」！`
      );

      await workbenchCoordinationApi.submitAction(item.id, {
        action: actionType,
        comment:
          nodeSemantics.cardActionText === '重新发送'
            ? '已重新核验材料，重新提交发送后台审查。'
            : nodeSemantics.cardActionType === 'send'
            ? '初稿已核对无误，快捷发送提交流转。'
            : isAssignment
            ? '事项已完成，快捷提交流转。'
            : '审核通过，快捷流转至下一节点。',
      });

      const triggerRefresh = () => {
        void queryClient.invalidateQueries(['workbench-inbox']);
        void queryClient.invalidateQueries(['workbench-inbox-summary']);
        void queryClient.invalidateQueries(['workbench-todos']);
        void queryClient.invalidateQueries(['workbench-todos-summary']);
        void queryClient.invalidateQueries(['workbench-coordination-sent-tasks']);
      };

      triggerRefresh();
      setTimeout(triggerRefresh, 1500);
      setTimeout(triggerRefresh, 4000);
      setTimeout(triggerRefresh, 8000);
    } catch (err: any) {
      setOptimisticSentIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      rollbackOptimisticCoordinationSend(queryClient, item, user);
      if (err?.message?.includes('未找到协同任务') || err?.response?.status === 404) {
        void message.warning('该协同任务已在其他环节流转或已更新，已为您自动刷新最新状态');
        void queryClient.invalidateQueries(['workbench-inbox']);
        void queryClient.invalidateQueries(['workbench-inbox-summary']);
        void queryClient.invalidateQueries(['workbench-todos']);
        void queryClient.invalidateQueries(['workbench-coordination-sent-tasks']);
        return;
      }
      void message.error(err?.message || '操作失败，您可点击「详细」进行处理');
    } finally {
      setQuickSendingId(null);
    }
  };

  const handleRecallItem = async (item: WorkbenchInboxItem) => {
    try {
      const rawTaskId = item.sourceRefId || item.id;
      const taskId = rawTaskId.startsWith('coord_coord_')
        ? rawTaskId.replace(/^(?:coord_)+/, 'coord_')
        : rawTaskId;
      await workbenchCoordinationApi.recallTask(taskId, '发起人从收集箱撤回事项');
      void message.success(`已成功撤回「${item.title}」，事项已退回至您的「待办」，您可重新编辑并再次发送。`);
      void queryClient.invalidateQueries(['workbench-inbox']);
      void queryClient.invalidateQueries(['workbench-inbox-summary']);
      void queryClient.invalidateQueries(['workbench-todos']);
      void queryClient.invalidateQueries(['workbench-todos-summary']);
      void queryClient.invalidateQueries(['workbench-coordination-sent-tasks']);
    } catch (err: any) {
      void message.error(err?.message || '撤回失败，请重试');
    }
  };

  const handleRemindItem = (item: WorkbenchInboxItem) => {
    const nodeSemantics = classifyWorkflowNode(item, user?.username, user?.id);
    const assigneeName = nodeSemantics.currentAssigneeName || '处理担当';
    void message.success(`已向处理担当 @${assigneeName} 发送催办提醒，已催促尽快办理！`);
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleCollectClick = () => {
    if (!inboxDraft.trim()) {
      // 1. 输入框抖动闪烁提示几下
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);

      // 2. 输入框下方红字显示 3 秒钟
      setErrorMessage("请先输入要收集的内容，再点击收集到收件箱");
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        setErrorMessage(null);
      }, 3000);
      return;
    }

    setErrorMessage(null);
    onQuickIngest();
  };


  const handleDraftChange = (val: string) => {
    if (errorMessage && val.trim()) {
      setErrorMessage(null);
    }
    onDraftChange(val);
  };

  const renderSourceTag = (sourceType: string) => {
    switch (sourceType) {
      case "chat":
        return (
          <Tag color="cyan" icon={<RobotOutlined />}>
            智能协同
          </Tag>
        );
      case "email":
        return (
          <Tag color="gold" icon={<MailOutlined />}>
            邮件
          </Tag>
        );
      case "schedule":
        return (
          <Tag color="geekblue" icon={<ClockCircleOutlined />}>
            定时任务
          </Tag>
        );
      case "im_channel":
        return <Tag color="purple">IM 消息</Tag>;
      case "workflow":
        return (
          <Tag color="blue" icon={<ThunderboltOutlined />}>
            工作流
          </Tag>
        );
      default:
        return <Tag color="default">手动便签</Tag>;
    }
  };

  const renderConfidenceTag = (item: WorkbenchInboxItem) => {
    const extra = (item.extra || item.unifiedPayload?.extra || {}) as Record<string, any>;
    const isIntervention = Boolean(
      extra.requiresHumanIntervention || item.title?.includes("需人工介入")
    );
    if (isIntervention) {
      return (
        <Tag color="error" icon={<EyeOutlined />}>
          需人工介入
        </Tag>
      );
    }

    const score = Math.round(item.confidence * 100);
    if (score >= 75) {
      return (
        <Tooltip title={`要素完整度评分: ${score}%`}>
          <Tag color="success" icon={<CheckCircleOutlined />}>
            要素完整 · {score}%
          </Tag>
        </Tooltip>
      );
    }
    return (
      <Tooltip
        title={`置信度 ${score}%: 条目要素（动作/时间/主体）不够清晰，建议点击上方「AI 智能整理」深度厘清`}
      >
        <Tag color="warning" icon={<RobotOutlined />}>
          建议整理 · {score}%
        </Tag>
      </Tooltip>
    );
  };

  const renderStatusTag = (status: string) => {
    switch (status) {
      case "unprocessed":
        return (
          <Tag color="processing" style={{ margin: 0, fontWeight: 500 }}>
            未整理
          </Tag>
        );
      case "clarified":
        return (
          <Tag color="cyan" style={{ margin: 0, fontWeight: 500 }}>
            已AI厘清
          </Tag>
        );
      case "converted":
        return (
          <Tag
            color="success"
            icon={<CheckCircleOutlined />}
            style={{ margin: 0, fontWeight: 500 }}
          >
            已转待办
          </Tag>
        );
      case "archived":
        return (
          <Tag color="default" style={{ margin: 0 }}>
            已归档
          </Tag>
        );
      default:
        return null;
    }
  };

  const renderPriorityTag = (priority?: string) => {
    switch (priority) {
      case "urgent":
        return <Tag color="error">紧急</Tag>;
      case "high":
        return <Tag color="warning">高优先级</Tag>;
      case "medium":
        return <Tag color="processing">中优先级</Tag>;
      case "low":
        return <Tag color="default">低优先级</Tag>;
      default:
        return priority ? <Tag color="default">{priority}</Tag> : null;
    }
  };

  const handleOpenTaskInAiChat = (item: WorkbenchInboxItem) => {
    const payload = (item.unifiedPayload || {}) as Record<string, any>;
    const params = payload.parameters || {};
    const attachments = (payload.attachments || []) as Array<{
      name: string;
      url?: string;
      size?: number;
      mimeType?: string;
    }>;
    const directUrl =
      params.downloadUrl ||
      params.fileUrl ||
      params.contractUrl ||
      (payload.metadata as any)?.generatedDocUrl;

    const effectiveAttachments = [...attachments];
    if (directUrl && !effectiveAttachments.some((a) => a.url === directUrl)) {
      effectiveAttachments.push({
        name:
          params.fileName ||
          params.contractFileName ||
          (params.contractTitle ? `${params.contractTitle}.docx` : `${item.title}.docx`),
        url: directUrl,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
    }

    useChatStore.getState().openWithTaskContext({
      taskId: item.id,
      taskTitle: item.title,
      workflowId: payload.workflowId,
      taskContent: item.rawContent,
      parameters: params,
      attachments: effectiveAttachments,
    });
  };

  const renderMainContent = (item: WorkbenchInboxItem) => {
    const isExpanded = Boolean(expandedIds[item.id]);
    const payload = (item.unifiedPayload || {}) as Record<string, any>;
    const isCoordination = payload.kind === "coordination";
    const params = payload.parameters || {};
    const hasParams = isCoordination && Object.keys(params).length > 0;
    const isLeave = payload.workflowId === 'hr.leave.request' || Boolean(params.leaveType);
    const content = item.rawContent || "";
    const linesCount = (content.match(/\n/g) || []).length + 1;
    const isLong = linesCount >= 5 || content.length > 180;

    const attachments = ((payload.attachments || []) as Array<{ name: string; url?: string; size?: number }>);
    const directUrl =
      params.downloadUrl ||
      params.fileUrl ||
      params.contractUrl ||
      (payload.metadata as any)?.generatedDocUrl;

    const nodeSemantics = classifyWorkflowNode(item, user?.username, user?.id);
    const rollbackReason = nodeSemantics.isRevisionRequired
      ? (nodeSemantics.rollbackReason || extractRollbackReason(item, payload))
      : undefined;
    const approvalComment = !nodeSemantics.isRevisionRequired
      ? (nodeSemantics.approvalComment || extractApprovalComment(item, payload))
      : undefined;

    const effectiveDownloadUrl =
      attachments.find((a) => a.url)?.url ||
      directUrl ||
      undefined;

    const effectiveDocName =
      attachments[0]?.name ||
      params.fileName ||
      params.contractFileName ||
      (params.contractTitle ? `${params.contractTitle}.docx` : '文档初稿.docx');

    return (
      <div className={inboxStyles["inbox-content-container"]}>
        {/* 需重修 / 驳回理由卡片提示 */}
        {nodeSemantics.isRevisionRequired && rollbackReason ? (
          <div
            style={{
              marginBottom: 8,
              padding: '8px 12px',
              borderRadius: 6,
              background: 'rgba(255, 77, 79, 0.08)',
              border: '1px solid rgba(255, 77, 79, 0.28)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
            }}
          >
            <CloseCircleFilled style={{ color: '#ff4d4f', fontSize: 14, marginTop: 3, flexShrink: 0 }} />
            <div style={{ fontSize: 12.5, lineHeight: 1.5, minWidth: 0, flex: 1 }}>
              <span style={{ color: '#cf1322', fontWeight: 600 }}>驳回批注与修改意见：</span>
              <span style={{ color: 'var(--text-primary, #1f1f1f)', fontWeight: 500, wordBreak: 'break-word' }}>
                {rollbackReason}
              </span>
            </div>
          </div>
        ) : null}

        {/* 审批通过 / 办结批注提示 */}
        {!nodeSemantics.isRevisionRequired && approvalComment ? (
          <div
            style={{
              marginBottom: 8,
              padding: '8px 12px',
              borderRadius: 6,
              background: 'rgba(82, 196, 26, 0.08)',
              border: '1px solid rgba(82, 196, 26, 0.28)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
            }}
          >
            <CheckCircleFilled style={{ color: '#52c41a', fontSize: 14, marginTop: 3, flexShrink: 0 }} />
            <div style={{ fontSize: 12.5, lineHeight: 1.5, minWidth: 0, flex: 1 }}>
              <span style={{ color: '#389e0d', fontWeight: 600 }}>审批通过批注 / 流转说明：</span>
              <span style={{ color: 'var(--text-primary, #1f1f1f)', fontWeight: 500, wordBreak: 'break-word' }}>
                {approvalComment}
              </span>
            </div>
          </div>
        ) : null}

        {hasParams ? (
          <div className={inboxStyles["inbox-params-box"]}>
            {isLeave ? (
              <Space direction="vertical" size={3} style={{ width: "100%" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Tag color="blue">{params.leaveType || "请假"}</Tag>
                  <span>时长：<strong>{params.durationHours || 4} 小时</strong></span>
                </div>
                <div>起止时间：{params.startTime} ~ {params.endTime}</div>
                <div>请假事由：{params.reason || "无"}</div>
                {params.handoverPerson ? <div>交接人：{params.handoverPerson}</div> : null}
              </Space>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, lineHeight: 1.5 }}>
                {/* 相对方主体与地址 */}
                {params.counterpartyName ? (
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>相对方：</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                      {params.counterpartyName}
                    </span>
                    {params.counterpartyRole ? (
                      <Tag color="cyan" style={{ margin: 0, fontSize: 11, padding: '0 4px', lineHeight: '18px' }}>
                        {params.counterpartyRole}
                      </Tag>
                    ) : null}
                    {params.counterpartyAddress ? (
                      <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
                        (📍 {params.counterpartyAddress})
                      </span>
                    ) : null}
                  </div>
                ) : null}

                {/* 我方主体与角色 */}
                {params.ourParty || params.ourRole ? (
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>我方：</span>
                    <span style={{ color: 'var(--text-primary)' }}>
                      <strong>{params.ourParty || '我方'}</strong>
                      {params.ourRole ? (
                        <Tag color="blue" style={{ marginLeft: 6, fontSize: 11, padding: '0 4px', lineHeight: '18px' }}>
                          {params.ourRole}
                        </Tag>
                      ) : null}
                    </span>
                  </div>
                ) : null}

                {/* 合作业务事项 */}
                {params.cooperationSubject && params.cooperationSubject !== '商业拓展与业务技术合作' ? (
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>合作事项：</span>
                    <span style={{ color: 'var(--text-primary)' }}>{params.cooperationSubject}</span>
                  </div>
                ) : null}

                {/* 签署日期 */}
                {params.signDate ? (
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>签署日期：</span>
                    <span style={{ color: 'var(--text-primary)' }}>{params.signDate}</span>
                  </div>
                ) : null}

                {/* 金额 / 违约约定 */}
                {params.penaltyAmount !== undefined || params.contractAmount !== undefined || params.amount !== undefined ? (
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
                      {params.penaltyAmount !== undefined ? '违约金：' : '涉及金额：'}
                    </span>
                    <span style={{ color: '#d4380d', fontWeight: 600 }}>
                      ¥{Number(params.penaltyAmount ?? params.contractAmount ?? params.amount).toLocaleString()} 元
                    </span>
                  </div>
                ) : null}

                {/* 仅在用户真实指定立场时才显示 */}
                {params.myPosition && ['seller', 'neutral'].includes(params.myPosition) ? (
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>合同立场：</span>
                    <span style={{ color: 'var(--text-primary)' }}>{formatParamValue('myPosition', params.myPosition)}</span>
                  </div>
                ) : null}

                {/* 其它非合同特定自定义参数（如果存在且非内部冗余字段） */}
                {Object.entries(params)
                  .filter(([k]) => ![
                    'downloadUrl', 'fileUrl', 'contractUrl', 'fileName', 'contractFileName',
                    'executionId', 'remarks', 'contractTitle', 'contractType', 'currentStage',
                    'myPosition', 'durationYears', 'counterpartyName', 'counterpartyAddress',
                    'counterpartyRole', 'ourParty', 'ourRole', 'cooperationSubject',
                    'signDate', 'penaltyAmount', 'contractAmount', 'amount', 'isDraftReplaced',
                    'originalDraftUrl', 'originalDraftFileName', 'originalDraftSize', 'rawContent', 'text'
                  ].includes(k))
                  .map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', gap: 6 }}>
                      <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{PARAM_LABEL_MAP[k] || k}：</span>
                      <span>{formatParamValue(k, v)}</span>
                    </div>
                  ))}

                {/* 快捷展开完整详情 */}
                <div style={{ marginTop: 2 }}>
                  <Button
                    type="link"
                    size="small"
                    style={{ padding: 0, height: 'auto', fontSize: 12 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDetailModalItem(item);
                    }}
                  >
                    查看完整要件与诉求 ›
                  </Button>
                </div>
              </div>
            )}

            {effectiveDownloadUrl ? (
              <div
                style={{
                  marginTop: 8,
                  padding: '6px 10px',
                  background: 'rgba(22, 119, 255, 0.08)',
                  borderRadius: 6,
                  border: '1px solid rgba(22, 119, 255, 0.22)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Space size={6}>
                  <FileWordOutlined style={{ color: '#1677ff', fontSize: 16 }} />
                  <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-primary)' }}>
                    {effectiveDocName}
                  </span>
                </Space>
                <Button
                  size="small"
                  type="primary"
                  icon={<DownloadOutlined />}
                  href={replaceLocalhostWithCurrentHost(effectiveDownloadUrl)}
                  target="_blank"
                  download={effectiveDocName}
                  onClick={(e) => e.stopPropagation()}
                >
                  下载
                </Button>
              </div>
            ) : null}

            {/* 通用 AI 协同助手快捷入口：带入文档与要求作为上下文 */}
            {(() => {
              const itemComparisonPair = getContractComparisonPair(payload.attachments, undefined, params);
              return (
                <div
                  style={{
                    marginTop: 8,
                    padding: '8px 12px',
                    background: 'rgba(99, 102, 241, 0.04)',
                    borderRadius: 6,
                    border: '1px solid rgba(99, 102, 241, 0.16)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 8,
                  }}
                >
                  <Space size={6}>
                    <RobotOutlined style={{ color: '#6366f1', fontSize: 14 }} />
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      将任务要件与文档带入 AI 对话，进行自然语言审查与修改
                    </span>
                  </Space>
                  <Space size={8}>
                    {itemComparisonPair ? (
                      <Button
                        size="small"
                        style={{
                          borderColor: '#722ed1',
                          color: '#722ed1',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 500,
                          backgroundColor: 'rgba(114, 46, 209, 0.04)',
                        }}
                        icon={<SwapOutlined style={{ color: '#722ed1' }} />}
                        onClick={(e) => {
                          e.stopPropagation();
                          triggerContractComparisonInAi({
                            taskId: item.id,
                            taskTitle: item.title,
                            baseDoc: itemComparisonPair.baseDoc,
                            latestDoc: itemComparisonPair.latestDoc,
                            parameters: params,
                          });
                        }}
                        title="将新旧版本合同载入 AI 窗口进行智能比对与红线审查"
                      >
                        比较合同
                      </Button>
                    ) : null}
                    <Button
                      size="small"
                      style={{
                        backgroundColor: '#722ed1',
                        borderColor: '#722ed1',
                        color: '#fff',
                        borderRadius: 6,
                        fontSize: 12,
                      }}
                      icon={<RobotOutlined />}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenTaskInAiChat(item);
                      }}
                    >
                      在 AI 窗口中处理
                    </Button>
                  </Space>
                </div>
              );
            })()}
          </div>
        ) : null}

        {!hasParams ? (
          <>
            <div
              className={`${inboxStyles["inbox-content-box"]} ${
                isLong && !isExpanded ? inboxStyles["inbox-content-collapsed"] : ""
              }`}
            >
              <InboxContentPreview content={content} expanded={isExpanded || !isLong} />
              {isLong && !isExpanded ? <div className={inboxStyles["inbox-content-fade"]} /> : null}
            </div>

            {isLong ? (
              <Button
                type="link"
                size="small"
                className={inboxStyles["inbox-expand-btn"]}
                icon={isExpanded ? <UpOutlined /> : <DownOutlined />}
                onClick={() => toggleExpand(item.id)}
              >
                {isExpanded ? "收起全文" : `展开全文 (共 ${linesCount} 行)`}
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
    );
  };

  return (
    <div className={styles["workbench-card-content-stack"]}>
      {/* 快速收集输入框与定时同步按钮 */}
      <div className={styles["workbench-compact-form"]}>
        <div className={styles["workbench-compact-input-wrap"]}>
          <Input.TextArea
            className={isShaking ? styles["inbox-input-shake"] : undefined}
            status={errorMessage ? "error" : undefined}
            value={inboxDraft}
            placeholder="快速收集便签/要点（Enter 保存，Shift+Enter 换行）..."
            onChange={(e) => handleDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleCollectClick();
              }
            }}
            autoSize={{ minRows: 1, maxRows: 3 }}
          />
          <Button
            type="primary"
            size="small"
            icon={<InboxOutlined />}
            onClick={handleCollectClick}
            className={styles["workbench-compact-btn-primary"]}
          >
            收集
          </Button>
        </div>
        {onSyncEmail ? (
          <Tooltip title="执行工作流：从已绑定的邮箱拉取未读邮件并沉淀入 GTD 收件箱">
            <Button
              size="small"
              icon={isSyncingEmail ? <LoadingOutlined spin /> : <MailOutlined />}
              onClick={onSyncEmail}
              loading={isSyncingEmail}
              className={styles["workbench-compact-btn-subtle"]}
            >
              收取邮件
            </Button>
          </Tooltip>
        ) : null}
      </div>
      {errorMessage ? (
        <div className={styles["inbox-error-message"]}>
          <ExclamationCircleOutlined />
          <span>{errorMessage}</span>
        </div>
      ) : null}

      {/* 状态筛选 Segmented */}
      <Segmented
        value={inboxFilter}
        onChange={(val) => onFilterChange(val as any)}
        size="small"
        className={styles["workbench-segmented-filter"]}
        options={[
          {
            label: (
              <Space size={4} align="center">
                <span>待介入</span>
                {priorityItems.length > 0 ? (
                  <Tag
                    color="error"
                    bordered={false}
                    style={{
                      margin: 0,
                      paddingInline: 5,
                      height: 16,
                      lineHeight: "16px",
                      fontSize: 10,
                      borderRadius: 8,
                      fontWeight: 700,
                    }}
                  >
                    {priorityItems.length}
                  </Tag>
                ) : (
                  <span style={{ opacity: 0.6 }}>(0)</span>
                )}
              </Space>
            ),
            value: "intervention",
          },
          { label: `待整理 (${displaySummary.unprocessed})`, value: "unprocessed" },
          {
            label: `已厘清/归档 (${displaySummary.clarified + displaySummary.archived})`,
            value: "clarified_archived",
          },
          { label: `全部 (${displaySummary.total})`, value: "all" },
        ]}
      />

      {/* 收件箱条目列表 (可滚动区域) */}
      <div className={styles["workbench-card-scroll-area"]}>
        {inboxFilter === "intervention" ? (
          <InterventionList
            priorityItems={priorityItems}
            onOpenExecution={onOpenExecution}
            onIgnorePriorityItem={onIgnorePriorityItem}
            onIgnoreAllPriorityItems={onIgnoreAllPriorityItems}
            onViewAllExecutions={onViewAllExecutions}
            onLaunchAiAssistant={onLaunchAiAssistant}
            getExecutionDisplayDescription={getExecutionDisplayDescription}
            getExecutionDisplayTime={getExecutionDisplayTime}
            getSkillDisplayName={getSkillDisplayName}
          />
        ) : displayInboxItems.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="收件箱暂无此状态条目 (Inbox Zero)"
          />
        ) : (
          <List<WorkbenchInboxItem>
          dataSource={displayInboxItems}
          renderItem={(item: WorkbenchInboxItem) => {
            const isConverted = item.status === "converted";
            const clarification = item.aiClarification;
            const actionItem = clarification?.actionItem;
            const extra = (item.extra || item.unifiedPayload?.extra || {}) as Record<string, any>;
            const isIntervention = Boolean(extra.requiresHumanIntervention || item.title?.includes("需人工介入"));
            const payload = (item.unifiedPayload || {}) as Record<string, any>;
            const isReceipt = Boolean(
              payload.isReceipt ||
              payload.taskType === "receipt" ||
              item.title?.startsWith("[协同回执]")
            );
            const isRejectReceipt = isReceipt && (payload.receiptAction === "reject" || item.title?.includes("已驳回"));
            const isApproveReceipt = isReceipt && (payload.receiptAction === "approve" || item.title?.includes("已同意"));
            const isCoordination = payload.kind === "coordination";
            const isWorkflowItem =
              isCoordination ||
              isReceipt ||
              (item.sourceType as string) === "workflow" ||
              Boolean(payload.workflowId) ||
              Boolean(extra.workflowId) ||
              item.title?.includes("流程") ||
              item.title?.includes("待担当确认") ||
              item.title?.includes("待发送");

            // 智能节点语义分类（解耦 发起/初稿确认节点、审批承认节点、归档办结节点）
            const nodeSemantics = classifyWorkflowNode(item, user?.username, user?.id);

            return (
              <List.Item key={item.id} style={{ padding: "8px 0", border: "none" }}>
                <div
                  className={styles["workbench-todo-item"]}
                  style={{
                    width: "100%",
                    opacity: isConverted ? 0.72 : 1,
                    borderLeft: isReceipt
                      ? isRejectReceipt
                        ? "3px solid #ff4d4f"
                        : "3px solid #52c41a"
                      : nodeSemantics.isInitiatorNode
                      ? "3px solid #1677ff"
                      : isCoordination
                      ? "3px solid #722ed1"
                      : isIntervention
                      ? "3px solid #ff4d4f"
                      : item.confidence < 0.75
                      ? "3px solid #faad14"
                      : "3px solid #1677ff",
                  }}
                >
                  <div className={inboxStyles["inbox-item-container"]}>
                    {/* 1. 顶部标题与主要操作栏 */}
                    <div className={inboxStyles["inbox-item-header"]}>
                      <div className={inboxStyles["inbox-item-title-wrapper"]}>
                        {/* 任务主分类：流程任务 (跨节点流转) vs 普通任务 (个人便签) */}
                        <Tag
                          color={nodeSemantics.isProcessTask ? "blue" : "default"}
                          bordered={false}
                          style={{
                            margin: 0,
                            fontWeight: 600,
                            fontSize: 11,
                            borderRadius: 4,
                          }}
                        >
                          {nodeSemantics.isProcessTask ? "流程任务" : "普通任务"}
                        </Tag>

                        {/* 状态标签：区分普通便签(未整理)、发起节点(未确认/需重修)、审批节点(待审批) */}
                        {nodeSemantics.isInitiatorNode || nodeSemantics.isApprovalNode ? (
                          <Tag color={nodeSemantics.statusTagColor} style={{ margin: 0, fontWeight: 500 }}>
                            {nodeSemantics.statusTagText}
                          </Tag>
                        ) : (
                          renderStatusTag(item.status)
                        )}

                        {/* 业务类型标签：区分待发送、需重修、审批承认、协同回执 */}
                        {isReceipt ? (
                          <Tag
                            color={isRejectReceipt ? "error" : isApproveReceipt ? "success" : "cyan"}
                            style={{ marginRight: 4 }}
                          >
                            {isRejectReceipt
                              ? "协同回执 · 已驳回"
                              : isApproveReceipt
                              ? "协同回执 · 已通过"
                              : "协同回执 · 已办结"}
                          </Tag>
                        ) : nodeSemantics.isProcessTask ? (
                          <Tag color={nodeSemantics.categoryTagColor} style={{ marginRight: 4 }}>
                            {nodeSemantics.categoryTagText}
                          </Tag>
                        ) : null}

                        {/* 经办人 / 发起人身份标签 */}
                        {nodeSemantics.operatorDisplayText ? (
                          <Tag color={nodeSemantics.operatorIsMe ? "green" : "blue"} style={{ marginRight: 4 }}>
                            {nodeSemantics.operatorDisplayText}
                          </Tag>
                        ) : item.sourceSender ? (
                          <Tag color="blue" style={{ marginRight: 4 }}>
                            @{item.sourceSender}
                          </Tag>
                        ) : null}

                        {/* 清洗后标题：将奇怪的 [待担当确认] 转换为 [待发送] */}
                        <Typography.Text strong className={inboxStyles["inbox-item-title"]}>
                          {nodeSemantics.displayTitle || item.title || "未命名收集条目"}
                        </Typography.Text>
                      </div>

                      {/* 右侧动作按钮：发起/初稿确认显示“发送”，审批节点显示“同意”，作业节点显示“流转” */}
                      {/* 右侧动作按钮 */}
                      <Space size={4} wrap className={inboxStyles["inbox-item-actions"]}>
                        {item.status === "archived" ? (
                          /* 已归档条目：严格只读，仅提供「详细」查看与「恢复」按钮，绝不展示任何业务流转操作按钮（归档/发送/同意/转任务等） */
                          <>
                            <Tooltip title="查看流程历程、业务要件与成果文档（已归档只读）">
                              <Button
                                size="small"
                                className={styles['workbench-todo-action-btn']}
                                icon={<EyeOutlined style={{ fontSize: 12 }} />}
                                onClick={() => {
                                  setDetailModalItem(item);
                                }}
                              >
                                详细
                              </Button>
                            </Tooltip>
                            <Tooltip title="恢复至待整理收件箱">
                              <Button
                                size="small"
                                className={styles['workbench-todo-action-btn']}
                                icon={<UndoOutlined />}
                                onClick={() => onUnarchiveItem?.(item.id)}
                              >
                                恢复
                              </Button>
                            </Tooltip>
                          </>
                        ) : (
                          /* 未归档条目：根据流程节点与任务类型展示相应动作 */
                          <>
                            {/* 1. 需重修 / 已驳回任务：无论状态是否已转待办，卡片右侧提供醒目的「重新编辑并发送」 */}
                            {nodeSemantics.isRevisionRequired ? (
                              <Tooltip title="当前任务已被驳回或需重修，请打开详情修改业务要件或追加新版本附件后再重新提交">
                                <Button
                                  size="small"
                                  type="primary"
                                  danger
                                  icon={<EditOutlined style={{ fontSize: 12 }} />}
                                  style={{
                                    fontWeight: 500,
                                    borderRadius: 6,
                                    height: 26,
                                    padding: "0 10px",
                                  }}
                                  onClick={() => {
                                    setDetailModalItem(item);
                                  }}
                                >
                                  重新编辑并发送
                                </Button>
                              </Tooltip>
                            ) : nodeSemantics.isWaitingForOther ? (
                              /* 2. 发起人外发等待他人审批：显示撤回、催办与详细 */
                              <>
                                {nodeSemantics.canRecall ? (
                                  <Popconfirm
                                    title="确定撤回此发起事项？"
                                    description="撤回后将终止后续流转，并将事项退回至您的「待办」，您可重新编辑并再次发送。"
                                    onConfirm={() => handleRecallItem(item)}
                                    okText="确认撤回"
                                    cancelText="取消"
                                  >
                                    <Button
                                      size="small"
                                      icon={<RollbackOutlined style={{ fontSize: 12 }} />}
                                      className={styles['workbench-todo-recall-btn']}
                                    >
                                      撤回
                                    </Button>
                                  </Popconfirm>
                                ) : null}
                                {nodeSemantics.canRemind ? (
                                  <Tooltip title={`向当前处理担当 @${nodeSemantics.currentAssigneeName || '处理人'} 发送催办提醒`}>
                                    <Button
                                      size="small"
                                      icon={<BellOutlined style={{ fontSize: 12 }} />}
                                      className={styles['workbench-todo-remind-btn']}
                                      onClick={() => handleRemindItem(item)}
                                    >
                                      催办
                                    </Button>
                                  </Tooltip>
                                ) : null}
                                <Tooltip title="查看流程进度、结构化参数与附件详情">
                                  <Button
                                    size="small"
                                    className={styles['workbench-todo-action-btn']}
                                    icon={<EyeOutlined style={{ fontSize: 12 }} />}
                                    onClick={() => {
                                      setDetailModalItem(item);
                                    }}
                                  >
                                    详细
                                  </Button>
                                </Tooltip>
                              </>
                            ) : nodeSemantics.isProcessTask ? (
                              /* 3. 正常流程任务：未转待办时展示快捷流转按钮，且始终展示「详细」按钮 */
                              <>
                                {!isConverted && (nodeSemantics.cardActionType === 'send' || nodeSemantics.canApprove) ? (
                                  <Popconfirm
                                    title={
                                      nodeSemantics.cardActionType === "send"
                                        ? "确认提交合同并送审？"
                                        : nodeSemantics.isApprovalNode
                                        ? "确认审批通过并流转？"
                                        : "确认办理完成并提交流转？"
                                    }
                                    description={
                                      nodeSemantics.cardActionType === "send"
                                        ? "提交后系统将开展智能合规审查与风险诊断，并通过后自动流转至法务专员/下一环节审批。您可在「已发事项」中跟踪最新流转进度。"
                                        : nodeSemantics.isApprovalNode
                                        ? "审批通过后将自动流转至下一节点继续流转，审批意见与协同记录将同步归档。"
                                        : "办理完成后将提交流转至后续处理或归档节点。"
                                    }
                                    okText={nodeSemantics.cardActionText}
                                    cancelText="取消"
                                    onConfirm={() => handleQuickCoordAction(item)}
                                    disabled={quickSendingId === item.id}
                                  >
                                    <Tooltip
                                      title={
                                        nodeSemantics.cardActionType === "send"
                                          ? "快捷指令：一键确认初稿并发送至下一节点"
                                          : nodeSemantics.isApprovalNode
                                          ? "快捷指令：一键审核通过并流转至下一节点"
                                          : "快捷指令：一键办结并提交流转"
                                      }
                                    >
                                      <Button
                                        size="small"
                                        type="primary"
                                        loading={quickSendingId === item.id}
                                        icon={
                                          nodeSemantics.cardActionType === "send" ? (
                                            <SendOutlined style={{ fontSize: 12 }} />
                                          ) : (
                                            <CheckCircleOutlined style={{ fontSize: 12 }} />
                                          )
                                        }
                                        className={
                                          nodeSemantics.cardActionType === "send"
                                            ? styles["workbench-todo-send-btn"]
                                            : styles["workbench-todo-flow-btn"]
                                        }
                                      >
                                        {nodeSemantics.cardActionText}
                                      </Button>
                                    </Tooltip>
                                  </Popconfirm>
                                ) : null}
                                <Tooltip title="查看流程进度、结构化参数与附件详情">
                                  <Button
                                    size="small"
                                    className={styles['workbench-todo-action-btn']}
                                    icon={<EyeOutlined style={{ fontSize: 12 }} />}
                                    onClick={() => {
                                      setDetailModalItem(item);
                                    }}
                                  >
                                    详细
                                  </Button>
                                </Tooltip>
                              </>
                            ) : null}

                            {isIntervention && extra.actionUrl ? (
                              <Button
                                size="small"
                                type="primary"
                                danger
                                icon={<EyeOutlined />}
                                onClick={() => navigate(extra.actionUrl)}
                              >
                                前往处理
                              </Button>
                            ) : null}

                            {!isConverted && !nodeSemantics.isRevisionRequired ? (
                              <>
                                <Tooltip title="转为正式任务，进入行动待办看板排期执行">
                                  <Button
                                    size="small"
                                    className={styles['workbench-todo-action-btn']}
                                    icon={<ArrowRightOutlined style={{ fontSize: 12 }} />}
                                    onClick={() => onConvertToTodo(item.id)}
                                  >
                                    转任务
                                  </Button>
                                </Tooltip>

                                <Tooltip title={isReceipt ? "已阅并归档 (从收集箱清理移出)" : "归档此条目 (从收集箱清理移出)"}>
                                  <Button
                                    size="small"
                                    type="text"
                                    className={styles['workbench-todo-archive-btn']}
                                    icon={<FolderOutlined style={{ fontSize: 13 }} />}
                                    onClick={() => onArchiveItem(item.id)}
                                  />
                                </Tooltip>
                              </>
                            ) : (
                              <Tooltip title="归档已转任务条目 (从收集箱清理移出)">
                                <Button
                                  size="small"
                                  icon={<FolderOutlined />}
                                  onClick={() => onArchiveItem(item.id)}
                                />
                              </Tooltip>
                            )}

                            {!isWorkflowItem ? (
                              <Popconfirm
                                title="确定删除此条目吗？"
                                onConfirm={() => onDeleteItem(item.id)}
                                okText="删除"
                                cancelText="取消"
                              >
                                <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                              </Popconfirm>
                            ) : null}
                          </>
                        )}
                      </Space>
                    </div>

                    {/* 2. 状态标签与元信息栏 (统一组织来源、置信度、时间等) */}
                    <div className={inboxStyles["inbox-item-meta-bar"]}>
                      <Space size={[8, 4]} wrap align="center">
                        {renderSourceTag(item.sourceType)}
                        {renderConfidenceTag(item)}
                        <span className={inboxStyles["inbox-meta-text"]}>
                          <ClockCircleOutlined style={{ fontSize: 11 }} /> 收集于 {formatMonthDayTime(item.createdAt)}
                        </span>
                        {item.sourceSender ? (
                          <span className={inboxStyles["inbox-meta-text"]}>
                            来源: {item.sourceSender}
                          </span>
                        ) : null}
                        {item.sourceTitle && item.sourceTitle !== item.title ? (
                          <Tooltip title={`原始主题: ${item.sourceTitle}`}>
                            <span className={inboxStyles["inbox-meta-source-title"]}>
                              主题: {item.sourceTitle}
                            </span>
                          </Tooltip>
                        ) : null}
                      </Space>
                    </div>

                    {/* 3. 主要内容展示区 (核心内容区，空间更足、支持 Markdown 与排版) */}
                    {renderMainContent(item)}

                    {/* 4. AI 智能提炼卡片（若已厘清） */}
                    {clarification ? (
                      <Card
                        size="small"
                        className={inboxStyles["inbox-ai-card"]}
                        styles={{ body: { padding: "8px 12px" } }}
                      >
                        <Space direction="vertical" size={4} style={{ width: "100%" }}>
                          <Space wrap size={8} align="center">
                            <Tag color="blue" icon={<RobotOutlined />}>AI 提炼建议</Tag>
                            {renderPriorityTag(actionItem?.priority)}
                            {actionItem?.dueDate ? (
                              <Tag icon={<ClockCircleOutlined />}>截止: {actionItem.dueDate}</Tag>
                            ) : null}
                            {actionItem?.suggestedWorkflowName ? (
                              <Tag color="purple" icon={<ThunderboltOutlined />}>
                                推荐工作流: {actionItem.suggestedWorkflowName}
                              </Tag>
                            ) : null}
                          </Space>
                          {clarification.refinementNotes ? (
                            <div className={inboxStyles["inbox-ai-notes"]}>
                              {clarification.refinementNotes}
                            </div>
                          ) : null}
                        </Space>
                      </Card>
                    ) : null}
                  </div>
                </div>
              </List.Item>
            );
          }}
        />
      )}
    </div>

    {detailModalItem ? (
      <InboxTaskDetailModal
        open={Boolean(detailModalItem)}
        item={detailModalItem}
        onClose={() => setDetailModalItem(null)}
        onOpenInAi={handleOpenTaskInAiChat}
        onRecall={handleRecallItem}
        onRemind={handleRemindItem}
        onSuccess={() => {
          setDetailModalItem(null);
        }}
      />
    ) : null}
  </div>
  );
}
