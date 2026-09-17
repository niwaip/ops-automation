import type { QueryClient } from 'react-query';
import type { WorkbenchInboxItem } from '../../../api/workbenchInbox';
import type { CoordinationTask } from '../../../api/workbenchCoordination';

/**
 * 协同流转快捷发送/确认发送时，立即执行乐观 UI 迁移：
 * 1. 从收件箱列表中移除/置为已流转（条目瞬间离开「待整理」，徽标「待整理 (N)」立刻减1）
 * 2. 立即将条目注入「已发事项」缓存并增加已发统计（条目瞬间出现在「已发事项 (N+1)」，呈现智能审查流转中状态）
 */
export function applyOptimisticCoordinationSend(
  queryClient: QueryClient,
  item: WorkbenchInboxItem,
  currentUser?: { id?: string; username?: string } | null
) {
  const payload = (item.unifiedPayload || {}) as Record<string, any>;
  const cleanTitle = (item.sourceTitle || item.title || '')
    .replace(/^【(?:已驳回|需重修|待发送|已发送)】\s*/g, '')
    .replace(/^\[(?:已驳回|需重修|待发送|已发送|待担当确认|待初稿确认)\]\s*/g, '')
    .trim();
  const sentTitle = cleanTitle ? `[已发送] ${cleanTitle}` : item.title;

  const isContractReview =
    payload.workflowId?.includes('contract_review') ||
    payload.workflowId?.includes('legal') ||
    payload.currentStage === 'contract_review_execution';

  const nextStage =
    payload.nextStage ||
    (isContractReview ? 'contract_review_execution' : payload.currentStage || 'in_progress');

  const nextAssignee =
    payload.nextAssignee ||
    (payload.assignee && payload.assignee.username !== currentUser?.username
      ? payload.assignee
      : payload.approverUsername
      ? { id: payload.approverId || 'approver', username: payload.approverUsername }
      : isContractReview
      ? { id: 'reviewer_legal', username: payload.targetAuditor || '法务审核人' }
      : { id: 'next_reviewer', username: '协同处理人' });

  const optimisticUnifiedPayload = {
    ...payload,
    inTransit: true,
    isSent: true,
    currentStage: nextStage,
    asyncExecution: {
      status: 'running',
      currentStage: nextStage,
      startedAt: new Date().toISOString(),
    },
    assignee: nextAssignee,
  };

  // 1. 从收件箱列表中将该条目乐观置为 converted（立即离开「待整理」）
  queryClient.setQueriesData({ queryKey: ['workbench-inbox'] }, (oldData: any) => {
    if (!oldData || !Array.isArray(oldData.items)) return oldData;
    return {
      ...oldData,
      items: oldData.items.map((it: WorkbenchInboxItem) =>
        it.id === item.id
          ? {
              ...it,
              title: sentTitle,
              status: 'converted' as const,
              unifiedPayload: optimisticUnifiedPayload,
            }
          : it
      ),
    };
  });

  // 2. 扣减收件箱待整理统计指标（立即更新 Segmented 徽标「待整理 (0)」）
  queryClient.setQueriesData({ queryKey: ['workbench-inbox-summary'] }, (oldSummary: any) => {
    if (!oldSummary) return oldSummary;
    if (Array.isArray(oldSummary.items)) {
      return {
        ...oldSummary,
        items: oldSummary.items.map((it: any) =>
          it.id === item.id
            ? {
                ...it,
                title: sentTitle,
                status: 'converted' as const,
                unifiedPayload: optimisticUnifiedPayload,
              }
            : it
        ),
      };
    }
    return {
      ...oldSummary,
      unprocessed: Math.max(0, (oldSummary.unprocessed || 1) - 1),
      converted: (oldSummary.converted || 0) + 1,
    };
  });

  // 3. 乐观加入已发事项缓存（立即进入「已发事项 (1)」）
  const optimisticTask: CoordinationTask = {
    taskId: payload.taskId || `coord_${item.id}`,
    inboxItemId: item.id,
    title: sentTitle,
    rawContent: item.rawContent,
    workflowId: payload.workflowId,
    status: 'pending' as any,
    taskType: payload.taskType || ('approval' as any),
    priority: payload.priority || ('medium' as any),
    initiator: payload.initiator || {
      id: currentUser?.id || '',
      username: currentUser?.username || '经办人',
    },
    assignee: nextAssignee,
    currentStage: nextStage,
    unifiedPayload: optimisticUnifiedPayload,
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // 写入 sent-tasks 缓存
  const sentQueryKeys = [
    ['workbench-coordination-sent-tasks', currentUser?.id],
    ['workbench-coordination-sent-tasks', currentUser?.username],
    ['workbench-coordination-sent-tasks'],
  ];
  for (const qk of sentQueryKeys) {
    queryClient.setQueriesData({ queryKey: qk }, (oldList: any) => {
      const list = Array.isArray(oldList) ? [...oldList] : [];
      const existingIdx = list.findIndex(
        (t: any) => t.taskId === optimisticTask.taskId || t.inboxItemId === item.id
      );
      if (existingIdx >= 0) {
        list[existingIdx] = optimisticTask;
      } else {
        list.unshift(optimisticTask);
      }
      return list;
    });
  }

  // 4. 更新待办指标中的 sent 数量
  queryClient.setQueriesData({ queryKey: ['workbench-todos-summary'] }, (oldTodoSummary: any) => {
    if (!oldTodoSummary) return oldTodoSummary;
    return {
      ...oldTodoSummary,
      sent: (oldTodoSummary.sent || 0) + 1,
    };
  });
}

/**
 * 当网络或后端验证报错时，撤销乐观变更并从后端刷新真实状态
 */
export function rollbackOptimisticCoordinationSend(
  queryClient: QueryClient,
  _item: WorkbenchInboxItem,
  _currentUser?: { id?: string; username?: string } | null
) {
  void queryClient.invalidateQueries(['workbench-inbox']);
  void queryClient.invalidateQueries(['workbench-inbox-summary']);
  void queryClient.invalidateQueries(['workbench-todos']);
  void queryClient.invalidateQueries(['workbench-todos-summary']);
  void queryClient.invalidateQueries(['workbench-coordination-sent-tasks']);
}

/**
 * 撤回已发事项时，立即执行乐观 UI 迁移：
 * 1. 立即从「已发事项」列表中移除该条目
 * 2. 扣减「已发事项」统计指标，增加「待办」与「收集箱待整理」统计指标
 */
export function applyOptimisticCoordinationRecall(
  queryClient: QueryClient,
  taskId: string,
  inboxItemId?: string
) {
  const cleanId = taskId.replace(/^(?:coord_)+/, '');

  // 1. 从 sent-tasks 缓存中移除
  queryClient.setQueriesData({ queryKey: ['workbench-coordination-sent-tasks'] }, (oldList: any) => {
    if (!Array.isArray(oldList)) return oldList;
    return oldList.filter(
      (t: any) =>
        t.taskId !== taskId &&
        t.taskId !== `coord_${cleanId}` &&
        t.taskId !== cleanId &&
        (!inboxItemId || t.inboxItemId !== inboxItemId)
    );
  });

  // 2. 更新 todos 统计（sent - 1, pending + 1）
  queryClient.setQueriesData({ queryKey: ['workbench-todos-summary'] }, (oldTodoSummary: any) => {
    if (!oldTodoSummary) return oldTodoSummary;
    return {
      ...oldTodoSummary,
      sent: Math.max(0, (oldTodoSummary.sent || 1) - 1),
      pending: (oldTodoSummary.pending || 0) + 1,
    };
  });

  // 3. 更新收件箱待整理指标（条目已转待办，不增加待整理 unprocessed）
  queryClient.setQueriesData({ queryKey: ['workbench-inbox-summary'] }, (oldSummary: any) => {
    if (!oldSummary) return oldSummary;
    if (Array.isArray(oldSummary.items)) {
      return {
        ...oldSummary,
        items: oldSummary.items.map((it: any) =>
          it.id === inboxItemId || it.sourceRefId === taskId || it.id === cleanId
            ? { ...it, status: 'converted' }
            : it
        ),
      };
    }
    return oldSummary;
  });

  // 4. 乐观更新收件箱列表缓存（状态置为 converted，避免在「待整理」中双重展示）
  queryClient.setQueriesData({ queryKey: ['workbench-inbox'] }, (oldData: any) => {
    if (!oldData) return oldData;
    const items = Array.isArray(oldData?.items) ? [...oldData.items] : [];
    const idx = items.findIndex(
      (it: any) =>
        it.id === inboxItemId ||
        it.id === cleanId ||
        it.id === taskId ||
        it.sourceRefId === taskId ||
        it.sourceRefId === cleanId
    );
    if (idx >= 0) {
      const it = items[idx];
      const payload = it.unifiedPayload || {};
      const cleanCore = (it.title || '')
        .replace(/^【(?:已驳回|需重修|待发送|已发送|已撤回)】\s*/g, '')
        .replace(/^\[(?:已驳回|需重修|待发送|已发送|已撤回|待担当确认|待初稿确认)\]\s*/g, '')
        .trim();
      items[idx] = {
        ...it,
        status: 'converted',
        title: `[已撤回] ${cleanCore}`,
        unifiedPayload: {
          ...payload,
          status: 'pending',
          isRecalled: true,
          inTransit: false,
          currentStage: 'initiator_confirm',
        },
      };
    }
    return {
      ...oldData,
      items,
    };
  });

  // 5. 乐观更新待办列表缓存（状态置为 pending，isRecalled 置为 true）
  queryClient.setQueriesData({ queryKey: ['workbench-todos'] }, (oldList: any) => {
    if (!Array.isArray(oldList)) return oldList;
    return oldList.map((t: any) => {
      const isTarget =
        t.id === taskId ||
        t.id === `coord_${cleanId}` ||
        t.id === `inbox_${cleanId}` ||
        t.id === `inbox_${inboxItemId}` ||
        t.sourceRefId === taskId ||
        t.sourceRefId === cleanId ||
        t.contextData?.taskId === taskId ||
        t.contextData?.inboxItemId === inboxItemId;
      if (isTarget) {
        const cleanCore = (t.title || '')
          .replace(/^【(?:已驳回|需重修|待发送|已发送|已撤回)】\s*/g, '')
          .replace(/^\[(?:已驳回|需重修|待发送|已发送|已撤回|待担当确认|待初稿确认)\]\s*/g, '')
          .trim();
        return {
          ...t,
          status: 'pending',
          title: `[已撤回] ${cleanCore}`,
          contextData: {
            ...t.contextData,
            isRecalled: true,
            isArchived: false,
            unifiedPayload: {
              ...t.contextData?.unifiedPayload,
              status: 'pending',
              isRecalled: true,
              inTransit: false,
              currentStage: 'initiator_confirm',
            },
          },
        };
      }
      return t;
    });
  });
}
