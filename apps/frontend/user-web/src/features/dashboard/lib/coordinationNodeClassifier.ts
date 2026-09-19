import type { WorkbenchInboxItem } from '../../../api/workbenchInbox';

export type WorkflowNodeType = 'initiation' | 'approval' | 'archive' | 'general' | 'flow';
export type TaskCategory = 'process' | 'personal';

export interface RejectRecord {
  operatorName?: string;
  timestamp?: string;
  comment?: string;
}

export interface WorkflowNodeSemantics {
  taskCategory: TaskCategory; // 任务分类：流程任务 (跨节点流转) vs 普通任务 (个人便签/待办)
  isProcessTask: boolean;
  isRevisionRequired: boolean; // 是否处于重修状态（重试3次失败回退等）
  hasDocumentWorkflow: boolean; // 是否是包含交付物/合同文档流转（如保密协议/采购合同等），false 为纯表单/无需生成文档流转
  isFirstTimeInitiation: boolean; // 是否为首次发起核对（第一次），未曾被退回或流转过
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

  // 角色与权限控制 (发起者 / 审批者 / 状态立体控制)
  isInitiatorMe: boolean; // 当前登录用户是否为发起人
  isAssigneeMe: boolean; // 当前登录用户是否为当前阶段承办人/审批人
  isWaitingForOther: boolean; // 发起人外发后处于他人审批中或流转中（等待他人处理）
  canApprove: boolean; // 是否具备同意并流转操作权限（必须当前用户为审批人且处于审批阶段）
  canReject: boolean; // 是否具备驳回操作权限（必须当前用户为审批人且处于审批阶段）
  canRecall: boolean; // 是否具备撤回权限（发起人外发在他人审批中时可撤回）
  canRemind: boolean; // 是否具备催办权限（发起人外发在他人审批中时可催办）
  currentAssigneeName?: string; // 当前处理承办人姓名
  currentStageName?: string; // 当前阶段名称（如 法务审查）

  // 驳回批注与修改意见（若存在）
  rollbackReason?: string;
  rejectRecord?: RejectRecord;

  // 审批通过批注或办结说明（若存在）
  approvalComment?: string;
}

export function extractRollbackReason(
  item: any,
  payload?: Record<string, any>
): string | undefined {
  const p = payload || (item?.unifiedPayload as Record<string, any>) || {};
  const rawTitle = item?.title || '';

  // 1. 若明确为审批通过或已终审通过/已同意/已办结等非驳回场景，严禁误提取为驳回原因
  const isApproved =
    p.receiptAction === 'approve' ||
    p.receiptAction === 'complete' ||
    rawTitle.includes('已通过') ||
    rawTitle.includes('已同意') ||
    rawTitle.includes('已终审通过') ||
    rawTitle.includes('终审通过') ||
    p.status === 'approved' ||
    p.status === 'completed';

  const isRejectContext =
    p.receiptAction === 'reject' ||
    p.status === 'revision_required' ||
    rawTitle.includes('需重修') ||
    rawTitle.includes('已驳回') ||
    rawTitle.includes('退回');

  if (isApproved && !isRejectContext) {
    return undefined;
  }

  if (p.metadata?.rollbackReason) return p.metadata.rollbackReason;
  if (p.rollbackReason) return p.rollbackReason;
  if (p.rejectReason) return p.rejectReason;
  if (item?.rollbackReason) return item.rollbackReason;
  if (p.receiptAction === 'reject' && p.receiptComment) return p.receiptComment;

  // 从 actions 列表中查找最近一次驳回记录
  if (Array.isArray(p.actions)) {
    const lastReject = [...p.actions].reverse().find((a: any) => a.action === 'reject');
    if (lastReject?.comment?.trim()) return lastReject.comment.trim();
  }

  // 从 rawContent 或 description 中提取明确的驳回原因/修改意见
  const textToSearch = `${item?.rawContent || ''}\n${item?.description || ''}`;
  const auditMatch = textToSearch.match(/(?:审核人员批注|驳回批注|驳回原因|退回原因|修改意见)[：:]\s*([^\n\r]+)/);
  if (auditMatch && auditMatch[1]?.trim()) {
    return auditMatch[1].trim();
  }
  const quoteMatch = textToSearch.match(/(?:驳回|退回)[^\n\r]*[\r\n]+>\s*([^\n\r]+)/);
  if (quoteMatch && quoteMatch[1]?.trim()) {
    return quoteMatch[1].trim();
  }

  // 仅在明确处于驳回或需重修语境下，才允许将通用的“处理意见”作为驳回意见兜底
  if (isRejectContext) {
    const commentMatch = textToSearch.match(/处理意见[：:]\s*([^\n\r]+)/);
    if (commentMatch && commentMatch[1]?.trim()) {
      return commentMatch[1].trim();
    }
  }

  if (p.externalSyncResult?.message && isRejectContext) return p.externalSyncResult.message;
  if (p.lastFailure?.error) return p.lastFailure.error;
  if (p.asyncExecution?.error) return p.asyncExecution.error;

  return undefined;
}

