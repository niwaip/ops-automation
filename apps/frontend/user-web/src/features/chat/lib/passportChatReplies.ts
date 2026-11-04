import type { ChatMessage } from '@ops/user-core';
import { buildPatchedMessage } from './messageState';
import { resolveMessageTaskStatus } from './taskStatus';

export type PassportReply = { status: 'running' | 'completed' | 'failed' | 'cancelled' | 'waiting_input' | 'pending_approval' | 'unknown'; text: string };
export type PassportReplyHandler = (reply: PassportReply) => void;
type Tracked = { sessionId: string; message: ChatMessage; handler: PassportReplyHandler; status: string; at: number };

// Correlates only device-originated requests to their exact assistant message.
export class PassportChatReplies {
  private current?: PassportReplyHandler;
  private tracked = new Map<string, Tracked>();

  capture<T>(handler: PassportReplyHandler | undefined, send: () => T): T {
    const previous = this.current;
    this.current = handler;
    try { return send(); } finally { this.current = previous; }
  }

  start(sessionId: string, message: ChatMessage) {
    if (!this.current) return;
    for (const [key, entry] of this.tracked) if (Date.now()-entry.at > 3600000) this.tracked.delete(key);
    if (this.tracked.size >= 32) this.tracked.delete(this.tracked.keys().next().value!);
    const entry = { sessionId, message, handler: this.current, status: 'running', at: Date.now() };
    this.tracked.set(message.id, entry);
    this.emit(entry, { status:'running',text:'正在处理，请稍候' });
  }

  patch(sessionId: string, messageId: string, patch: Partial<ChatMessage>) {
    const entry = this.tracked.get(messageId);
    if (!entry || entry.sessionId !== sessionId) return;
    entry.message = buildPatchedMessage(entry.message, patch);
    const message = entry.message;
    const taskStatus = resolveMessageTaskStatus(message);
    const raw = message.metadata?.executionStatus || message.metadata?.taskStatus;
    let status: PassportReply['status'];
    if (raw === 'pending_approval' || raw === 'waiting_input') status = raw;
    else if (taskStatus === 'pending_approval' || taskStatus === 'waiting_input') status = taskStatus;
    else if (taskStatus === 'human_control' || raw === 'human_control') status = 'waiting_input';
    else if (message.isStreaming) return;
    else if (taskStatus === 'failed' || taskStatus === 'cancelled') status = taskStatus;
    else if (taskStatus === 'completed') status = 'completed';
    else if (raw === 'running' || raw === 'queued') status = 'running';
    else if (message.metadata?.mode === 'task') status = 'unknown';
    else status = message.content.trim() ? 'completed' : 'unknown';
    if (entry.status === status) return;
    entry.status = status;
    const text = status === 'pending_approval' ? '需要审批，请在网页处理'
      : status === 'waiting_input' ? '需要补充信息，请在网页处理'
      : status === 'cancelled' ? '已停止'
      : status === 'unknown' ? '结果尚未确认，请在网页查看'
      : status === 'running' ? '任务仍在运行，请稍候'
      : status === 'failed' ? String(message.metadata?.errorMessage || message.metadata?.failureReason || '处理失败，请在网页查看')
      : String(message.metadata?.finalResult || message.metadata?.normalizedResult?.summary || message.metadata?.finalSummary || message.content || '回复已完成');
    this.emit(entry, {status,text});
    if (['completed','failed','cancelled'].includes(status)) this.tracked.delete(messageId);
  }

  clear() { this.current = undefined; this.tracked.clear(); }
  private emit(entry: Tracked, reply: PassportReply) { try { entry.handler(reply); } catch { /* Device failure must not break chat rendering. */ } }
}
export const passportChatReplies = new PassportChatReplies();
