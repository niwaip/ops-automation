import { useState } from 'react';
import { message } from 'antd';
import { useQueryClient } from 'react-query';
import type { WorkbenchInboxItem } from '@/api/workbenchInbox';
import { workbenchCoordinationApi } from '@/api/workbenchCoordination';
import { useAuthStore } from '@/shared/store/authStore';
import { classifyWorkflowNode } from '../lib/coordinationNodeClassifier';
import {
  applyOptimisticCoordinationSend,
  rollbackOptimisticCoordinationSend,
} from '../lib/coordinationOptimistic';

export function useInboxCoordinationActions(onArchiveItem: (id: string) => void) {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [quickSendingId, setQuickSendingId] = useState<string | null>(null);
  const [optimisticSentIds, setOptimisticSentIds] = useState<Set<string>>(new Set());

  const handleQuickCoordAction = async (item: WorkbenchInboxItem) => {
    try {
      setQuickSendingId(item.id);
      const nodeSemantics = classifyWorkflowNode(item, user?.username, user?.id);
      const payload = (item.unifiedPayload || {}) as Record<string, any>;
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
      const actionType = nodeSemantics.cardActionType === 'send'
        ? 'approve'
        : isAssignment ? 'complete' : 'approve';
      if (nodeSemantics.cardActionType === 'send' || actionType === 'approve' || actionType === 'complete') {
        setOptimisticSentIds((previous) => new Set(previous).add(item.id));
        applyOptimisticCoordinationSend(queryClient, item, user);
      }
      void message.success(
        nodeSemantics.cardActionType === 'send'
          ? '已提交送审！系统正在进行智能合规诊断，已自动迁移至「已发事项」。'
          : `已成功处理「${nodeSemantics.displayTitle || item.title}」，已自动迁移至「已发事项」！`
      );
      await workbenchCoordinationApi.submitAction(item.id, {
        action: actionType,
        comment: nodeSemantics.cardActionText === '重新发送'
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
    } catch (error: any) {
      setOptimisticSentIds((previous) => {
        const next = new Set(previous);
        next.delete(item.id);
        return next;
      });
      rollbackOptimisticCoordinationSend(queryClient, item, user);
      if (error?.message?.includes('未找到协同任务') || error?.response?.status === 404) {
        void message.warning('该协同任务已在其他环节流转或已更新，已为您自动刷新最新状态');
        void queryClient.invalidateQueries(['workbench-inbox']);
        void queryClient.invalidateQueries(['workbench-inbox-summary']);
        void queryClient.invalidateQueries(['workbench-todos']);
        void queryClient.invalidateQueries(['workbench-coordination-sent-tasks']);
        return;
      }
      void message.error(error?.message || '操作失败，您可点击「详细」进行处理');
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
      for (const key of ['workbench-inbox', 'workbench-inbox-summary', 'workbench-todos', 'workbench-todos-summary', 'workbench-coordination-sent-tasks']) {
        void queryClient.invalidateQueries([key]);
      }
    } catch (error: any) {
      void message.error(error?.message || '撤回失败，请重试');
    }
  };

  const handleRemindItem = (item: WorkbenchInboxItem) => {
    const nodeSemantics = classifyWorkflowNode(item, user?.username, user?.id);
    void message.success(`已向处理担当 @${nodeSemantics.currentAssigneeName || '处理担当'} 发送催办提醒，已催促尽快办理！`);
  };

  return { handleQuickCoordAction, handleRecallItem, handleRemindItem, optimisticSentIds, quickSendingId };
}
