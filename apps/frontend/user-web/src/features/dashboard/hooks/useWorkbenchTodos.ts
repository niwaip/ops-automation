import { useCallback, useMemo, useState } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import {
  workbenchTodoApi,
  type TodoPriority,
  type WorkbenchTodoItem,
} from '../../../api/workbenchTodo';
import { workbenchInboxApi } from '../../../api/workbenchInbox';
import { workbenchCoordinationApi } from '../../../api/workbenchCoordination';
import { useAuthStore } from '@/shared/store/authStore';
import { applyOptimisticCoordinationRecall } from '../lib/coordinationOptimistic';

export type WorkbenchTodoTab = 'pending' | 'today' | 'sent' | 'ended' | 'all' | 'overdue';

const parseTodoDraftIntoTasks = (value: string): string[] => {
  const normalized = value
    .replace(/\r/g, '\n')
    .replace(/[；;]/g, '\n')
    .replace(/(?:^|\n)\s*\d+[.)、]\s*/g, '\n')
    .replace(/(?:^|\n)\s*[-*•]\s*/g, '\n');

  return Array.from(
    new Set(
      normalized
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
};

export const isItemInitiatedByMe = (
  item: WorkbenchTodoItem,
  currentUsername: string,
  currentUserId?: string
): boolean => {
  const contextData = (item.contextData || {}) as Record<string, any>;
  const coordPayload = (contextData.unifiedPayload || {}) as Record<string, any>;
  const lowerUname = currentUsername.toLowerCase();

  if (coordPayload.initiator?.username && coordPayload.initiator.username.toLowerCase() === lowerUname) {
    return true;
  }
  if (coordPayload.initiator?.id && currentUserId && coordPayload.initiator.id === currentUserId) {
    return true;
  }
  if (contextData.sourceSender && contextData.sourceSender.toLowerCase() === lowerUname) {
    return true;
  }
  if (contextData.initiatorName && contextData.initiatorName.toLowerCase() === lowerUname) {
    return true;
  }
  if (contextData.isInitiator === true) {
    return true;
  }
  return false;
};

export const isAssignedToOtherItem = (
  item: WorkbenchTodoItem,
  currentUsername: string,
  currentUserId?: string
): boolean => {
  const contextData = (item.contextData || {}) as Record<string, any>;
  const coordPayload = (contextData.unifiedPayload || {}) as Record<string, any>;
  const currentStage = coordPayload.currentStage || (item as any).currentStage || '';

  // 1. 如果任务已处于办结、完成、已归档终态，绝不是外发等待他人事项
  const extSync = coordPayload.externalSyncResult || (item as any).externalSyncResult || {};
  const isArchivedSync =
    Boolean(extSync.detail?.archiveId) ||
    (Boolean(extSync.trackingNumber) && !extSync.trackingNumber.includes('-REV-'));
  if (
    item.status === 'completed' ||
    item.status === 'cancelled' ||
    coordPayload.status === 'completed' ||
    coordPayload.status === 'archived' ||
    isArchivedSync ||
    Boolean(contextData.isArchived) ||
    Boolean(coordPayload.isRecalled) ||
    Boolean(contextData.isRecalled) ||
    currentStage === 'final_receipt'
  ) {
    return false;
  }

  const isInitiated = isItemInitiatedByMe(item, currentUsername, currentUserId);
  if (!isInitiated) return false;

  // 2. 核心机制：如果已外发流转（inTransit 或 asyncExecution 正在运行，或处于智能审查阶段），
  // 说明经办人已点击「发送」，该事项已被外发流转，立刻进入「已发事项」！
  if (
    coordPayload.inTransit ||
    coordPayload.isSent ||
    coordPayload.asyncExecution?.status === 'running' ||
    currentStage === 'contract_review_execution'
  ) {
    return true;
  }

  // 3. 如果当前处于发起人初稿确认/核对发送阶段，属于经办人自己的待办操作，绝不是外发等待他人事项
  if (
    currentStage === 'initiator_confirm' ||
    currentStage === 'draft_submission' ||
    coordPayload.approverRule === 'initiator'
  ) {
    return false;
  }

  const assigneeUsername = coordPayload.assignee?.username;
  const assigneeId = coordPayload.assignee?.id;
  if (!assigneeUsername && !assigneeId) {
    return currentStage !== 'initiator_confirm' && currentStage !== 'draft_submission';
  }

  // 4. 如果用户名相同（忽略大小写），说明是当前用户本人
  if (assigneeUsername && currentUsername && assigneeUsername.toLowerCase() === currentUsername.toLowerCase()) {
    return false;
  }
  if (assigneeId && currentUserId && assigneeId === currentUserId) {
    return false;
  }

  if (assigneeUsername && currentUsername && assigneeUsername.toLowerCase() !== currentUsername.toLowerCase()) {
    return true;
  }

  if (assigneeId && currentUserId && assigneeId !== currentUserId) {
    return true;
  }

  return false;
};

interface UseWorkbenchTodosOptions {
  message: MessageInstance;
}

export function useWorkbenchTodos({ message }: UseWorkbenchTodosOptions) {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const currentUsername = user?.username || '';
  const currentUserId = user?.id;

  const [todoDraft, setTodoDraft] = useState('');
  const [activeTab, setActiveTab] = useState<WorkbenchTodoTab>('pending');
  const [archivedIds, setArchivedIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('ops_archived_workbench_ids');
      if (saved) {
        return new Set(JSON.parse(saved));
      }
    } catch (_) {}
    return new Set();
  });

  // 获取全部待办列表（单次全量查询并在前端智能分流，确保各 Tab 计数与列表毫秒级无缝联动）
  const { data: allTodoData, isLoading } = useQuery(
    ['workbench-todos-summary'],
    () => workbenchTodoApi.list({ pageSize: 100 }),
    {
      staleTime: 10000,
      refetchInterval: 30000,
    }
  );

  // 获取我发起的协同事项列表（自动汇总进已发事项）
  const { data: sentCoordTasks } = useQuery(
    ['workbench-coordination-sent-tasks', currentUserId],
    () => workbenchCoordinationApi.listTasks('initiator').catch(() => []),
    {
      staleTime: 10000,
      refetchInterval: 30000,
    }
  );

  // 获取收集箱中由我发起或转派的条目（使未转任务的流转事项也能直接进入「已发事项」）
  const { data: inboxData } = useQuery(
    ['workbench-inbox-summary-for-todos'],
    () => workbenchInboxApi.list({ pageSize: 100 }).catch(() => ({ items: [] })),
    {
      staleTime: 10000,
      refetchInterval: 30000,
    }
  );

  const allItems = useMemo(() => {
    const rawTodos = allTodoData?.items ?? [];
    const knownInboxItemIds = new Set<string>();
    const knownTaskIds = new Set<string>();
    const seenWorkflowKeys = new Set<string>();

    for (const t of rawTodos) {
      const cData = (t.contextData || {}) as Record<string, any>;
      if (t.status !== 'completed' && t.status !== 'cancelled') {
        if (cData.inboxItemId) knownInboxItemIds.add(cData.inboxItemId);
        if (cData.taskId) knownTaskIds.add(cData.taskId);
        if (cData.unifiedPayload?.taskId) knownTaskIds.add(cData.unifiedPayload.taskId);
        if (cData.unifiedPayload?.metadata?.parentTaskId) {
          knownTaskIds.add(cData.unifiedPayload.metadata.parentTaskId);
        }
        if (t.sourceRefId) {
          knownInboxItemIds.add(t.sourceRefId);
          knownTaskIds.add(t.sourceRefId);
        }
        const wId = t.boundWorkflowId || cData.workflowId || cData.unifiedPayload?.workflowId;
        if (wId && t.title) {
          seenWorkflowKeys.add(`${wId}::${t.title.trim()}`);
        }
      }
    }

    const merged: WorkbenchTodoItem[] = [...rawTodos];

    // 1. 合并我发起的协同流转任务 (Coordination Tasks)
    // 1. 合并我发起的协同流转任务 (Coordination Tasks)
    const coordList = Array.isArray(sentCoordTasks) ? sentCoordTasks : [];
    for (const c of coordList) {
      const meta = (c.metadata || {}) as Record<string, any>;
      const parentTaskId = meta.parentTaskId || c.parameters?.parentTaskId;

      if (c.taskId && (knownTaskIds.has(c.taskId) || knownTaskIds.has(`coord_${c.taskId}`))) {
        continue;
      }
      if (c.inboxItemId && knownInboxItemIds.has(c.inboxItemId)) {
        continue;
      }

      // 判断该协同事项是否已外发流转给他人处理（已发事项）或已结束
      const currentStage = c.currentStage || (c as any).parameters?.currentStage;
      const isAssignedToOther = isAssignedToOtherItem(
        {
          contextData: {
            unifiedPayload: {
              kind: 'coordination',
              taskId: c.taskId,
              workflowId: c.workflowId,
              currentStage,
              initiator: c.initiator,
              assignee: c.assignee,
              metadata: meta,
            },
            isInitiator: true,
          },
        } as any,
        currentUsername,
        currentUserId
      );

      const extSync = (c.externalSyncResult || (c.unifiedPayload as any)?.externalSyncResult || {}) as Record<string, any>;
      const isArchivedSync =
        Boolean(extSync.detail?.archiveId) ||
        (Boolean(extSync.trackingNumber) && !extSync.trackingNumber.includes('-REV-'));
      const isTerminalCompleted =
        c.status === 'completed' ||
        (c.status === 'approved' && isArchivedSync) ||
        isArchivedSync ||
        currentStage === 'final_receipt';

      const isTerminalArchived =
        (c.status as string) === 'archived' ||
        archivedIds.has(c.taskId) ||
        (c.inboxItemId && archivedIds.has(c.inboxItemId)) ||
        Boolean(meta.isArchived);

      const isTerminalCancelled =
        c.status === 'rejected' ||
        (c.status as any) === 'canceled' ||
        (c.status as any) === 'cancelled';

      const isEnded = isTerminalCompleted || isTerminalArchived || isTerminalCancelled;

      // 核心原则：如果协同任务仍处于经办人/发起人初稿确认阶段（尚未外发他人，且未结束），
      // 它纯属 GTD 收集箱中的待整理条目，绝不可提前进入行动待办看板（避免双重管理）
      if (!isAssignedToOther && !isEnded) {
        continue;
      }

      // 同一工作流、同一业务标题的卡片进行合并去重，区分进行中与已结束状态，避免生命周期顶替
      const wKey = c.workflowId ? `${c.workflowId}::${c.title?.trim()}::${isEnded ? 'ended' : 'active'}` : null;
      if (wKey && seenWorkflowKeys.has(wKey)) {
        continue;
      }

      if (c.taskId) knownTaskIds.add(c.taskId);
      if (parentTaskId) knownTaskIds.add(parentTaskId);
      if (c.inboxItemId) knownInboxItemIds.add(c.inboxItemId);
      if (wKey) seenWorkflowKeys.add(wKey);

      const normalizedTaskId = c.taskId.startsWith('coord_') ? c.taskId : `coord_${c.taskId}`;
      const mappedStatus = isTerminalCompleted
        ? 'completed'
        : isTerminalArchived || isTerminalCancelled
        ? 'cancelled'
        : 'pending';

      merged.push({
        id: normalizedTaskId,
        userId: currentUserId || '',
        title: c.title,
        description: c.rawContent || '',
        priority: (c.priority as TodoPriority) || 'medium',
        status: mappedStatus,
        dueDate: c.dueDate || null,
        sourceType: 'chat',
        sourceRefId: c.taskId,
        sourceTitle: c.title,
        boundWorkflowId: c.workflowId || null,
        createdAt: c.createdAt || new Date().toISOString(),
        updatedAt: c.updatedAt || new Date().toISOString(),
        contextData: {
          taskId: c.taskId,
          inboxItemId: c.inboxItemId,
          sourceSender: c.initiator?.username || currentUsername,
          isArchived: isTerminalArchived,
          unifiedPayload: {
            kind: 'coordination',
            taskId: c.taskId,
            workflowId: c.workflowId,
            taskType: c.taskType || 'approval',
            status: mappedStatus,
            currentStage,
            parameters: c.parameters,
            initiator: c.initiator,
            assignee: c.assignee,
            attachments: c.attachments || [],
            actions: c.actions || [],
            externalSyncResult: c.externalSyncResult,
            metadata: meta,
          },
          isInitiator: true,
        },
      });
    }

    // 2. 合并收件箱中由当前用户发起或转派的条目 (Inbox Items)
    const inboxList = inboxData?.items ?? [];
    for (const item of inboxList) {
      // 已转任务的条目由 rawTodos (正式待办库) 统一承载，严禁在此重复生成 completed 假任务
      if (item.status === 'converted') continue;
      if (knownInboxItemIds.has(item.id)) continue;
      if (item.sourceRefId && knownTaskIds.has(item.sourceRefId)) continue;
      if (item.convertedTodoId && rawTodos.some((t) => t.id === item.convertedTodoId)) continue;

      const payload = (item.unifiedPayload || {}) as Record<string, any>;
      const parentTaskId = payload.metadata?.parentTaskId;
      if (parentTaskId && knownTaskIds.has(parentTaskId)) continue;

      // 判断是否由当前用户发起或转派
      if (!isItemInitiatedByMe(item as any, currentUsername, currentUserId)) {
        continue;
      }

      // 仅当条目已外发转派给他人（已发事项）或已明确归档时才汇总，未转任务且仍由本人处理的条目严格留在 GTD 收集箱
      // 但若该事项已被撤回 (isRecalled)，则必须回到行动待办与看板中供用户重新编辑/重新发送
      const isAssignedToOther = isAssignedToOtherItem(item as any, currentUsername, currentUserId);
      const isEnded = item.status === 'archived' || item.status === 'discarded';
      const isRecalled = Boolean(payload.isRecalled) || Boolean((item as any).isRecalled);
      if (!isAssignedToOther && !isEnded && !isRecalled) {
        continue;
      }

      const wKey = payload.workflowId ? `${payload.workflowId}::${(item.sourceTitle || item.title)?.trim()}` : null;
      if (wKey && seenWorkflowKeys.has(wKey)) {
        continue;
      }

      knownInboxItemIds.add(item.id);
      if (item.sourceRefId) knownTaskIds.add(item.sourceRefId);
      if (parentTaskId) knownTaskIds.add(parentTaskId);
      if (wKey) seenWorkflowKeys.add(wKey);

      merged.push({
        id: `inbox_${item.id}`,
        userId: item.userId || currentUserId || '',
        title: item.title,
        description: item.rawContent || '',
        priority: (payload.priority as TodoPriority) || 'medium',
        status:
          item.status === 'archived' || item.status === 'discarded'
            ? 'cancelled'
            : 'pending',
        dueDate: payload.dueDate || null,
        sourceType: item.sourceType || 'chat',
        sourceRefId: item.sourceRefId || item.id,
        sourceTitle: item.sourceTitle || item.title,
        boundWorkflowId: payload.workflowId || null,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        contextData: {
          inboxItemId: item.id,
          sourceSender: item.sourceSender || currentUsername,
          unifiedPayload: payload,
          isInitiatedByMe: true,
          isRecalled: isRecalled,
        },
      });
    }

    for (const item of merged) {
      const isRealTodo = !item.id.startsWith('coord_') && !item.id.startsWith('inbox_');
      const cData = (item.contextData || {}) as Record<string, any>;
      const isRecalled = Boolean(cData.isRecalled) || Boolean(cData.unifiedPayload?.isRecalled);
      if (isRecalled) continue;

      if (isRealTodo) {
        if (archivedIds.has(item.id) || Boolean(cData.isArchived)) {
          item.status = 'cancelled';
          (item.contextData as any).isArchived = true;
        }
      } else {
        if (
          archivedIds.has(item.id) ||
          (item.sourceRefId && archivedIds.has(item.sourceRefId)) ||
          (cData.inboxItemId && archivedIds.has(cData.inboxItemId)) ||
          (cData.taskId && archivedIds.has(cData.taskId)) ||
          Boolean(cData.isArchived)
        ) {
          item.status = 'cancelled';
          (item.contextData as any).isArchived = true;
        }
      }
    }

    return merged;
  }, [allTodoData, sentCoordTasks, inboxData, currentUsername, currentUserId, archivedIds]);

  // Tab 统计指标：待办、已发事项、已结束（含完成与归档）、全部
  const todoSummary = useMemo(() => {
    const now = new Date().getTime();

    // 待办：待办库中进行中的直接作业（排除未经转任务的收集箱/协同临时条目，但被撤回返回待办的事项除外）
    const pending = allItems.filter((i) => {
      const cData = (i.contextData || {}) as Record<string, any>;
      const isRecalled = Boolean(cData.isRecalled) || Boolean(cData.unifiedPayload?.isRecalled);
      const isDirectTodo = !i.id.startsWith('inbox_') && !i.id.startsWith('coord_');
      if (!isDirectTodo && !isRecalled) return false;
      if (i.status !== 'pending' && i.status !== 'in_progress') return false;
      if (archivedIds.has(i.id) && !isRecalled) return false;
      if (Boolean(cData.isArchived)) return false;
      return true;
    }).length;

    // 今日待办：兼容旧字段，与 pending 待办保持一致
    const today = pending;

    // 已发事项：当前登录用户发起且已外发流转给他人处理的事项，进行单独管理
    const sent = allItems.filter((i) => {
      const cData = (i.contextData || {}) as Record<string, any>;
      const payload = (cData.unifiedPayload || {}) as Record<string, any>;
      const isRecalled = Boolean(cData.isRecalled) || Boolean(payload.isRecalled);
      if (isRecalled) return false;

      const extSync = payload.externalSyncResult || (i as any).externalSyncResult || {};
      const isArchivedSync =
        Boolean(extSync.detail?.archiveId) ||
        (Boolean(extSync.trackingNumber) && !extSync.trackingNumber.includes('-REV-'));
      const isCoord =
        i.id.startsWith('coord_') ||
        i.id.startsWith('inbox_') ||
        Boolean(i.sourceRefId?.startsWith('coord_')) ||
        payload.kind === 'coordination';

      if (!isCoord) return false;
      if (i.status === 'completed' || i.status === 'cancelled') return false;
      if (payload.status === 'completed' || payload.status === 'archived') return false;
      if (isArchivedSync) return false;
      if (archivedIds.has(i.id) || Boolean(cData.isArchived)) return false;

      return isAssignedToOtherItem(i, currentUsername, currentUserId);
    }).length;

    // 真实已完成数量（不含归档/撤回等关闭状态，纯粹已完成）
    const completed = allItems.filter(
      (i) =>
        i.status === 'completed' &&
        !archivedIds.has(i.id) &&
        !Boolean((i.contextData as any)?.isArchived)
    ).length;

    // 已结束：包含已完成 (completed) 和已归档/已废弃 (cancelled) 的所有事项（被撤回回退到待办的事项严格排除）
    const ended = allItems.filter((i) => {
      const cData = (i.contextData || {}) as Record<string, any>;
      const payload = (cData.unifiedPayload || {}) as Record<string, any>;
      const isRecalled = Boolean(cData.isRecalled) || Boolean(payload.isRecalled);
      if (isRecalled) return false;

      const extSync = payload.externalSyncResult || (i as any).externalSyncResult || {};
      const isArchivedSync =
        Boolean(extSync.detail?.archiveId) ||
        (Boolean(extSync.trackingNumber) && !extSync.trackingNumber.includes('-REV-'));

      return (
        i.status === 'completed' ||
        i.status === 'cancelled' ||
        payload.status === 'completed' ||
        payload.status === 'archived' ||
        isArchivedSync ||
        archivedIds.has(i.id) ||
        Boolean(cData.isArchived)
      );
    }).length;

    // 逾期提醒
    const overdue = allItems.filter(
      (i) =>
        !i.id.startsWith('inbox_') &&
        !i.id.startsWith('coord_') &&
        i.dueDate &&
        new Date(i.dueDate).getTime() < now &&
        i.status !== 'completed' &&
        i.status !== 'cancelled' &&
        !archivedIds.has(i.id) &&
        !Boolean((i.contextData as any)?.isArchived)
    ).length;

    const total = allItems.filter((i) => {
      const cData = (i.contextData || {}) as Record<string, any>;
      const payload = (cData.unifiedPayload || {}) as Record<string, any>;
      const isCoord = i.id.startsWith('coord_') || i.id.startsWith('inbox_');
      if (!isCoord) {
        return (
          !archivedIds.has(i.id) &&
          !Boolean(cData.isArchived)
        );
      }
      return (
        isAssignedToOtherItem(i, currentUsername, currentUserId) ||
        i.status === 'completed' ||
        i.status === 'cancelled' ||
        payload.status === 'completed' ||
        payload.status === 'archived' ||
        Boolean(payload.externalSyncResult?.trackingNumber)
      );
    }).length;

    // 今日完成待办统计
    const isToday = (dateStr?: string | null) => {
      if (!dateStr) return false;
      const d = new Date(dateStr);
      const todayDate = new Date();
      return (
        d.getFullYear() === todayDate.getFullYear() &&
        d.getMonth() === todayDate.getMonth() &&
        d.getDate() === todayDate.getDate()
      );
    };

    const completedToday = allItems.filter(
      (i) =>
        i.status === 'completed' &&
        !archivedIds.has(i.id) &&
        !Boolean((i.contextData as any)?.isArchived) &&
        (isToday(i.completedAt) || isToday(i.updatedAt))
    ).length;

    return {
      total,
      pending,
      today,
      sent,
      ended,
      overdue,
      completed,
      completedToday,
    };
  }, [allItems, currentUsername, currentUserId, archivedIds]);

  // 根据当前激活的 Tab 智能过滤待办事项
  const todos = useMemo(() => {
    const now = new Date().getTime();

    switch (activeTab) {
      case 'today':
      case 'pending':
        // 待办：进行中的直接作业（排除未经转任务的收集箱/协同临时条目，但被撤回返回待办的事项除外）
        return allItems.filter((i) => {
          const cData = (i.contextData || {}) as Record<string, any>;
          const isRecalled = Boolean(cData.isRecalled) || Boolean(cData.unifiedPayload?.isRecalled);
          const isDirectTodo = !i.id.startsWith('inbox_') && !i.id.startsWith('coord_');
          if (!isDirectTodo && !isRecalled) return false;
          if (i.status !== 'pending' && i.status !== 'in_progress') return false;
          if (archivedIds.has(i.id) && !isRecalled) return false;
          if (Boolean(cData.isArchived)) return false;
          return true;
        });
      case 'sent':
        // 已发事项：单独管理当前用户发起且外发流转给他人处理的事项
        return allItems.filter((i) => {
          const cData = (i.contextData || {}) as Record<string, any>;
          const payload = (cData.unifiedPayload || {}) as Record<string, any>;
          const isRecalled = Boolean(cData.isRecalled) || Boolean(payload.isRecalled);
          if (isRecalled) return false;

          const extSync = payload.externalSyncResult || (i as any).externalSyncResult || {};
          const isArchivedSync =
            Boolean(extSync.detail?.archiveId) ||
            (Boolean(extSync.trackingNumber) && !extSync.trackingNumber.includes('-REV-'));
          const isCoord =
            i.id.startsWith('coord_') ||
            i.id.startsWith('inbox_') ||
            Boolean(i.sourceRefId?.startsWith('coord_')) ||
            payload.kind === 'coordination';

          if (!isCoord) return false;
          if (i.status === 'completed' || i.status === 'cancelled') return false;
          if (payload.status === 'completed' || payload.status === 'archived') return false;
          if (isArchivedSync) return false;
          if (archivedIds.has(i.id) || Boolean(cData.isArchived)) return false;

          return isAssignedToOtherItem(i, currentUsername, currentUserId);
        });
      case 'ended':
        // 已结束：包含完成和归档的（被撤回回退到待办的事项严格排除）
        return allItems.filter((i) => {
          const cData = (i.contextData || {}) as Record<string, any>;
          const payload = (cData.unifiedPayload || {}) as Record<string, any>;
          const isRecalled = Boolean(cData.isRecalled) || Boolean(payload.isRecalled);
          if (isRecalled) return false;

          const extSync = payload.externalSyncResult || (i as any).externalSyncResult || {};
          const isArchivedSync =
            Boolean(extSync.detail?.archiveId) ||
            (Boolean(extSync.trackingNumber) && !extSync.trackingNumber.includes('-REV-'));

          return (
            i.status === 'completed' ||
            i.status === 'cancelled' ||
            payload.status === 'completed' ||
            payload.status === 'archived' ||
            isArchivedSync ||
            archivedIds.has(i.id) ||
            Boolean(cData.isArchived)
          );
        });
      case 'overdue':
        return allItems.filter(
          (i) =>
            !i.id.startsWith('inbox_') &&
            !i.id.startsWith('coord_') &&
            i.dueDate &&
            new Date(i.dueDate).getTime() < now &&
            i.status !== 'completed' &&
            i.status !== 'cancelled' &&
            !archivedIds.has(i.id) &&
            !Boolean((i.contextData as any)?.isArchived)
        );
      case 'all':
      default:
        return allItems.filter((i) => {
          const cData = (i.contextData || {}) as Record<string, any>;
          const payload = (cData.unifiedPayload || {}) as Record<string, any>;
          const isCoord = i.id.startsWith('coord_') || i.id.startsWith('inbox_');
          if (!isCoord) {
            return (
              !archivedIds.has(i.id) &&
              !Boolean(cData.isArchived)
            );
          }
          return (
            isAssignedToOtherItem(i, currentUsername, currentUserId) ||
            i.status === 'completed' ||
            i.status === 'cancelled' ||
            payload.status === 'completed' ||
            payload.status === 'archived' ||
            Boolean(payload.externalSyncResult?.trackingNumber)
          );
        });
    }
  }, [allItems, activeTab, currentUsername, currentUserId, archivedIds]);

  // 批量/单条创建待办
  const createMutation = useMutation(
    async (titles: string[]) => {
      for (const title of titles) {
        let priority: TodoPriority = 'medium';
        if (/紧急|立刻|马上|尽快|高优|asap|严重|p0/i.test(title)) {
          priority = 'high';
        }
        await workbenchTodoApi.create({
          title,
          priority,
          sourceType: 'manual',
        });
      }
    },
    {
      onSuccess: (_, titles) => {
        void queryClient.invalidateQueries(['workbench-todos']);
        void queryClient.invalidateQueries(['workbench-todos-summary']);
        void message.success(
          titles.length === 1 ? '已添加 1 条待办' : `已解析并添加 ${titles.length} 条待办`
        );
        setTodoDraft('');
      },
      onError: (err: any) => {
        void message.error(`创建失败: ${err?.message || '未知错误'}`);
      },
    }
  );

  const handleCreateTodo = useCallback(() => {
    const nextTodos = parseTodoDraftIntoTasks(todoDraft);
    if (nextTodos.length === 0) {
      return;
    }
    createMutation.mutate(nextTodos);
  }, [createMutation, todoDraft]);

  // 切换完成状态
  const toggleMutation = useMutation(
    async ({ id, completed }: { id: string; completed: boolean }) => {
      if (id.startsWith('inbox_')) {
        const inboxId = id.replace('inbox_', '');
        return await workbenchInboxApi.updateStatus(inboxId, completed ? 'archived' : 'unprocessed');
      }
      if (id.startsWith('coord_')) {
        throw new Error('流程任务需通过具体业务节点审批/流转处理，不能直接勾选关闭');
      }
      return await workbenchTodoApi.update(id, {
        status: completed ? 'completed' : 'pending',
      });
    },
    {
      onSuccess: () => {
        void queryClient.invalidateQueries(['workbench-todos']);
        void queryClient.invalidateQueries(['workbench-todos-summary']);
        void queryClient.invalidateQueries(['workbench-inbox']);
        void queryClient.invalidateQueries(['workbench-inbox-summary-for-todos']);
        void queryClient.invalidateQueries(['workbench-coordination-sent-tasks']);
      },
      onError: (err: any) => {
        void message.error(`更新状态失败: ${err?.message || '未知错误'}`);
      },
    }
  );

  const handleToggleTodo = useCallback(
    (id: string, completed: boolean) => {
      toggleMutation.mutate({ id, completed });
    },
    [toggleMutation]
  );

  // 归档待办（代替原先直接物理删除，只能归档）
  const archiveMutation = useMutation(
    async (id: string) => {
      const target = allItems.find((i) => i.id === id);
      const cData = (target?.contextData || {}) as Record<string, any>;
      const taskId =
        (id.startsWith('coord_') ? id.replace('coord_', '') : null) ||
        cData.taskId ||
        (cData.unifiedPayload as any)?.taskId ||
        target?.sourceRefId;
      const inboxId =
        (id.startsWith('inbox_') ? id.replace('inbox_', '') : null) ||
        cData.inboxItemId;

      if (taskId && (id.startsWith('coord_') || taskId.startsWith('coord_'))) {
        try {
          await workbenchCoordinationApi.archiveTask(taskId);
        } catch {
          await workbenchCoordinationApi.submitAction(taskId, {
            action: 'reject',
            comment: '发起人归档此事项',
          }).catch(() => {});
        }
      }
      if (inboxId) {
        await workbenchInboxApi.updateStatus(inboxId, 'archived').catch(() => {});
      }
      if (!id.startsWith('coord_') && !id.startsWith('inbox_')) {
        await workbenchTodoApi.update(id, {
          status: 'cancelled',
        }).catch(() => {});
      }
      return { success: true };
    },
    {
      onSuccess: () => {
        void queryClient.invalidateQueries(['workbench-todos']);
        void queryClient.invalidateQueries(['workbench-todos-summary']);
        void queryClient.invalidateQueries(['workbench-inbox']);
        void queryClient.invalidateQueries(['workbench-inbox-summary-for-todos']);
        void queryClient.invalidateQueries(['workbench-coordination-sent-tasks']);
        void message.success('已将此事项归档，可在「已结束」中查阅');
      },
      onError: (err: any) => {
        void message.error(`归档失败: ${err?.message || '未知错误'}`);
      },
    }
  );

  const handleArchiveTodo = useCallback(
    (id: string) => {
      const target = allItems.find((i) => i.id === id);
      const isRealTodo = target && !target.id.startsWith('coord_') && !target.id.startsWith('inbox_');
      const cData = (target?.contextData || {}) as Record<string, any>;
      setArchivedIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        if (!isRealTodo) {
          if (target?.sourceRefId) next.add(target.sourceRefId);
          if (cData.taskId) next.add(cData.taskId);
          if (cData.inboxItemId) next.add(cData.inboxItemId);
        }
        try {
          localStorage.setItem('ops_archived_workbench_ids', JSON.stringify(Array.from(next)));
        } catch (_) {}
        return next;
      });
      archiveMutation.mutate(id);
    },
    [allItems, archiveMutation]
  );

  // 撤回我发起的事项（终止下游流转，退回发起人待办）
  const recallMutation = useMutation(
    async (item: WorkbenchTodoItem) => {
      const id = item.id;
      const contextData = (item.contextData || {}) as Record<string, any>;
      const taskId =
        contextData.taskId ||
        (contextData.unifiedPayload as any)?.taskId ||
        (id.startsWith('coord_') ? id.replace('coord_', '') : null) ||
        contextData.inboxItemId ||
        (id.startsWith('inbox_') ? id.replace('inbox_', '') : null) ||
        item.sourceRefId ||
        id;

      return await workbenchCoordinationApi.recallTask(taskId);
    },
    {
      onSuccess: () => {
        setActiveTab('pending');
        void queryClient.invalidateQueries(['workbench-todos']);
        void queryClient.invalidateQueries(['workbench-todos-summary']);
        void queryClient.invalidateQueries(['workbench-inbox']);
        void queryClient.invalidateQueries(['workbench-inbox-summary']);
        void queryClient.invalidateQueries(['workbench-inbox-summary-for-todos']);
        void queryClient.invalidateQueries(['workbench-coordination-sent-tasks']);
        void message.success('已成功撤回该发起事项，已退回至您的「待办」');
      },
      onError: (err: any) => {
        void queryClient.invalidateQueries(['workbench-todos']);
        void queryClient.invalidateQueries(['workbench-todos-summary']);
        void queryClient.invalidateQueries(['workbench-inbox']);
        void queryClient.invalidateQueries(['workbench-inbox-summary']);
        void queryClient.invalidateQueries(['workbench-coordination-sent-tasks']);
        void message.error(`撤回失败: ${err?.message || '未知错误'}`);
      },
    }
  );

  const handleRecallTodo = useCallback(
    (item: WorkbenchTodoItem) => {
      const cData = (item.contextData || {}) as Record<string, any>;
      const taskId =
        cData.taskId ||
        (cData.unifiedPayload as any)?.taskId ||
        (item.id.startsWith('coord_') ? item.id.replace('coord_', '') : null) ||
        item.sourceRefId ||
        item.id;
      const inboxItemId = cData.inboxItemId;

      // 确保从本地已归档列表中剔除，恢复为待办看板条目
      setArchivedIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        if (item.sourceRefId) next.delete(item.sourceRefId);
        if (cData.taskId) next.delete(cData.taskId);
        if (cData.inboxItemId) next.delete(cData.inboxItemId);
        try {
          localStorage.setItem('ops_archived_workbench_ids', JSON.stringify(Array.from(next)));
        } catch (_) {}
        return next;
      });

      // 0ms 乐观迁移：立即从「已发事项」移出并推入「待办」
      applyOptimisticCoordinationRecall(queryClient, taskId, inboxItemId);
      setActiveTab('pending');

      recallMutation.mutate(item);
    },
    [recallMutation, queryClient]
  );

  // 催办事项
  const handleRemindTodo = useCallback(
    (item: WorkbenchTodoItem) => {
      const contextData = (item.contextData || {}) as Record<string, any>;
      const coordPayload = (contextData.unifiedPayload || {}) as Record<string, any>;
      const assigneeName = coordPayload.assignee?.username || '处理担当';
      void message.success(`已向处理担当 @${assigneeName} 发送催办提醒，已催促尽快办理！`);
    },
    [message]
  );

  // 保持兼容的删除方法（底层走归档，符合业务规范）
  const handleDeleteTodo = useCallback(
    (id: string) => {
      handleArchiveTodo(id);
    },
    [handleArchiveTodo]
  );

  // 执行工作流任务
  const executeMutation = useMutation(
    async (id: string) => {
      return await workbenchTodoApi.executeTask(id);
    },
    {
      onSuccess: (res) => {
        void queryClient.invalidateQueries(['workbench-todos']);
        void queryClient.invalidateQueries(['workbench-todos-summary']);
        void message.success(`自动化工作流已触发执行！执行单号: ${res.executionId.slice(0, 8)}`);
      },
      onError: (err: any) => {
        void message.error(`执行失败: ${err?.message || '未知错误'}`);
      },
    }
  );

  const handleExecuteTodo = useCallback(
    (id: string) => {
      executeMutation.mutate(id);
    },
    [executeMutation]
  );

  return {
    activeTab,
    handleArchiveTodo,
    handleCreateTodo,
    handleDeleteTodo,
    handleExecuteTodo,
    handleRecallTodo,
    handleRemindTodo,
    handleToggleTodo,
    isLoading: isLoading || createMutation.isLoading,
    isExecuting: executeMutation.isLoading,
    setActiveTab,
    setTodoDraft,
    todoDraft,
    todoSummary,
    todos,
  };
}
