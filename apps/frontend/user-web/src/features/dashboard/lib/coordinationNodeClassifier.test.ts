import { describe, it, expect } from 'vitest';
import { classifyWorkflowNode } from './coordinationNodeClassifier';
import type { WorkbenchInboxItem } from '../../../api/workbenchInbox';

describe('classifyWorkflowNode role and state permission control', () => {
  const baseItem: WorkbenchInboxItem = {
    id: 'coord_task_001',
    userId: 'user_admin_001',
    title: '保密合同_豆包有限公司_v1_20260917.docx',
    
    rawContent: '请审批',
    sourceType: 'workflow' as any,
    sourceRefId: 'coord_task_001',
    sourceTitle: '保密合同_豆包有限公司',
    sourceSender: 'admin',
    status: 'unprocessed',
    confidence: 1.0,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    unifiedPayload: {
      kind: 'coordination',
      taskId: 'coord_task_001',
      workflowId: 'legal.contract.review_flow',
      taskType: 'approval',
      currentStage: 'legal_review',
      initiator: { id: 'user_admin_001', username: 'admin' },
      assignee: { id: 'user_law_001', username: 'law01' },
      parameters: {
        contractTitle: '保密协议',
        counterpartyName: '豆包有限公司',
      },
      attachments: [
        { name: '保密合同_豆包有限公司_v1_20260917.docx', url: '/files/v1.docx' },
      ],
    } as any,
  };

  it('1. Applicant viewing pending legal review: must NOT have approve or reject, must have recall and remind', () => {
    // Current user is admin (initiator)
    const semantics = classifyWorkflowNode(baseItem, 'admin', 'user_admin_001');

    expect(semantics.isInitiatorMe).toBe(true);
    expect(semantics.isAssigneeMe).toBe(false);
    expect(semantics.isWaitingForOther).toBe(true);
    expect(semantics.isApprovalNode).toBe(false);

    // Permissions: Applicant can recall and remind, but strictly cannot approve or reject
    expect(semantics.canApprove).toBe(false);
    expect(semantics.canReject).toBe(false);
    expect(semantics.allowReject).toBe(false);
    expect(semantics.canRecall).toBe(true);
    expect(semantics.canRemind).toBe(true);

    // Card and modal action buttons
    expect(semantics.cardActionText).toBe('详细');
    expect(semantics.cardActionType).toBe('flow');
    expect(semantics.statusTagText).toBe('审批中');
  });

  it('2. Legal approver viewing pending legal review: must have approve and reject, cannot recall or remind', () => {
    // Current user is law01 (approver)
    const semantics = classifyWorkflowNode(baseItem, 'law01', 'user_law_001');

    expect(semantics.isInitiatorMe).toBe(false);
    expect(semantics.isAssigneeMe).toBe(true);
    expect(semantics.isWaitingForOther).toBe(false);
    expect(semantics.isApprovalNode).toBe(true);

    // Approver permissions
    expect(semantics.canApprove).toBe(true);
    expect(semantics.canReject).toBe(true);
    expect(semantics.allowReject).toBe(true);
    expect(semantics.canRecall).toBe(false);
    expect(semantics.canRemind).toBe(false);

    // Card action button
    expect(semantics.cardActionText).toBe('同意');
    expect(semantics.cardActionType).toBe('approve');
    expect(semantics.modalSubmitText).toBe('同意并流转');
  });

  it('3. Initial draft confirmation (initiator_confirm): initiator sends, no reject/recall/remind', () => {
    const draftItem: WorkbenchInboxItem = {
      ...baseItem,
      unifiedPayload: {
        ...(baseItem.unifiedPayload as any),
        currentStage: 'initiator_confirm',
        assignee: { id: 'user_admin_001', username: 'admin' },
      } as any,
    };

    const semantics = classifyWorkflowNode(draftItem, 'admin', 'user_admin_001');

    expect(semantics.isInitiatorNode).toBe(true);
    expect(semantics.isFirstTimeInitiation).toBe(true);
    expect(semantics.isWaitingForOther).toBe(false);
    expect(semantics.isApprovalNode).toBe(false);
    expect(semantics.cardActionType).toBe('send');
    expect(semantics.cardActionText).toBe('发送');
    expect(semantics.canApprove).toBe(false);
    expect(semantics.canReject).toBe(false);
    expect(semantics.allowReject).toBe(false);
    expect(semantics.canRecall).toBe(false);
    expect(semantics.canRemind).toBe(false);
  });

  it('4. Rejected back to initiator (revision_required): re-edit and send, no reject/recall/remind', () => {
    const rejectedItem: WorkbenchInboxItem = {
      ...baseItem,
      title: '[需重修] 保密合同_豆包有限公司',
      unifiedPayload: {
        ...(baseItem.unifiedPayload as any),
        status: 'revision_required',
        currentStage: 'draft_submission',
        rollbackReason: '保密期限需改为5年',
        actions: [
          { action: 'reject', operatorName: '法务主管', comment: '保密期限需改为5年', timestamp: '2026-09-17' },
        ],
      } as any,
    };

    const semantics = classifyWorkflowNode(rejectedItem, 'admin', 'user_admin_001');

    expect(semantics.isRevisionRequired).toBe(true);
    expect(semantics.isInitiatorNode).toBe(true);
    expect(semantics.isWaitingForOther).toBe(false);
    expect(semantics.isApprovalNode).toBe(false);
    expect(semantics.canApprove).toBe(false);
    expect(semantics.canReject).toBe(false);
    expect(semantics.allowReject).toBe(false);
    expect(semantics.canRecall).toBe(false);
    expect(semantics.canRemind).toBe(false);
    expect(semantics.cardActionType).toBe('send');
    expect(semantics.cardActionText).toBe('重新发送');
    expect(semantics.rollbackReason).toBe('保密期限需改为5年');
  });

  it('5. In-transit background AI review: initiator can recall but cannot remind or approve', () => {
    const inTransitItem: WorkbenchInboxItem = {
      ...baseItem,
      unifiedPayload: {
        ...(baseItem.unifiedPayload as any),
        inTransit: true,
        currentStage: 'contract_review_execution',
        asyncExecution: { status: 'running' },
      } as any,
    };

    const semantics = classifyWorkflowNode(inTransitItem, 'admin', 'user_admin_001');

    expect(semantics.isWaitingForOther).toBe(true);
    expect(semantics.canRecall).toBe(true);
    expect(semantics.canRemind).toBe(false); // cannot remind AI
    expect(semantics.canApprove).toBe(false);
    expect(semantics.canReject).toBe(false);
    expect(semantics.statusTagText).toBe('智能审查中');
  });

  it('6. Approved receipt: must NOT have rollbackReason, must have approvalComment and approved category tag', () => {
    const approvedReceiptItem: WorkbenchInboxItem = {
      ...baseItem,
      title: '[协同回执] @law01 已终审通过并归档: 豆包有限公司 - 商业保密协议 (NDA)',
      rawContent: '处理意见：审核通过，快捷流转至下一节点。',
      unifiedPayload: {
        ...(baseItem.unifiedPayload as any),
        isReceipt: true,
        taskType: 'receipt',
        receiptAction: 'approve',
        receiptComment: '审核通过，快捷流转至下一节点。',
        status: 'approved',
      } as any,
    };

    const semantics = classifyWorkflowNode(approvedReceiptItem, 'admin', 'user_admin_001');

    expect(semantics.isRevisionRequired).toBe(false);
    expect(semantics.rollbackReason).toBeUndefined();
    expect(semantics.approvalComment).toBe('审核通过，快捷流转至下一节点。');
    expect(semantics.categoryTagText).toBe('协同回执 · 已通过');
    expect(semantics.cardActionText).toBe('归档');
    expect(semantics.cardActionType).toBe('archive');
    expect(semantics.canApprove).toBe(false);
    expect(semantics.canReject).toBe(false);
  });
});

