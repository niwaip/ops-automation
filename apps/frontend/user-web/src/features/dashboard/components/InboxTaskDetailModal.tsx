import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  UploadOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Button, Input, Modal, Space, Tag, Typography, Upload, message } from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useQueryClient } from 'react-query';
import { useAuthStore } from '@/shared/store/authStore';
import { workbenchInboxApi } from '../../../api/workbenchInbox';
import {
  workbenchCoordinationApi,
  type CoordinationAttachment,
} from '../../../api/workbenchCoordination';
import { CoordinationFileReplacer } from './CoordinationFileReplacer';
import {
  getContractComparisonPair,
  triggerContractComparisonInAi,
} from '../lib/contractComparisonHelper';
import { classifyWorkflowNode } from '../lib/coordinationNodeClassifier';
import {
  applyOptimisticCoordinationSend,
  rollbackOptimisticCoordinationSend,
} from '../lib/coordinationOptimistic';
import { formatMonthDayTime } from '../../../shared/utils/dateText';
import { ComplianceAuditCard, extractAuditReportFromTask } from './ComplianceAuditCard';
import { BusinessParametersCard } from './BusinessParametersCard';
import { TaskStageBanner } from './TaskStageBanner';
import { VoucherAttachmentsCard } from './VoucherAttachmentsCard';
import { TaskHistoryTimelineCard } from './TaskHistoryTimelineCard';
import { buildInboxTaskDetailFooter } from './inboxTaskDetailFooter';
import { validateDraftConsistency, looksLikeAddress } from './inboxTaskDetailValidation';
import type { InboxTaskDetailModalProps } from './InboxTaskDetailModal.types';
import { findCompanyCandidate } from './inboxTaskDetailText';

