import type { ExecutionDto } from '@ops/user-core';
import type { MessageInstance } from 'antd/es/message/interface';
import { chatApi, executionApi } from '../../../api';
import { workbenchInboxApi } from '../../../api/workbenchInbox';
import { notificationStore } from '../../../adapters/notifications/notificationStore';

export interface BackgroundTaskEntry {
  executionId: string;
  isChatSession?: boolean;
  title: string;
  sessionId?: string;
  messageId?: string;
  startedAt: number;
  toast: MessageInstance;
  onCompleted?: (execution: ExecutionDto) => void;
}

const TERMINAL_STATUSES = new Set([
  'succeeded',
  'completed',
  'failed',
  'cancelled',
  'rolled_back',
  'waiting_input',
  'pending_approval',
  'human_control',
]);

class BackgroundTaskManager {
  private activeTasks = new Map<string, BackgroundTaskEntry>();
  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  private queryInvalidator?: () => void;

  /**
   * 注册全局查询失效器（例如用于刷新 GTD 收件箱列表和总结）
   */
  setQueryInvalidator(invalidator: () => void) {
    this.queryInvalidator = invalidator;
  }

  /**
   * 注册进入后台执行的任务
   */
  registerTask(entry: BackgroundTaskEntry) {
    this.activeTasks.set(entry.executionId, entry);
    this.ensurePolling();
  }

  /**
   * 启动后台轮询
   */
  private ensurePolling() {
    if (this.pollingTimer !== null || this.activeTasks.size === 0) {
      return;
    }

    this.pollingTimer = setInterval(() => {
      void this.pollActiveTasks();
    }, 3500);
  }

  /**
   * 轮询处理处于活动状态的后台任务
   */
  private async pollActiveTasks() {
    if (this.activeTasks.size === 0) {
      if (this.pollingTimer !== null) {
        clearInterval(this.pollingTimer);
        this.pollingTimer = null;
      }
      return;
    }

    const taskList = Array.from(this.activeTasks.values());

    for (const task of taskList) {
      try {
        if (task.isChatSession && task.sessionId) {
          // 个人沙箱/对话任务：轮询对话历史检查是否完成
          const history = await chatApi.getChatHistory(task.sessionId);
          const lastMsg = history[history.length - 1];
          if (lastMsg && lastMsg.role === 'assistant' && lastMsg.content && !lastMsg.isStreaming) {
            this.activeTasks.delete(task.executionId);
            const pseudoExecution: ExecutionDto = {
              id: task.executionId,
              skillId: 'personal-sandbox',
              status: 'succeeded',
              createdAt: new Date(task.startedAt).toISOString(),
              updatedAt: new Date().toISOString(),
              endedAt: new Date().toISOString(),
              result: {
                content: lastMsg.content,
              },
            };
            await this.handleTaskFinished(task, pseudoExecution);
          } else if (Date.now() - task.startedAt > 15 * 60 * 1000) {
            this.activeTasks.delete(task.executionId);
            task.toast.warning(`后台任务「${task.title}」已超时`);
          }
          continue;
        }

        const execution = await executionApi.getById(task.executionId);

        if (execution && TERMINAL_STATUSES.has(execution.status)) {
          // 任务已进入终态，处理完成并从轮询列表移除
          this.activeTasks.delete(task.executionId);
          await this.handleTaskFinished(task, execution);
        } else if (Date.now() - task.startedAt > 15 * 60 * 1000) {
          // 超时保护（15分钟），避免无限轮询
          this.activeTasks.delete(task.executionId);
          task.toast.warning(`后台任务「${task.title}」已超时，请前往任务中心核对状态`);
        }
      } catch (err) {
        console.warn(`[BackgroundTaskManager] 轮询任务 ${task.executionId} 出错:`, err);
      }
    }
  }