export function extractApprovalComment(
  item: any,
  payload?: Record<string, any>
): string | undefined {
  const p = payload || (item?.unifiedPayload as Record<string, any>) || {};
  if (p.receiptAction === 'approve' && p.receiptComment?.trim()) {
    return p.receiptComment.trim();
  }
  if (p.approvalComment?.trim()) {
    return p.approvalComment.trim();
  }
  if (item?.approvalComment?.trim()) {
    return item.approvalComment.trim();
  }

  // 从 actions 列表中查找最近一次同意/通过记录
  if (Array.isArray(p.actions)) {
    const lastApprove = [...p.actions].reverse().find((a: any) => a.action === 'approve' || a.action === 'complete');
    if (lastApprove?.comment?.trim()) {
      return lastApprove.comment.trim();
    }
  }

  // 从 rawContent 或 description 中提取审批通过或处理意见
  const textToSearch = `${item?.rawContent || ''}\n${item?.description || ''}`;
  const match = textToSearch.match(/(?:审批通过批注|审批意见|审核批注|办理批注|流转说明|处理意见)[：:]\s*([^\n\r]+)/);
  if (match && match[1]?.trim()) {
    const comment = match[1].trim();
    // 排除明确是驳回的话术
    if (!comment.startsWith('驳回') && !comment.startsWith('退回') && !comment.includes('需重修')) {
      return comment;
    }
  }

  return undefined;
}

export function checkHasDocumentWorkflow(
  item: WorkbenchInboxItem,
  payload?: Record<string, any>
): boolean {
  const p = payload || (item?.unifiedPayload as Record<string, any>) || {};
  const wid = p.workflowId || (item as any).boundWorkflowId || '';
  if (wid === 'hr.leave.request' || wid === 'oa.expense.claim') {
    return false;
  }
  const params = (p.parameters || {}) as Record<string, any>;
  if (params.leaveType || params.expenseType) {
    return false;
  }
  if (
    wid === 'legal.nda.generation_and_review_flow' ||
    wid === 'legal.contract.review_flow' ||
    wid.includes('nda') ||
    wid.includes('contract')
  ) {
    return true;
  }
  const rawTitle = item.title || '';
  if (rawTitle.includes('合同') || rawTitle.includes('保密协议') || rawTitle.includes('NDA')) {
    return true;
  }
  if (params.downloadUrl || params.fileUrl || params.contractUrl || p.metadata?.generatedDocUrl) {
    return true;
  }
  const attachments = Array.isArray(p.attachments) ? p.attachments : [];
  if (
    attachments.some((a: any) => {
      const name = (a?.name || '').toLowerCase();
      return name.endsWith('.docx') || name.endsWith('.doc') || name.endsWith('.pdf');
    })
  ) {
    return true;
  }
  return false;
}

