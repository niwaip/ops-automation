import type { PassportReplyHandler } from './passportChatReplies';

export interface PassportChatItem {
  text: string;
  send: boolean;
  sessionId: string | null;
  onReply?: PassportReplyHandler;
}
interface Pending extends PassportChatItem { resolve(): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout>; claimed: boolean }

// One inbox per browser tab. Account changes and BLE disconnects cancel pending work.
export class PassportChatInbox {
  private items: Pending[] = [];
  enqueue(input: PassportChatItem): Promise<void> {
    if (!input.text.trim() || input.text.length > 10000) return Promise.reject(new Error('蓝牙聊天内容无效'));
    if (this.items.length >= 8) return Promise.reject(new Error('聊天待发送消息过多，请稍后再说'));
    return new Promise((resolve, reject) => {
      const item: Pending = { ...input, resolve, reject, claimed: false, timer: setTimeout(() => {
        this.remove(item); reject(new Error('聊天窗口繁忙，语音尚未提交，请在配对页查看识别文字后重试'));
      }, 120000) };
      this.items.push(item);
    });
  }
  consume(handler: (item: PassportChatItem) => boolean) {
    const item = this.items[0];
    if (!item || item.claimed) return;
    item.claimed = true;
    try {
      if (!handler(item)) { item.claimed = false; return; }
      this.remove(item); item.resolve();
    } catch (error) { this.remove(item); item.reject(error instanceof Error ? error : new Error('聊天发送失败')); }
  }
  clear() {
    const items = this.items.splice(0);
    for (const item of items) { clearTimeout(item.timer); item.reject(new Error('蓝牙连接或登录账户已变化，取消待发送消息')); }
  }
  private remove(item: Pending) { clearTimeout(item.timer); this.items = this.items.filter((value) => value !== item); }
}
export const passportChatInbox = new PassportChatInbox();
