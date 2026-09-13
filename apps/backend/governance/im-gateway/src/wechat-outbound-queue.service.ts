import { Injectable, Logger } from '@nestjs/common';

export type OutboundItem =
  | {
      kind: 'text';
      text: string;
      contextToken?: string;
    }
  | {
      kind: 'media';
      mediaType: 1 | 2 | 3 | 4;
      buffer: Buffer;
      fileName: string;
      contextToken?: string;
    };

export const WECHAT_MSG_LIMIT_MAX = 10;
export const WECHAT_MSG_LIMIT_WARN = 8;
export const MAX_OUTBOUND_QUEUE = 50;

@Injectable()
export class WechatOutboundQueueService {
  private readonly logger = new Logger(WechatOutboundQueueService.name);
  private readonly messageCounts = new Map<string, number>();
  private readonly queues = new Map<string, OutboundItem[]>();

  getBudgetUsed(connectionId: string): number {
    return this.messageCounts.get(connectionId) ?? 0;
  }

  isBudgetAvailable(connectionId: string): boolean {
    return this.getBudgetUsed(connectionId) < WECHAT_MSG_LIMIT_MAX;
  }

  recordSent(connectionId: string): number {
    const current = this.getBudgetUsed(connectionId);
    const updated = current + 1;
    this.messageCounts.set(connectionId, updated);
    return updated;
  }

  resetBudget(connectionId: string): void {
    this.messageCounts.set(connectionId, 0);
  }

  park(connectionId: string, item: OutboundItem): void {
    let queue = this.queues.get(connectionId);
    if (!queue) {
      queue = [];
      this.queues.set(connectionId, queue);
    }
    queue.push(item);
    if (queue.length > MAX_OUTBOUND_QUEUE) {
      const dropped = queue.splice(0, queue.length - MAX_OUTBOUND_QUEUE);
      this.logger.warn(
        `Connection ${connectionId} outbound queue overflowed (${MAX_OUTBOUND_QUEUE}), dropped ${dropped.length} oldest message(s)`
      );
    }
  }

  getPendingCount(connectionId: string): number {
    return this.queues.get(connectionId)?.length ?? 0;
  }

  getPending(connectionId: string): OutboundItem[] {
    return this.queues.get(connectionId) ?? [];
  }

  clearQueue(connectionId: string): void {
    this.queues.delete(connectionId);
  }

  /**
   * Drain pending items up to available budget.
   */
  drainBatch(connectionId: string, maxItems = WECHAT_MSG_LIMIT_MAX): OutboundItem[] {
    const queue = this.queues.get(connectionId);
    if (!queue || queue.length === 0) return [];
    return queue.splice(0, maxItems);
  }

  /**
   * Generates quota warning suffix when approaching rate limit.
   */
  buildQuotaWarningSuffix(sentCount: number): string {
    if (sentCount >= WECHAT_MSG_LIMIT_WARN) {
      return `\n\n⚠️ 微信限制连续发送消息数量${WECHAT_MSG_LIMIT_MAX}条（已发 ${sentCount} 条），回复任意消息可继续接收。`;
    }
    return '';
  }
}