export function extractRejectRecord(
  item: any,
  payload?: Record<string, any>
): RejectRecord | undefined {
  const p = payload || (item?.unifiedPayload as Record<string, any>) || {};
  if (Array.isArray(p.actions)) {
    const lastReject = [...p.actions].reverse().find((a: any) => a.action === 'reject');
    if (lastReject) {
      return {
        operatorName: lastReject.operatorName || lastReject.operator || '审核人员',
        timestamp: lastReject.timestamp,
        comment: lastReject.comment?.trim() || extractRollbackReason(item, payload),
      };
    }
  }
  const comment = extractRollbackReason(item, payload);
  if (comment) {
    return {
      operatorName: item?.sourceSender || p.initiator?.username || '审核人员',
      timestamp: item?.updatedAt || item?.createdAt,
      comment,
    };
  }
  return undefined;
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
  const isApproveReceipt = isReceipt && (
    payload.receiptAction === 'approve' ||
    payload.receiptAction === 'complete' ||
    rawTitle.includes('已同意') ||
    rawTitle.includes('已通过') ||
    rawTitle.includes('已终审通过') ||
    rawTitle.includes('终审通过')
  );

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

  const hasDocumentWorkflow = checkHasDocumentWorkflow(item, payload);
  const rejectRecord = isRevisionRequired ? extractRejectRecord(item, payload) : undefined;

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

  // 发起人与经办人匹配 (提取到最前，供所有分支使用)
  const initiatorUsername =
    payload.initiator?.username ||
    payload.initiatorUsername ||
    (item as any)?.contextData?.initiatorName ||
    (item as any)?.contextData?.sourceSender ||
    (item.sourceSender && (payload.assignee?.username || payload.currentStage?.includes('review') || payload.currentStage?.includes('approval') || rawTitle.includes('法务')) ? item.sourceSender : undefined);
  const initiatorId = payload.initiator?.id || (item as any)?.contextData?.initiatorId;
  const assigneeUsername =
    payload.assignee?.username ||
    payload.assigneeUsername ||
    (item as any)?.contextData?.assigneeName;
  const assigneeId = payload.assignee?.id || (item as any)?.contextData?.assigneeId;

  const isCurrentMe = (uname?: string | null, uid?: string | null) => {
    if (!uname && !uid) return false;
    if (currentUsername && uname && currentUsername.toLowerCase() === uname.toLowerCase()) return true;
    if (currentUserId && uid && currentUserId === uid) return true;
    return false;
  };

  const isInitiatorMe =
    isCurrentMe(initiatorUsername, initiatorId) ||
    Boolean((item as any)?.contextData?.isInitiator) ||
    Boolean(payload.initiator?.username && currentUsername && payload.initiator.username.toLowerCase() === currentUsername.toLowerCase()) ||
    Boolean(item.sourceSender && currentUsername && item.sourceSender.toLowerCase() === currentUsername.toLowerCase() && (Boolean(payload.assignee?.username) || payload.currentStage === 'legal_review' || rawTitle.includes('法务')));
  const isAssigneeMe = isCurrentMe(assigneeUsername, assigneeId);

  const isInTransit = Boolean(
    payload.inTransit ||
    payload.isSent ||
    payload.asyncExecution?.status === 'running' ||
    currentStage === 'contract_review_execution'
  );

  const currentAssigneeName =
    payload.assignee?.username ||
    (currentStage === 'legal_review' || rawTitle.includes('法务') ? '法务专员' : undefined) ||
    item.sourceSender ||
    '处理担当';

  const currentStageName =
    payload.currentStageName ||
    (currentStage === 'legal_review' || rawTitle.includes('法务')
      ? '法务审查'
      : currentStage.includes('approval') || rawTitle.includes('审批')
      ? '业务审批'
      : currentStage === 'initiator_confirm' || currentStage === 'draft_submission'
      ? '初稿确认'
      : currentStage === 'contract_review_execution'
      ? '智能审查'
      : '流程流转');

  // 1. 办结/归档节点判定（仅终态通过/已办结/已归档归入此类；已驳回/需重修需允许重新编辑提交，绝不作为归档节点拦截）
  if (
    !isRevisionRequired &&
    ((isReceipt && !isRejectReceipt) || rawTitle.includes('已办结') || rawTitle.includes('已归档') || rawTitle.includes('已终审通过'))
  ) {
    const approvalComment = extractApprovalComment(item, payload);
    return {
      taskCategory,
      isProcessTask,
      isRevisionRequired: false,
      hasDocumentWorkflow,
      isFirstTimeInitiation: false,
      nodeType: 'archive',
      isInitiatorNode: false,
      isApprovalNode: false,
      isArchiveNode: true,
      isInitiatorMe,
      isAssigneeMe,
      isWaitingForOther: false,
      canApprove: false,
      canReject: false,
      canRecall: false,
      canRemind: false,
      currentAssigneeName,
      currentStageName,
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
      rollbackReason: undefined,
      rejectRecord: undefined,
      approvalComment,
    };
  }

  // 2. 发起 / 初稿确认节点判定 (Initiator Confirmation Node)
  // 当未处于外发流转中且阶段为初稿确认、或approverRule为initiator、或需重修、或已撤回、或发起人与承办人为同一人且处于起草确认阶段
  const isInitiatorConfirmStage =
    !isInTransit &&
    (currentStage === 'initiator_confirm' ||
      currentStage === 'draft_submission' ||
      payload.approverRule === 'initiator' ||
      payload.stage?.approverRule === 'initiator' ||
      payload.isRecalled ||
      rawTitle.includes('已撤回') ||
      rawTitle.includes('待担当确认') ||
      rawTitle.includes('担当确认') ||
      rawTitle.includes('初稿确认') ||
      rawTitle.includes('待发送') ||
      isRevisionRequired ||
      (initiatorUsername && assigneeUsername && initiatorUsername === assigneeUsername && !rawTitle.includes('法务') && !rawTitle.includes('审批')));

  // 2.1 若已外发流转（如后台正在进行智能合规审查），展示「已发送/审查中」语义
  if (isProcessTask && isInTransit) {
    const cleanCoreTitle = rawTitle
      .replace(/^【(?:已驳回|需重修|待发送|已发送|已撤回)】\s*/g, '')
      .replace(/^\[(?:已驳回|需重修|待发送|已发送|已撤回|待担当确认|待初稿确认)\]\s*/g, '')
      .replace(/^\[协同回执\]\s*@\S+\s*(?:已驳回退回担当重修:\s*|已驳回:\s*|已同意:\s*|已办结:\s*)?/g, '')
      .trim();

    const isAutoReview =
      currentStage === 'contract_review_execution' ||
      payload.asyncExecution?.status === 'running';

    return {
      taskCategory: 'process',
      isProcessTask: true,
      isRevisionRequired: false,
      hasDocumentWorkflow,
      isFirstTimeInitiation: false,
      nodeType: 'flow',
      isInitiatorNode: true,
      isApprovalNode: false,
      isArchiveNode: false,
      isInitiatorMe,
      isAssigneeMe,
      isWaitingForOther: isInitiatorMe,
      canApprove: false,
      canReject: false,
      canRecall: isInitiatorMe,
      canRemind: false, // 智能审查中无法催办
      currentAssigneeName,
      currentStageName,
      statusTagText: isAutoReview ? '智能审查中' : '流转中',
      statusTagColor: 'processing',
      categoryTagText: isAutoReview ? '流程任务 · 智能审查中' : '流程任务 · 已外发流转',
      categoryTagColor: 'geekblue',
      operatorDisplayText: isAssigneeMe || isInitiatorMe ? '经办: 我 (已外发)' : (assigneeUsername ? `经办: @${assigneeUsername}` : undefined),
      operatorIsMe: isAssigneeMe || isInitiatorMe,
      displayTitle: `[已发送] ${cleanCoreTitle}`,
      cardActionText: '详细',
      cardActionType: 'flow',
      modalTitle: '流程流转进度与要件详情',
      modalSubmitText: '已在流转中',
      allowReject: false,
      rejectRecord: undefined,
    };
  }

  if (isProcessTask && isInitiatorConfirmStage) {
    const isRecalled = Boolean(payload.isRecalled || rawTitle.includes('已撤回'));
    // 标题清洗：彻底剥离各种历史前缀与重复标签，使标题展示整洁专业
    const cleanCoreTitle = rawTitle
      .replace(/^【(?:已驳回|需重修|待发送|已发送|已撤回)】\s*/g, '')
      .replace(/^\[(?:已驳回|需重修|待发送|已发送|已撤回|待担当确认|待初稿确认)\]\s*/g, '')
      .replace(/^\[协同回执\]\s*@\S+\s*(?:已驳回退回担当重修:\s*|已驳回:\s*|已同意:\s*|已办结:\s*)?/g, '')
      .replace(/^【(?:已驳回|需重修|待发送|已发送|已撤回)】\s*/g, '')
      .replace(/^\[(?:已驳回|需重修|待发送|已发送|已撤回)\]\s*/g, '')
      .trim();

    const displayTitle = isRevisionRequired
      ? `[需重修] ${cleanCoreTitle}`
      : isRecalled
      ? `[已撤回] ${cleanCoreTitle}`
      : `[待发送] ${cleanCoreTitle}`;

    const hasPriorRejection = Boolean(rejectRecord || (Array.isArray(payload.actions) && payload.actions.some((a: any) => a.action === 'reject')));
    const isFirstTimeInitiation = !isRevisionRequired && !isRecalled && !hasPriorRejection;

    const modalTitle = isRevisionRequired
      ? (hasDocumentWorkflow ? '重修核验与重新发送' : '修改申请与重新提交')
      : isRecalled
      ? (hasDocumentWorkflow ? '撤回核验与重新发送' : '撤回调整与重新提交')
      : (hasDocumentWorkflow ? '初稿核对与提交送审' : '申请要件核对与提交');

    const modalSubmitText = isRevisionRequired || isRecalled
      ? (hasDocumentWorkflow ? '重新发送' : '重新提交申请')
      : (hasDocumentWorkflow ? '发送' : '确认并提交');

    const cardActionText = isRevisionRequired || isRecalled
      ? (hasDocumentWorkflow ? '重新发送' : '重新提交')
      : (hasDocumentWorkflow ? '发送' : '提交');

    return {
      taskCategory: 'process',
      isProcessTask: true,
      isRevisionRequired,
      hasDocumentWorkflow,
      isFirstTimeInitiation,
      nodeType: 'initiation',
      isInitiatorNode: true,
      isApprovalNode: false,
      isArchiveNode: false,
      isInitiatorMe,
      isAssigneeMe,
      isWaitingForOther: false, // 处于本人待发送/需重修/已撤回中
      canApprove: false,
      canReject: false,
      canRecall: false,
      canRemind: false,
      currentAssigneeName,
      currentStageName,
      statusTagText: isRevisionRequired
        ? '需重修'
        : isRecalled
        ? '已撤回'
        : item.status === 'unprocessed'
        ? '未确认'
        : item.status === 'converted'
        ? '已转待办'
        : '已确认',
      statusTagColor: isRevisionRequired
        ? 'error'
        : isRecalled
        ? 'warning'
        : item.status === 'unprocessed'
        ? 'gold'
        : 'processing',
      categoryTagText: isRevisionRequired
        ? '流程任务 · 需重修'
        : isRecalled
        ? '流程任务 · 已撤回待发'
        : '流程任务 · 待发送',
      categoryTagColor: isRevisionRequired ? 'error' : isRecalled ? 'orange' : 'geekblue',
      operatorDisplayText: isAssigneeMe || isInitiatorMe ? '经办: 我' : (assigneeUsername ? `经办: @${assigneeUsername}` : undefined),
      operatorIsMe: isAssigneeMe || isInitiatorMe,
      displayTitle,
      cardActionText,
      cardActionType: 'send',
      modalTitle,
      modalSubmitText,
      allowReject: false,
      rollbackReason: isRevisionRequired ? (rejectRecord?.comment || extractRollbackReason(item, payload)) : undefined,
      rejectRecord,
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

    // 核心判定 3A：如果是发起人查看外发在他人审批中的任务（isInitiatorMe === true）
    // 审批节点中申请人绝不能作为审批人自审自批，此时对于发起人而言是「等待他人审批中」，绝不能出现「同意/驳回」！
    if (isInitiatorMe) {
      const cleanCoreTitle = rawTitle
        .replace(/^【(?:已驳回|需重修|待发送|已发送|已撤回)】\s*/g, '')
        .replace(/^\[(?:已驳回|需重修|待发送|已发送|已撤回|待担当确认|待初稿确认|待法务确认|待审批)\]\s*/g, '')
        .replace(/^\[协同回执\]\s*@\S+\s*(?:已驳回退回担当重修:\s*|已驳回:\s*|已同意:\s*|已办结:\s*)?/g, '')
        .trim();

      return {
        taskCategory: 'process',
        isProcessTask: true,
        isRevisionRequired: false,
        hasDocumentWorkflow,
        isFirstTimeInitiation: false,
        nodeType: 'flow',
        isInitiatorNode: true,
        isApprovalNode: false, // 发起人不是审批人！禁止判定为审批节点
        isArchiveNode: false,
        isInitiatorMe: true,
        isAssigneeMe: false,
        isWaitingForOther: true, // 标记为外发等待他人审批
        canApprove: false, // 严格禁止通过
        canReject: false, // 严格禁止驳回
        canRecall: true, // 允许发起人撤回
        canRemind: !isInTransit, // 智能审查中无法催办，进入人工审批中可催办
        currentAssigneeName,
        currentStageName,
        statusTagText: '审批中',
        statusTagColor: 'processing',
        categoryTagText: isLegalStage ? '流程任务 · 法务审查' : '流程任务 · 审批中',
        categoryTagColor: isLegalStage ? 'purple' : 'geekblue',
        operatorDisplayText: '经办: 我 (审批中)',
        operatorIsMe: true,
        displayTitle: `[已发送] ${cleanCoreTitle}`,
        cardActionText: '详细',
        cardActionType: 'flow',
        modalTitle: '流程流转进度与要件详情',
        modalSubmitText: '',
        allowReject: false, // 绝不展示驳回
        rejectRecord,
      };
    }

    // 核心判定 3B：真实审批人本人（isAssigneeMe === true 且 !isInitiatorMe）
    const isApprover = Boolean(isAssigneeMe && !isInitiatorMe);
    return {
      taskCategory: 'process',
      isProcessTask: true,
      isRevisionRequired: false,
      hasDocumentWorkflow,
      isFirstTimeInitiation: false,
      nodeType: 'approval',
      isInitiatorNode: false,
      isApprovalNode: isApprover,
      isArchiveNode: false,
      isInitiatorMe,
      isAssigneeMe,
      isWaitingForOther: false,
      canApprove: isApprover,
      canReject: isApprover,
      canRecall: false,
      canRemind: false,
      currentAssigneeName,
      currentStageName,
      statusTagText: item.status === 'unprocessed' ? '待审批' : (item.status === 'converted' ? '已转待办' : '已审批'),
      statusTagColor: 'warning',
      categoryTagText: isLegalStage ? '流程任务 · 法务审查' : '流程任务 · 审批承认',
      categoryTagColor: 'purple',
      operatorDisplayText: isInitiatorMe ? '来自: 我' : (initiatorUsername ? `来自: @${initiatorUsername}` : (item.sourceSender ? `来自: @${item.sourceSender}` : undefined)),
      operatorIsMe: isAssigneeMe,
      displayTitle: rawTitle,
      cardActionText: isApprover ? '同意' : '详细',
      cardActionType: isApprover ? 'approve' : 'flow',
      modalTitle: isLegalStage
        ? '法务合规审查与流转'
        : (hasDocumentWorkflow ? '业务审批与流转' : '业务要件审批与流转'),
      modalSubmitText: isApprover ? '同意并流转' : '',
      allowReject: isApprover, // 仅真实审批人有驳回权限
      rejectRecord,
    };
  }

  // 4. 普通协同作业 / 收集箱条目
  return {
    taskCategory,
    isProcessTask,
    isRevisionRequired: false,
    hasDocumentWorkflow,
    isFirstTimeInitiation: !isRevisionRequired,
    nodeType: 'general',
    isInitiatorNode: false,
    isApprovalNode: false,
    isArchiveNode: false,
    isInitiatorMe,
    isAssigneeMe,
    isWaitingForOther: false,
    canApprove: false,
    canReject: false,
    canRecall: false,
    canRemind: false,
    currentAssigneeName,
    currentStageName,
    statusTagText: item.status === 'unprocessed' ? '未整理' : (item.status === 'converted' ? '已转待办' : '已厘清'),
    statusTagColor: item.status === 'unprocessed' ? 'processing' : 'default',
    categoryTagText: isProcessTask ? '流程任务 · 协同流转' : '普通任务 · 便签',
    categoryTagColor: isProcessTask ? 'blue' : 'default',
    operatorDisplayText: item.sourceSender ? (isCurrentMe(item.sourceSender) ? '来自: 我' : `@${item.sourceSender}`) : undefined,
    operatorIsMe: isCurrentMe(item.sourceSender),
    displayTitle: rawTitle,
    cardActionText: isProcessTask ? '发送' : '流转',
    cardActionType: isProcessTask ? 'send' : 'flow',
    modalTitle: isProcessTask
      ? (hasDocumentWorkflow ? '流程流转处理' : '业务要件流转处理')
      : '任务详细信息',
    modalSubmitText: isProcessTask ? (hasDocumentWorkflow ? '发送' : '确认并提交') : '确认流转',
    allowReject: isCoordination,
    rejectRecord,
    approvalComment: !isRevisionRequired ? extractApprovalComment(item, payload) : undefined,
  };
}