  /**
   * 任务完成后的处理：消息提示、写入全局通知、沉淀入 GTD 收件箱
   */
  private async handleTaskFinished(task: BackgroundTaskEntry, execution: ExecutionDto) {
    const { title, executionId, toast, onCompleted } = task;
    const isSuccess = execution.status === 'succeeded';
    const isIntervention =
      execution.status === 'waiting_input' ||
      execution.status === 'pending_approval' ||
      execution.status === 'human_control';
    const isFailed = execution.status === 'failed';
    const isCancelled = execution.status === 'cancelled';

    // 1. 弹出消息提示 Toast
    if (isSuccess) {
      toast.success(`后台任务「${title}」执行成功！结果已自动保存至 GTD 收集箱`);
    } else if (isIntervention) {
      toast.warning(`后台任务「${title}」需要人工介入，已沉淀至 GTD 收集箱待处理`);
    } else if (isCancelled) {
      toast.info(`后台任务「${title}」已取消`);
    } else if (isFailed) {
      toast.error(`后台任务「${title}」执行失败，错误已同步至 GTD 收集箱`);
    }

    // 2. 写入应用通知中心 (NotificationStore)
    const timestamp = new Date().toISOString();
    const failureMsg = execution.failureReason || execution.failureCode;
    const summaryText = failureMsg
      ? `失败: ${failureMsg}`
      : execution.result
      ? JSON.stringify(execution.result)
      : `任务状态: ${execution.status}`;

    notificationStore.getState().upsertNotification({
      id: `bg-task-${executionId}-${execution.status}`,
      dedupeKey: `execution:${executionId}:${execution.status}`,
      source: 'execution',
      sourceId: executionId,
      severity: isSuccess ? 'success' : isIntervention ? 'warning' : 'error',
      category: isSuccess ? 'completed' : isIntervention ? (execution.status as any) : 'failed',
      status: execution.status,
      stateKey: `${execution.status}:${title}`,
      timestamp,
      unread: true,
      requiresAction: isIntervention || isFailed,
      actionUrl: `/executions/${executionId}`,
      metadata: {
        executionId,
        resultTitle: `[后台任务] ${title}`,
        resultSummary: summaryText,
      },
    });

    // 3. 自动沉淀至 GTD 收件箱 (Workbench Inbox)
    try {
      const rawContent = this.formatExecutionContent(execution, title);
      await workbenchInboxApi.ingest({
        title: `后台任务：${title}`,
        rawContent,
        sourceType: 'chat',
        sourceRefId: executionId,
        sourceTitle: title,
        sourceSender: '后台任务执行引擎',
        extra: {
          executionId,
          status: execution.status,
          requiresHumanIntervention: isIntervention || isFailed,
          actionUrl: `/executions/${executionId}`,
        },
      });

      // 4. 触发收件箱数据刷新
      if (this.queryInvalidator) {
        this.queryInvalidator();
      }
    } catch (inboxError) {
      console.error('[BackgroundTaskManager] 沉淀至 GTD 收件箱失败:', inboxError);
    }

    // 5. 触发回调通知上层
    try {
      onCompleted?.(execution);
    } catch {
      // 忽略回调中异常
    }
  }

  /**
   * 格式化执行单结果供 GTD 收件箱展示
   */
  private formatExecutionContent(execution: ExecutionDto, title: string): string {
    const statusMap: Record<string, string> = {
      succeeded: '✅ 执行成功',
      completed: '✅ 执行完成',
      failed: '❌ 执行失败',
      cancelled: '⏹️ 已取消',
      waiting_input: '⚠️ 等待用户补充输入',
      pending_approval: '⚠️ 等待审批',
      human_control: '⚠️ 需要人工介入',
    };
    const statusText = statusMap[execution.status] || execution.status;

    let content = `### 后台任务执行报告：${title}\n\n`;
    content += `- **执行单 ID**：\`${execution.id}\`\n`;
    content += `- **最终状态**：${statusText}\n`;
    if (execution.startedAt) {
      content += `- **启动时间**：${execution.startedAt}\n`;
    }
    if (execution.endedAt) {
      content += `- **完成时间**：${execution.endedAt}\n`;
    }

    let detailText = '';
    if (execution.failureReason) {
      detailText = `错误原因：${execution.failureReason}`;
    } else if (typeof execution.result?.content === 'string') {
      detailText = execution.result.content;
    } else if (execution.result && Object.keys(execution.result).length > 0) {
      detailText = JSON.stringify(execution.result, null, 2);
    }

    if (detailText) {
      content += `\n#### 执行结果详情\n\n${detailText}\n`;
    }

    return content;
  }
}

export const backgroundTaskManager = new BackgroundTaskManager();
