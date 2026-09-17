import type { WorkbenchInboxItem } from '../../../api/workbenchInbox';

export type WorkflowNodeType = 'initiation' | 'approval' | 'archive' | 'general';
export type TaskCategory = 'process' | 'personal';

export interface WorkflowNodeSemantics {
  taskCategory: TaskCategory; // 任务分类：流程任务 (跨节点流转) vs 普通任务 (个人便签/待办)
  isProcessTask: boolean;
  isRevisionRequired: boolean; // 是否处于重修状态（重试3次失败回退等）
  nodeType: WorkflowNodeType;
  isInitiatorNode: boolean;
  isApprovalNode: boolean;
  isArchiveNode: boolean;

  // 状态标签（对应 GTD 状态）
  statusTagText: string;
  statusTagColor: string;

  // 业务类型标签（如 流程任务 · 待发送、流程任务 · 需重修、流程任务 · 法务审查、协同回执）
  categoryTagText: string;
  categoryTagColor: string;

  // 经办人 / 发起人展示文本
  operatorDisplayText?: string;
  operatorIsMe: boolean;

  // 标题清洗
  displayTitle: string;

  // 卡片主操作
  cardActionText: string;
  cardActionType: 'send' | 'approve' | 'flow' | 'archive';

  // 弹窗操作
  modalTitle: string;
  modalSubmitText: string;
  allowReject: boolean;
}