export function InboxTaskDetailModal({
  open,
  item,
  onClose,
  onFlow: _onFlow,
  onOpenInAi,
  onRecall,
  onRemind,
  onSuccess,
}: InboxTaskDetailModalProps) {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [replacementFile, setReplacementFile] = useState<CoordinationAttachment | null>(null);
  const [appendedFiles, setAppendedFiles] = useState<CoordinationAttachment[]>([]);
  const [comment, setComment] = useState('');
  const [stagedReviewDraft, setStagedReviewDraft] = useState<any | null>(null);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [initialParams, setInitialParams] = useState<Record<string, any>>({});
  const [editedParams, setEditedParams] = useState<Record<string, any>>({});
  const [isHistoryCollapsed, setIsHistoryCollapsed] = useState(true);
  const loadedItemIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (open && item) {
      const currentItemId = item.sourceRefId || item.id;
      // 仅当刚打开弹窗或切换至不同任务时初始化状态，避免父组件重新渲染时重置清空用户已输入的留言与编辑内容！
      if (loadedItemIdRef.current !== currentItemId) {
        loadedItemIdRef.current = currentItemId;
        setReplacementFile(null);
        setAppendedFiles([]);
        setComment('');
        setStagedReviewDraft(null);
        setFileList([]);
        setIsSubmitting(false);
        setIsHistoryCollapsed(true);
        const rawP = (item.unifiedPayload as any)?.parameters || {};
        setEditedParams({ ...rawP });
        setInitialParams({ ...rawP });
      }
    } else if (!open) {
      loadedItemIdRef.current = null;
    }
  }, [open, item?.id, item?.sourceRefId, user?.username, user?.id]);

  const handleReviewResult = (result: any) => {
    const draft = result.reviewDraft || {
      executionId: result.executionId,
      artifactId: result.artifactId,
      sourceDocumentVersion: result.sourceDocumentVersion,
      ruleSetId: result.ruleSetId,
      ruleSetVersion: result.ruleSetVersion,
      ruleSetDigest: result.ruleSetDigest,
      action: result.action,
      summaryText: result.summaryText,
      stagedComments: result.stagedComments || [],
      findingStates: result.findingStates || {},
      approvalOpinions: result.approvalOpinions || [],
      stats: result.stats,
      _timestamp: Date.now(),
    };

    // 四维一致性防串单/防换版/防漂移校验
    if (!validateDraftConsistency({ item, draft })) {
      return;
    }

    setStagedReviewDraft(draft);

    if (result.summaryText) {
      const cleanSummary = result.summaryText.trim();
      setComment((prev) => {
        if (!prev || !prev.trim()) {
          return cleanSummary;
        }
        if (prev.includes(cleanSummary)) {
          return prev;
        }
        return `${prev.trim()}\n\n${cleanSummary}`;
      });
    }
  };

  const payload = (item?.unifiedPayload || {}) as Record<string, any>;
  const params = editedParams;
  const isCoordination = payload.kind === 'coordination';
  const nodeSemantics = item
    ? classifyWorkflowNode(item, user?.username, user?.id)
    : ({ isProcessTask: false, isRevisionRequired: false, isInitiatorNode: false, cardActionType: 'detail' } as any);
  const isArchived = Boolean(
    item?.status === 'archived' ||
    (item as any)?.isArchived ||
    payload.status === 'archived' ||
    payload.status === 'completed' ||
    (item as any)?.status === 'completed' ||
    payload.metadata?.archiveId
  );
  const isActionable =
    Boolean(item) &&
    !isArchived &&
    !nodeSemantics.isWaitingForOther &&
    item?.status !== 'converted' &&
    item?.status !== 'discarded' &&
    ((isCoordination || nodeSemantics.isProcessTask) ||
      nodeSemantics.isRevisionRequired);
  const isAssignment = isCoordination && payload.taskType !== 'approval';
  const hasParams = Boolean(item) && (isCoordination || nodeSemantics.isProcessTask) && Object.keys(params).length > 0;

  const candidateCompany = looksLikeAddress(params.counterpartyName)
    ? findCompanyCandidate(params.remarks || item?.rawContent)
    : null;

  const handleApplyAutoCorrection = () => {
    if (!candidateCompany) return;
    const oldVal = params.counterpartyName;
    setEditedParams((prev) => ({
      ...prev,
      counterpartyName: candidateCompany,
      counterpartyAddress: prev.counterpartyAddress || oldVal,
      contractTitle: prev.contractTitle
        ? (prev.contractTitle.includes(oldVal)
            ? prev.contractTitle.replace(oldVal, candidateCompany)
            : `${prev.contractTitle} (${candidateCompany})`)
        : `${candidateCompany} - ${prev.contractType || '合同协议'}`,
    }));
    message.success(`已一键校正：企业主体修正为「${candidateCompany}」，地址修正为「${oldVal}」`);
  };

  const incomingAttachments = (payload.attachments || []) as CoordinationAttachment[];
  const validIncoming = incomingAttachments.filter(
    (a) => Boolean(a && (a.url?.trim() || a.name?.trim()))
  );
  const directUrl =
    params.downloadUrl ||
    params.fileUrl ||
    params.contractUrl ||
    (payload.metadata as any)?.generatedDocUrl;

  const allAttachments: CoordinationAttachment[] = [...validIncoming];
  if (directUrl && !allAttachments.some((a) => a.url === directUrl)) {
    const docName =
      params.fileName ||
      params.contractFileName ||
      (params.contractTitle ? `${params.contractTitle}.docx` : item?.title ? `${item.title}.docx` : '合同文档.docx');
    allAttachments.unshift({
      name: docName,
      url: directUrl,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
  }

  const originalDraftUrl =
    params.originalDraftUrl ||
    (payload.metadata as any)?.originalDraftUrl;
  if (originalDraftUrl && !allAttachments.some((a) => a.url === originalDraftUrl)) {
    allAttachments.push({
      name: params.originalDraftFileName || (params.fileName ? `初始版本 · ${params.fileName}` : '初始合同原稿.docx'),
      url: originalDraftUrl,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
  }

  const initiatorUsername = payload.initiator?.username;
  const initiatorId = payload.initiator?.id;
  const isSubmitter = Boolean(
    (initiatorUsername && user?.username && initiatorUsername.toLowerCase() === user.username.toLowerCase()) ||
    (initiatorId && user?.id && initiatorId === user.id) ||
    (item?.sourceSender && user?.username && item.sourceSender.toLowerCase() === user.username.toLowerCase()) ||
    nodeSemantics.isInitiatorNode
  );

  const { auditReport, cleanedRawContent, htmlAttachment } = useMemo(() => {
    return extractAuditReportFromTask(
      item?.rawContent,
      payload.reviewReport,
      allAttachments
    );
  }, [item?.rawContent, payload.reviewReport, allAttachments]);

  const businessAttachments = useMemo(() => {
    return allAttachments.filter((att) => {
      const name = att.name?.toLowerCase() || '';
      const isHtml = name.endsWith('.html') || name.endsWith('.htm') || att.mimeType === 'text/html';
      return !isHtml;
    });
  }, [allAttachments]);

  const comparisonPair = useMemo(() => {
    return getContractComparisonPair(businessAttachments, appendedFiles, params);
  }, [businessAttachments, appendedFiles, params]);

  if (!item) return null;

  const handleCompareContractVersions = () => {
    if (!comparisonPair || !item) return;
    triggerContractComparisonInAi({
      taskId: item.id,
      taskTitle: item.title,
      baseDoc: comparisonPair.baseDoc,
      latestDoc: comparisonPair.latestDoc,
      parameters: params,
    });
    onClose();
  };

  const handleSubmit = async (action: 'approve' | 'reject' | 'complete') => {
    if (action === 'reject' && !comment.trim()) {
      message.warning('驳回退回时，请在留言说明中填写驳回原因与修改建议');
      return;
    }

    if (nodeSemantics.isRevisionRequired && (action === 'approve' || action === 'complete')) {
      const ignoredParamKeys = new Set([
        'downloadUrl',
        'fileUrl',
        'fileName',
        'executionId',
        'contractFileName',
        'contractUrl',
        'isDraftReplaced',
        'originalDraftUrl',
        'originalDraftFileName',
        'originalDraftSize',
        'rawContent',
        'text',
      ]);

      const hasParamChanges = Object.keys(editedParams).some((k) => {
        if (ignoredParamKeys.has(k)) return false;
        const oldVal = String(initialParams[k] ?? '').trim();
        const newVal = String(editedParams[k] ?? '').trim();
        return oldVal !== newVal;
      });

      const hasAttachmentChanges =
        appendedFiles.length > 0 ||
        Boolean(replacementFile) ||
        fileList.length > 0 ||
        Boolean(editedParams.isDraftReplaced);

      const hasComment = Boolean(comment.trim());

      if (!hasParamChanges && !hasAttachmentChanges && !hasComment) {
        message.error(
          '已驳回的任务不能无修改直接提交！请修改业务要件参数、追加新的修订版附件，或填写重新发送的理由说明后再提交。'
        );
        return;
      }
    }

    try {
      setIsSubmitting(true);
      const rawTaskId = item.sourceRefId || item.id;
      const taskId = rawTaskId.startsWith('coord_coord_')
        ? rawTaskId.replace(/^(?:coord_)+/, 'coord_')
        : rawTaskId;

      const uploadedFiles: CoordinationAttachment[] = fileList.map((f) => ({
        name: f.name,
        size: f.size,
        url: f.url || (f.response as any)?.url,
        mimeType: f.type,
      }));

      const latestAppendedFile =
        appendedFiles.length > 0
          ? appendedFiles[appendedFiles.length - 1]
          : replacementFile;

      // 如果有担当上传的追加新版本文件，将最新追加版本置顶提交流转，同时完整保留原业务附件作为历史版本材料
      // 旧轮次的 HTML 合规报告诊断工件不作为业务原稿继续下发，由引擎针对新版本重新生成
      const businessAllAttachments = allAttachments.filter((orig) => {
        const name = orig.name?.toLowerCase() || '';
        const isHtml = name.endsWith('.html') || name.endsWith('.htm') || orig.mimeType === 'text/html';
        return !isHtml;
      });

      const finalAttachments: CoordinationAttachment[] = [
        ...appendedFiles,
        ...(replacementFile && !appendedFiles.some((f) => f.url === replacementFile.url)
          ? [replacementFile]
          : []),
        ...uploadedFiles,
        ...businessAllAttachments.filter(
          (orig) =>
            !appendedFiles.some((af) => af.url === orig.url) &&
            (!replacementFile || orig.url !== replacementFile.url)
        ),
      ];

      let finalComment = comment.trim();
      if (latestAppendedFile && !finalComment.includes(latestAppendedFile.name)) {
        finalComment = finalComment
          ? `${finalComment}（已追加新版本文件：${latestAppendedFile.name}）`
          : `已核实并追加修订版文件（${latestAppendedFile.name}），提交流转至下一节点。`;
      }

      if (nodeSemantics.isArchiveNode) {
        await workbenchInboxApi.updateStatus(item.id, 'archived').catch(() => {});
        await workbenchCoordinationApi.submitAction(taskId, {
          action: 'approve',
          comment: finalComment || '协同回执已阅并确认归档。',
        }).catch(() => {});
        message.success(`已成功归档「${item.title}」，可在「已厘清/归档」中查阅`);
        onClose();
        onSuccess?.();
        void queryClient.invalidateQueries(['workbench-inbox']);
        void queryClient.invalidateQueries(['workbench-inbox-summary']);
        void queryClient.invalidateQueries(['workbench-todos']);
        void queryClient.invalidateQueries(['workbench-todos-summary']);
        void queryClient.invalidateQueries(['workbench-coordination-sent-tasks']);
        return;
      }

      if (stagedReviewDraft) {
        const currentExecutionId =
          (item as any)?.executionId ||
          (item?.unifiedPayload as any)?.executionId ||
          (item?.unifiedPayload as any)?.reviewReport?.executionId ||
          (item?.unifiedPayload as any)?.parameters?.executionId;
        if (currentExecutionId && stagedReviewDraft.executionId && currentExecutionId !== stagedReviewDraft.executionId) {
          message.error('暂存草稿与当前任务执行单不匹配，已阻止提交！');
          return;
        }
        const currentArtifactId =
          (item as any)?.artifactId ||
          (item?.unifiedPayload as any)?.artifactId ||
          (item?.unifiedPayload as any)?.reviewReport?.artifactId ||
          (item?.unifiedPayload as any)?.parameters?.artifactId;
        if (currentArtifactId && stagedReviewDraft.artifactId && currentArtifactId !== stagedReviewDraft.artifactId) {
          message.error('暂存草稿与当前任务产物不匹配，已阻止提交！');
          return;
        }
        const currentDocVersion =
          (item as any)?.sourceDocumentVersion ||
          (item?.unifiedPayload as any)?.sourceDocumentVersion ||
          (item?.unifiedPayload as any)?.reviewReport?.sourceDocumentVersion ||
          (item?.unifiedPayload as any)?.parameters?.sourceDocumentVersion;
        if (currentDocVersion && stagedReviewDraft.sourceDocumentVersion && currentDocVersion !== stagedReviewDraft.sourceDocumentVersion) {
          message.error('暂存草稿与原文档版本不匹配，已阻止提交！');
          return;
        }
        const currentAttachmentId =
          (item as any)?.sourceAttachmentId ||
          (item?.unifiedPayload as any)?.sourceAttachmentId ||
          (item?.unifiedPayload as any)?.reviewReport?.sourceAttachmentId ||
          (item?.unifiedPayload as any)?.parameters?.sourceAttachmentId;
        if (currentAttachmentId && stagedReviewDraft.sourceAttachmentId && currentAttachmentId !== stagedReviewDraft.sourceAttachmentId) {
          message.error('暂存草稿与原附件不匹配，已阻止提交！');
          return;
        }
        const currentRuleSetDigest =
          (item as any)?.ruleSetDigest ||
          (item?.unifiedPayload as any)?.ruleSetDigest ||
          (item?.unifiedPayload as any)?.parameters?.ruleSetDigest;
        if (currentRuleSetDigest && stagedReviewDraft.ruleSetDigest && currentRuleSetDigest !== stagedReviewDraft.ruleSetDigest) {
          message.error('暂存草稿与规则快照不匹配，已阻止提交！');
          return;
        }
      }

      if (nodeSemantics.cardActionType === 'send' || action === 'approve' || action === 'complete') {
        applyOptimisticCoordinationSend(queryClient, item, user);
      }

      const submitRes = await workbenchCoordinationApi.submitAction(taskId, {
        action,
        comment: finalComment,
        attachments: finalAttachments,
        parameters: {
          ...editedParams,
          ...(stagedReviewDraft ? { reviewDraft: stagedReviewDraft } : {}),
        },
      });

      const injectionStats = (submitRes as any)?.unifiedPayload?.parameters?.commentInjectionStats;
      const injectionError = (submitRes as any)?.unifiedPayload?.parameters?.commentInjectionError;
      const hasAnnotatedDocx = (submitRes as any)?.unifiedPayload?.parameters?.hasAnnotatedDocx;

      if ((submitRes as any)?.isAsync) {
        message.info('已提交处理，批注版 Word 文档正在后台生成');
      } else if (injectionStats?.unresolvedCount > 0) {
        message.warning(`操作已完成；批注版 Word 有 ${injectionStats.unresolvedCount} 条批注未精准定位`);
      } else if (injectionError && !hasAnnotatedDocx) {
        const cleanErr = injectionError
          .replace(/\s*\(期望:[\s\S]*?\)/g, '')
          .replace(/，文档内容可能已被篡改.*/g, '')
          .replace(/^合同源文档内容哈希校验失败/g, '合同源文档版本与审阅报告不一致');
        message.warning(`操作已流转；${cleanErr || 'Word 批注未自动回写'}`);
      } else {
        if (action === 'reject') {
          message.success(hasAnnotatedDocx ? '已驳回（已附法务批注版 Word）' : '已驳回');
        } else if (nodeSemantics.isRevisionRequired) {
          message.success('已重新提交重修材料');
        } else if (nodeSemantics.cardActionType === 'send') {
          message.success('已提交送审');
        } else if (action === 'approve') {
          message.success(hasAnnotatedDocx ? '已审批通过（已附法务批注版 Word）' : '已审批通过');
        } else if (action === 'complete') {
          message.success('已提交处理');
        } else {
          message.success('已处理完成');
        }
      }

      onClose();
      onSuccess?.();

      const triggerRefresh = () => {
        void queryClient.invalidateQueries(['workbench-inbox']);
        void queryClient.invalidateQueries(['workbench-inbox-summary']);
        void queryClient.invalidateQueries(['workbench-todos']);
        void queryClient.invalidateQueries(['workbench-todos-summary']);
        void queryClient.invalidateQueries(['workbench-coordination-sent-tasks']);
        void queryClient.invalidateQueries(['workbench-stats']);
      };
      triggerRefresh();
      setTimeout(triggerRefresh, 1500);
      setTimeout(triggerRefresh, 4000);
      setTimeout(triggerRefresh, 8000);
    } catch (err: any) {
      if (nodeSemantics.cardActionType === 'send' || action === 'approve' || action === 'complete') {
        rollbackOptimisticCoordinationSend(queryClient, item, user);
      }
      if (err?.message?.includes('未找到协同任务') || err?.response?.status === 404) {
        message.warning('该协同任务已在其他环节流转或已更新，已为您自动刷新最新状态');
        onClose();
        void queryClient.invalidateQueries(['workbench-inbox']);
        void queryClient.invalidateQueries(['workbench-inbox-summary']);
        void queryClient.invalidateQueries(['workbench-todos']);
        void queryClient.invalidateQueries(['workbench-todos-summary']);
        void queryClient.invalidateQueries(['workbench-coordination-sent-tasks']);
        return;
      }
      message.error(err?.message || '操作失败，请重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecall = async () => {
    if (onRecall && item) {
      onRecall(item);
      onClose();
      return;
    }
    try {
      setIsSubmitting(true);
      const rawTaskId = item?.sourceRefId || item?.id;
      const taskId = rawTaskId?.startsWith('coord_coord_')
        ? rawTaskId.replace(/^(?:coord_)+/, 'coord_')
        : rawTaskId;
      if (!taskId) return;
      await workbenchCoordinationApi.recallTask(taskId, comment.trim() || '发起人从详情页撤回事项');
      message.success(`已成功撤回「${item?.title}」，事项已退回至您的「待办」，您可重新编辑并再次发送。`);
      onClose();
      onSuccess?.();
      void queryClient.invalidateQueries(['workbench-todos']);
      void queryClient.invalidateQueries(['workbench-todos-summary']);
      void queryClient.invalidateQueries(['workbench-coordination-sent-tasks']);
      void queryClient.invalidateQueries(['workbench-inbox']);
      void queryClient.invalidateQueries(['workbench-inbox-summary']);
    } catch (err: any) {
      message.error(err?.message || '撤回失败，请重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemind = () => {
    if (onRemind && item) {
      onRemind(item);
      return;
    }
    const assigneeName = nodeSemantics.currentAssigneeName || '处理担当';
    message.success(`已向处理担当 @${assigneeName} 发送催办提醒，已催促尽快办理！`);
  };

  return (
    <Modal
      title={
        <Space size={8}>
          <EyeOutlined style={{ color: '#1677ff', fontSize: 17 }} />
          <span>任务流转详细信息</span>
        </Space>
      }
      open={open}
      onCancel={onClose}
      width={880}
      style={{ top: 20, maxWidth: '96vw' }}
      footer={buildInboxTaskDetailFooter({
        isSubmitting,
        onClose,
        onOpenInAi: onOpenInAi ? () => {
          onOpenInAi(item);
          onClose();
        } : undefined,
        hasComparisonPair: Boolean(comparisonPair),
        onCompareContractVersions: handleCompareContractVersions,
        nodeSemantics,
        onRemind: handleRemind,
        onRecall: handleRecall,
        isActionable,
        isAssignment,
        onSubmit: handleSubmit,
      })}
      destroyOnClose
    >
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* 标题与元数据 */}
        <div>
          <Typography.Title level={5} style={{ margin: 0, marginBottom: 8 }}>
            {nodeSemantics.displayTitle || item.title}
          </Typography.Title>
          <Space size={6} wrap align="center">
            {isArchived ? (
              <Tag color="default" icon={<CheckCircleOutlined />}>
                已归档 (只读)
              </Tag>
            ) : null}
            {nodeSemantics.isInitiatorNode || (item.sourceSender && item.sourceSender.toLowerCase() === (user?.username || '').toLowerCase()) ? (
              <Tag color="green" icon={<UserOutlined />}>
                来自自己
              </Tag>
            ) : item.sourceSender ? (
              <Tag color="blue" icon={<UserOutlined />}>
                {nodeSemantics.operatorDisplayText || `发起人: @${item.sourceSender}`}
              </Tag>
            ) : null}
            {nodeSemantics.categoryTagText ? (
              <Tag color={nodeSemantics.categoryTagColor}>
                {nodeSemantics.categoryTagText}
              </Tag>
            ) : null}
            {payload.workflowId ? (
              <Tag color="purple">
                工作流: {payload.workflowId}
              </Tag>
            ) : null}
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              <ClockCircleOutlined /> 提交时间: {formatMonthDayTime(item.createdAt)}
            </span>
          </Space>
        </div>

        {/* 顶部阶段与引导栏（自适应：首次核对引导 / 驳回高亮诊断 / 审批合规提示 / 归档只读） */}
        <TaskStageBanner nodeSemantics={nodeSemantics} isArchived={isArchived} />

        {/* 模式一：无需生成交付文档的纯表单流转（员工请假、费用报销、纯数据审批与协同） */}
        {!nodeSemantics.hasDocumentWorkflow ? (
          <>
            {/* 核心业务表单要件（首屏全展开高亮呈现，驳回重修状态下支持直接编辑修改） */}
            {hasParams ? (
              <BusinessParametersCard
                parameters={params}
                isSubmitter={isSubmitter}
                isActionable={isActionable}
                defaultCardCollapsed={false}
                defaultEditing={Boolean(nodeSemantics.isRevisionRequired && isSubmitter)}
                isRevisionMode={nodeSemantics.isRevisionRequired}
                customTitle="📋 申请表单要素与业务要件"
                candidateCompany={candidateCompany}
                onApplyAutoCorrection={handleApplyAutoCorrection}
                onChange={(key, val) =>
                  setEditedParams((prev) => ({
                    ...prev,
                    [key]: val,
                  }))
                }
              />
            ) : null}

            {/* 业务凭证与佐证材料（不展示版本履历与文档替换框） */}
            <VoucherAttachmentsCard
              attachments={businessAttachments}
              fileList={fileList}
              onFileListChange={setFileList}
              disabled={isSubmitting || !isActionable}
              isActionable={isActionable}
            />

            {/* 流转说明与留言 */}
            {isActionable ? (
              <div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: nodeSemantics.isRevisionRequired ? '#cf1322' : 'var(--text-primary)',
                    marginBottom: 6,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Space size={6}>
                    <span>
                      {nodeSemantics.isRevisionRequired
                        ? '💬 针对驳回意见的修改回复 / 重新提交说明'
                        : nodeSemantics.isApprovalNode
                        ? '💬 审批意见 / 批注意见'
                        : '💬 申请留言 / 补充说明 (可选)'}
                    </span>
                  </Space>
                </div>
                <Input.TextArea
                  rows={3}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={
                    nodeSemantics.isRevisionRequired
                      ? '请在此说明针对驳回批注所做的修改调整或补充材料说明（如：已修正请假时长/已重新核对金额明细）...'
                      : nodeSemantics.isApprovalNode
                      ? '请输入审批流转意见；若驳回请务必在此填写详细修改原因与要求...'
                      : '请输入本次申请的备注或流转说明...'
                  }
                  disabled={isSubmitting}
                  maxLength={500}
                  showCount
                />
              </div>
            ) : null}
          </>
        ) : (
          /* 模式二：包含交付成果文档的工作流（保密协议 NDA、商业合同起草与法务审查闭环流） */
          <>
            {/* 2.1 驳回后重新提交模式：成果文档标记退回并引导追加 V2，业务要件展开可直接修改 */}
            {nodeSemantics.isRevisionRequired ? (
              <>
                {/* 交付文档版本履历与 V2 修订稿追加上传 */}
                <CoordinationFileReplacer
                  originalAttachments={businessAttachments}
                  replacementFile={replacementFile}
                  onReplacementChange={setReplacementFile}
                  appendedFiles={appendedFiles}
                  onAppendedFilesChange={setAppendedFiles}
                  onCompareVersions={handleCompareContractVersions}
                  taskId={item.id}
                  taskTitle={item.title}
                  parameters={params}
                  disabled={isSubmitting || !isActionable}
                  isRevisionMode={true}
                />

                {/* 针对驳回意见的修改回复输入区（置于要件详情前面） */}
                {isActionable ? (
                  <div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        marginBottom: 6,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <Space size={6}>
                        <span>💬 修订说明与重发理由</span>
                      </Space>
                      <Upload
                        fileList={fileList}
                        beforeUpload={(file) => {
                          setFileList((prev) => [...prev, file]);
                          return false;
                        }}
                        onRemove={(file) => {
                          setFileList((prev) => prev.filter((f) => f.uid !== file.uid));
                        }}
                        disabled={isSubmitting}
                      >
                        <Button type="link" size="small" icon={<UploadOutlined />} style={{ fontSize: 12, padding: 0 }}>
                          + 补充佐证材料 (可选)
                        </Button>
                      </Upload>
                    </div>
                    <Input.TextArea
                      rows={3}
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="请输入重发理由说明或修改批注（如：已按法务要求调整违约金条款，并上传了 V2 修订版；请复核）..."
                      disabled={isSubmitting}
                      maxLength={500}
                      showCount
                    />
                  </div>
                ) : null}

                {/* 结构化业务要件表单（默认折叠，支持展开修改） */}
                {hasParams ? (
                  <BusinessParametersCard
                    parameters={params}
                    isSubmitter={isSubmitter}
                    isActionable={isActionable}
                    defaultCardCollapsed={true}
                    defaultEditing={isSubmitter}
                    isRevisionMode={true}
                    candidateCompany={candidateCompany}
                    onApplyAutoCorrection={handleApplyAutoCorrection}
                    onChange={(key, val) =>
                      setEditedParams((prev) => ({
                        ...prev,
                        [key]: val,
                      }))
                    }
                  />
                ) : null}

                {/* 合同合规智能审查报告（折叠备查） */}
                {auditReport || htmlAttachment ? (
                  <ComplianceAuditCard
                    reportData={auditReport}
                    htmlAttachment={htmlAttachment}
                    defaultCardCollapsed={true}
                    onReviewResult={handleReviewResult}
                  />
                ) : null}
              </>
            ) : nodeSemantics.isFirstTimeInitiation ? (
              /* 2.2 首次确认模式：核验核心签约要件，查验初稿，轻量化替换入口 */
              <>
                {/* 核心签约要件（默认折叠） */}
                {hasParams ? (
                  <BusinessParametersCard
                    parameters={params}
                    isSubmitter={isSubmitter}
                    isActionable={isActionable}
                    defaultCardCollapsed={true}
                    defaultEditing={false}
                    customTitle="📋 核心签约要件核对"
                    candidateCompany={candidateCompany}
                    onApplyAutoCorrection={handleApplyAutoCorrection}
                    onChange={(key, val) =>
                      setEditedParams((prev) => ({
                        ...prev,
                        [key]: val,
                      }))
                    }
                  />
                ) : null}

                {/* 成果文档初稿查验（紧凑展示初稿，支持下载，可选展开替换框） */}
                {(businessAttachments.length > 0 || directUrl) ? (
                  <CoordinationFileReplacer
                    originalAttachments={businessAttachments}
                    replacementFile={replacementFile}
                    onReplacementChange={setReplacementFile}
                    appendedFiles={appendedFiles}
                    onAppendedFilesChange={setAppendedFiles}
                    onCompareVersions={handleCompareContractVersions}
                    taskId={item.id}
                    taskTitle={item.title}
                    parameters={params}
                    disabled={isSubmitting || !isActionable}
                    isFirstTimeMode={true}
                  />
                ) : null}

                {/* 智能审查合规预警（如存在高危风险则自动展开高亮提醒） */}
                {auditReport || htmlAttachment ? (
                  <ComplianceAuditCard
                    reportData={auditReport}
                    htmlAttachment={htmlAttachment}
                    defaultCardCollapsed={!(auditReport?.overallRisk === 'HIGH' || (auditReport?.score !== undefined && auditReport.score < 60))}
                    onReviewResult={handleReviewResult}
                  />
                ) : null}

                {/* 提交留言 */}
                {isActionable ? (
                  <div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        marginBottom: 6,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <Space size={6}>
                        <span>💬 提交留言 / 协同说明 (可选)</span>
                      </Space>
                      <Upload
                        fileList={fileList}
                        beforeUpload={(file) => {
                          setFileList((prev) => [...prev, file]);
                          return false;
                        }}
                        onRemove={(file) => {
                          setFileList((prev) => prev.filter((f) => f.uid !== file.uid));
                        }}
                        disabled={isSubmitting}
                      >
                        <Button type="link" size="small" icon={<UploadOutlined />} style={{ fontSize: 12, padding: 0 }}>
                          + 补充佐证材料 (可选)
                        </Button>
                      </Upload>
                      {stagedReviewDraft && (
                        <Tag color="cyan" style={{ fontSize: 11, marginLeft: 8 }}>
                          ✓ 已暂存审阅草稿 ({stagedReviewDraft.stagedComments?.length || 0} 条批注 / {Object.keys(stagedReviewDraft.findingStates || {}).length} 项处置)
                        </Tag>
                      )}
                    </div>
                    <Input.TextArea
                      rows={3}
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="请输入初稿提交流转留言或商务说明..."
                      disabled={isSubmitting}
                      maxLength={3000}
                      showCount
                    />
                  </div>
                ) : null}
              </>
            ) : nodeSemantics.isApprovalNode ? (
              /* 2.3 审批审查模式：AI合规风险报告置顶首屏展开，交付物查验，要件核对，审批意见 */
              <>
                {/* 智能审查合规报告首屏展开 */}
                {auditReport || htmlAttachment ? (
                  <ComplianceAuditCard
                    reportData={auditReport}
                    htmlAttachment={htmlAttachment}
                    defaultCardCollapsed={false}
                    onReviewResult={handleReviewResult}
                  />
                ) : null}

                {/* 成果文档查验（法务审批节点：只查验版本，不追加新版本） */}
                {(businessAttachments.length > 0 || directUrl) ? (
                  <CoordinationFileReplacer
                    originalAttachments={businessAttachments}
                    replacementFile={replacementFile}
                    onReplacementChange={setReplacementFile}
                    appendedFiles={appendedFiles}
                    onAppendedFilesChange={setAppendedFiles}
                    onCompareVersions={handleCompareContractVersions}
                    taskId={item.id}
                    taskTitle={item.title}
                    parameters={params}
                    disabled={isSubmitting || !isActionable}
                    allowAppend={false}
                    isApprovalMode={true}
                  />
                ) : null}

                {/* 业务要件表单 */}
                {hasParams ? (
                  <BusinessParametersCard
                    parameters={params}
                    isSubmitter={isSubmitter}
                    isActionable={isActionable}
                    defaultCardCollapsed={true}
                    defaultEditing={false}
                    candidateCompany={candidateCompany}
                    onApplyAutoCorrection={handleApplyAutoCorrection}
                    onChange={(key, val) =>
                      setEditedParams((prev) => ({
                        ...prev,
                        [key]: val,
                      }))
                    }
                  />
                ) : null}

                {/* 审批流转批注 */}
                {isActionable ? (
                  <div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        marginBottom: 6,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <Space size={6}>
                        <span>💬 审批意见 / 修改批注</span>
                      </Space>
                      <Upload
                        fileList={fileList}
                        beforeUpload={(file) => {
                          setFileList((prev) => [...prev, file]);
                          return false;
                        }}
                        onRemove={(file) => {
                          setFileList((prev) => prev.filter((f) => f.uid !== file.uid));
                        }}
                        disabled={isSubmitting}
                      >
                        <Button type="link" size="small" icon={<UploadOutlined />} style={{ fontSize: 12, padding: 0 }}>
                          + 补充佐证材料 (可选)
                        </Button>
                      </Upload>
                      {stagedReviewDraft && (
                        <Tag color="cyan" style={{ fontSize: 11, marginLeft: 8 }}>
                          ✓ 已暂存审阅草稿 ({stagedReviewDraft.stagedComments?.length || 0} 条批注 / {Object.keys(stagedReviewDraft.findingStates || {}).length} 项处置)
                        </Tag>
                      )}
                    </div>
                    <Input.TextArea
                      rows={3}
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="请输入审批流转意见；若驳回请务必在此填写详细修改原因与要求..."
                      disabled={isSubmitting}
                      maxLength={3000}
                      showCount
                    />
                  </div>
                ) : null}
              </>
            ) : (
              /* 2.4 普通流转/办结归档查看模式 */
              <>
                {(businessAttachments.length > 0 || appendedFiles.length > 0 || replacementFile || nodeSemantics.cardActionType === 'send') ? (
                  <CoordinationFileReplacer
                    originalAttachments={businessAttachments}
                    replacementFile={replacementFile}
                    onReplacementChange={setReplacementFile}
                    appendedFiles={appendedFiles}
                    onAppendedFilesChange={setAppendedFiles}
                    onCompareVersions={handleCompareContractVersions}
                    taskId={item.id}
                    taskTitle={item.title}
                    parameters={params}
                    disabled={isSubmitting || !isActionable}
                    allowAppend={isActionable && !nodeSemantics.isArchiveNode}
                    isApprovalMode={nodeSemantics.isApprovalNode}
                  />
                ) : null}

                {isActionable ? (
                  <div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        marginBottom: 6,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <Space size={6}>
                        <span>💬 留言 / 流转说明</span>
                      </Space>
                    </div>
                    <Input.TextArea
                      rows={3}
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="请输入流转留言或修改批注..."
                      disabled={isSubmitting}
                      maxLength={500}
                      showCount
                    />
                  </div>
                ) : null}

                {hasParams ? (
                  <BusinessParametersCard
                    parameters={params}
                    isSubmitter={isSubmitter}
                    isActionable={isActionable}
                    defaultCardCollapsed={true}
                    defaultEditing={false}
                    candidateCompany={candidateCompany}
                    onApplyAutoCorrection={handleApplyAutoCorrection}
                    onChange={(key, val) =>
                      setEditedParams((prev) => ({
                        ...prev,
                        [key]: val,
                      }))
                    }
                  />
                ) : null}

                {auditReport || htmlAttachment ? (
                  <ComplianceAuditCard
                    reportData={auditReport}
                    htmlAttachment={htmlAttachment}
                    defaultCardCollapsed={true}
                    onReviewResult={handleReviewResult}
                  />
                ) : null}
              </>
            )}
          </>
        )}

        {/* 历史流转历程与留言记录（整合初始发起说明与各环节操作记录，支持展开折叠、默认折叠） */}
        <TaskHistoryTimelineCard
          cleanedRawContent={cleanedRawContent}
          itemTitle={item.title}
          hasParams={hasParams}
          params={params}
          initiatorName={item.sourceSender || payload.initiator?.username}
          createdAt={item.createdAt}
          actions={payload.actions}
          isHistoryCollapsed={isHistoryCollapsed}
          onToggleCollapse={() => setIsHistoryCollapsed(!isHistoryCollapsed)}
        />
      </div>
    </Modal>
  );
}