export function classifyWorkflowNode(
  item: WorkbenchInboxItem,
  currentUsername?: string,
  currentUserId?: string
): WorkflowNodeSemantics {
  const payload = (item.unifiedPayload || {}) as Record<string, any>;
  const rawTitle = item.title || '';
  const currentStage = payload.currentStage || '';
  const isCoordination = payload.kind === 'coordination';

  const isReceipt = Boolean(
    payload.isReceipt ||
    payload.taskType === 'receipt' ||
    rawTitle.startsWith('[协同回执]')
  );
  const isRejectReceipt = isReceipt && (payload.receiptAction === 'reject' || rawTitle.includes('已驳回'));
  const isApproveReceipt = isReceipt && (payload.receiptAction === 'approve' || rawTitle.includes('已同意'));

  const isRevisionRequired = Boolean(
    rawTitle.includes('[需重修]') ||
    rawTitle.includes('需重修') ||
    rawTitle.includes('已驳回') ||
    payload.status === 'revision_required' ||
    isRejectReceipt ||
    payload.receiptAction === 'reject' ||
    (isReceipt && (rawTitle.includes('已驳回') || rawTitle.includes('退回'))) ||
    payload.lastFailure
  );

  const isExecutionReport =
    rawTitle.startsWith('后台任务：') ||
    rawTitle.startsWith('后台任务执行报告') ||
    Boolean((payload.extra as any)?.executionId && !payload.workflowId);

  const isProcessTask = Boolean(
    !isExecutionReport && (
      isCoordination ||
      payload.workflowId ||
      payload.taskId ||
      payload.currentStage ||
      (item as any).boundWorkflowId ||
      (item.sourceType as string) === 'workflow' ||
      rawTitle.includes('待发送') ||
      rawTitle.includes('需重修') ||
      rawTitle.includes('已驳回') ||
      rawTitle.includes('待担当确认') ||
      rawTitle.includes('协同回执') ||
      (rawTitle.includes('合同') && (payload.parameters || isReceipt)) ||
      (rawTitle.includes('保密协议') && (payload.parameters || isReceipt))
    )
  );
  const taskCategory: TaskCategory = isProcessTask ? 'process' : 'personal';

  // 1. 办结/归档节点判定（仅终态通过/已办结/已归档归入此类；已驳回/需重修需允许重新编辑提交，绝不作为归档节点拦截）
  if (
    !isRevisionRequired &&
    ((isReceipt && !isRejectReceipt) || rawTitle.includes('已办结') || rawTitle.includes('已归档'))
  ) {
    return {
      taskCategory,
      isProcessTask,
      isRevisionRequired: false,
      nodeType: 'archive',
      isInitiatorNode: false,
      isApprovalNode: false,
      isArchiveNode: true,
      statusTagText: '已办结',
      statusTagColor: 'success',
      categoryTagText: isApproveReceipt
        ? '协同回执 · 已通过'
        : '协同回执 · 已办结',
      categoryTagColor: isApproveReceipt ? 'success' : 'cyan',
      operatorDisplayText: item.sourceSender ? `@${item.sourceSender}` : undefined,
      operatorIsMe: false,
      displayTitle: rawTitle,
      cardActionText: '归档',
      cardActionType: 'archive',
      modalTitle: '协同回执详情',
      modalSubmitText: '确认归档',
      allowReject: false,
    };
  }

  // 发起人与经办人匹配
  const initiatorUsername = payload.initiator?.username;
  const initiatorId = payload.initiator?.id;
  const assigneeUsername = payload.assignee?.username || item.sourceSender;
  const assigneeId = payload.assignee?.id || item.userId;

  const isCurrentMe = (uname?: string | null, uid?: string | null) => {
    if (!uname && !uid) return false;
    if (currentUsername && uname && currentUsername.toLowerCase() === uname.toLowerCase()) return true;
    if (currentUserId && uid && currentUserId === uid) return true;
    return false;
  };

  const isInitiatorMe = isCurrentMe(initiatorUsername, initiatorId);
  const isAssigneeMe = isCurrentMe(assigneeUsername, assigneeId);

  // 2. 发起 / 初稿确认节点判定 (Initiator Confirmation Node)
  // 当阶段为初稿确认、或approverRule为initiator、或需重修、或发起人与承办人为同一人且处于起草确认阶段
  const isInitiatorConfirmStage =
    currentStage === 'initiator_confirm' ||
    currentStage === 'draft_submission' ||
    payload.approverRule === 'initiator' ||
    payload.stage?.approverRule === 'initiator' ||
    rawTitle.includes('待担当确认') ||
    rawTitle.includes('担当确认') ||
    rawTitle.includes('初稿确认') ||
    rawTitle.includes('待发送') ||
    isRevisionRequired ||
    (initiatorUsername && assigneeUsername && initiatorUsername === assigneeUsername && !rawTitle.includes('法务') && !rawTitle.includes('审批'));

  if (isProcessTask && isInitiatorConfirmStage) {
    // 标题清洗：彻底剥离各种历史前缀与重复标签，使标题展示整洁专业
    const cleanCoreTitle = rawTitle
      .replace(/^【(?:已驳回|需重修|待发送)】\s*/g, '')
      .replace(/^\[(?:已驳回|需重修|待发送|待担当确认|待初稿确认)\]\s*/g, '')
      .replace(/^\[协同回执\]\s*@\S+\s*(?:已驳回退回担当重修:\s*|已驳回:\s*|已同意:\s*|已办结:\s*)?/g, '')
      .replace(/^【(?:已驳回|需重修|待发送)】\s*/g, '')
      .replace(/^\[(?:已驳回|需重修|待发送)\]\s*/g, '')
      .trim();

    const displayTitle = isRevisionRequired
      ? `[需重修] ${cleanCoreTitle}`
      : `[待发送] ${cleanCoreTitle}`;

    return {
      taskCategory: 'process',
      isProcessTask: true,
      isRevisionRequired,
      nodeType: 'initiation',
      isInitiatorNode: true,
      isApprovalNode: false,
      isArchiveNode: false,
      statusTagText: isRevisionRequired
        ? '需重修'
        : item.status === 'unprocessed'
        ? '未确认'
        : item.status === 'converted'
        ? '已转待办'
        : '已确认',
      statusTagColor: isRevisionRequired ? 'error' : item.status === 'unprocessed' ? 'gold' : 'processing',
      categoryTagText: isRevisionRequired ? '流程任务 · 需重修' : '流程任务 · 待发送',
      categoryTagColor: isRevisionRequired ? 'error' : 'geekblue',
      operatorDisplayText: isAssigneeMe || isInitiatorMe ? '经办: 我' : (assigneeUsername ? `经办: @${assigneeUsername}` : undefined),
      operatorIsMe: isAssigneeMe || isInitiatorMe,
      displayTitle,
      cardActionText: isRevisionRequired ? '重新发送' : '发送',
      cardActionType: 'send',
      modalTitle: isRevisionRequired ? '重修核验与重新发送' : '初稿核对与发送',
      modalSubmitText: isRevisionRequired ? '重新发送' : '发送',
      allowReject: false,
    };
  }

  // 3. 审批 / 审查节点判定 (Approval / Review Node)
  const isApprovalStage =
    payload.taskType === 'approval' ||
    currentStage === 'legal_review' ||
    currentStage.includes('approval') ||
    currentStage.includes('review') ||
    rawTitle.includes('法务') ||
    rawTitle.includes('审批') ||
    rawTitle.includes('核准');

  if (isProcessTask && isApprovalStage) {
    const isLegalStage = rawTitle.includes('法务') || currentStage.includes('legal');
    return {
      taskCategory: 'process',
      isProcessTask: true,
      isRevisionRequired: false,
      nodeType: 'approval',
      isInitiatorNode: false,
      isApprovalNode: true,
      isArchiveNode: false,
      statusTagText: item.status === 'unprocessed' ? '待审批' : (item.status === 'converted' ? '已转待办' : '已审批'),
      statusTagColor: 'warning',
      categoryTagText: isLegalStage ? '流程任务 · 法务审查' : '流程任务 · 审批承认',
      categoryTagColor: 'purple',
      operatorDisplayText: isInitiatorMe ? '来自: 我' : (initiatorUsername ? `来自: @${initiatorUsername}` : (item.sourceSender ? `来自: @${item.sourceSender}` : undefined)),
      operatorIsMe: isAssigneeMe,
      displayTitle: rawTitle,
      cardActionText: '同意',
      cardActionType: 'approve',
      modalTitle: isLegalStage ? '法务合规审查与流转' : '业务审批与流转',
      modalSubmitText: '同意并流转',
      allowReject: true, // 审批节点必须有驳回修改
    };
  }

  // 4. 普通协同作业 / 收集箱条目
  return {
    taskCategory,
    isProcessTask,
    isRevisionRequired: false,
    nodeType: 'general',
    isInitiatorNode: false,
    isApprovalNode: false,
    isArchiveNode: false,
    statusTagText: item.status === 'unprocessed' ? '未整理' : (item.status === 'converted' ? '已转待办' : '已厘清'),
    statusTagColor: item.status === 'unprocessed' ? 'processing' : 'default',
    categoryTagText: isProcessTask ? '流程任务 · 协同流转' : '普通任务 · 便签',
    categoryTagColor: isProcessTask ? 'blue' : 'default',
    operatorDisplayText: item.sourceSender ? (isCurrentMe(item.sourceSender) ? '来自: 我' : `@${item.sourceSender}`) : undefined,
    operatorIsMe: isCurrentMe(item.sourceSender),
    displayTitle: rawTitle,
    cardActionText: isProcessTask ? '发送' : '流转',
    cardActionType: isProcessTask ? 'send' : 'flow',
    modalTitle: isProcessTask ? '流程流转处理' : '任务流转详细信息',
    modalSubmitText: isProcessTask ? '发送' : '确认流转',
    allowReject: isCoordination,
  };
}
