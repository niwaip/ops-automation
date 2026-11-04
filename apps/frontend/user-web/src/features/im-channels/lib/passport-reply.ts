import type { PassportReply } from '@/features/chat/lib/passportChatReplies';
import type { PassportMessage } from './passport-protocol';

export function deviceText(text: string, budget: number): string {
  const plain = text.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi,'').replace(/```[\s\S]*?```/g,'[代码见网页]').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/https?:\/\/\S+/g,'').replace(/[#*_`>|]/g,'').replace(/\s+/g,' ').trim();
  const encoder = new TextEncoder();
  if (encoder.encode(plain).length <= budget) return plain;
  let result = '';
  for (const character of plain) { if (encoder.encode(result+character+'…').length > budget) break; result += character; }
  return result+'…';
}

export class PassportReplyRelay {
  private generation = 0;
  private queue = Promise.resolve();
  private recording = false;
  private resume: (() => void)[] = [];
  constructor(private send: (message: PassportMessage) => Promise<void>, private report: (text: string, error: boolean) => void) {}
  reset() { this.generation++; this.queue = Promise.resolve(); this.setRecording(false); }
  setRecording(recording: boolean) {
    this.recording = recording;
    if (!recording) for (const resume of this.resume.splice(0)) resume();
  }

  publish(reply: PassportReply) {
    const generation = this.generation;
    this.queue = this.queue.catch(() => undefined).then(async () => {
      if (this.recording) await new Promise<void>((resolve) => this.resume.push(resolve));
      if (generation !== this.generation) return;
      const title = deviceText(reply.text,60);
      // Firmware v1 supports only these four states. Never show failure as completed.
      const state = reply.status === 'completed' ? 'completed' : reply.status === 'running' ? 'running'
        : ['pending_approval','waiting_input'].includes(reply.status) ? 'waiting_approval' : 'idle';
      await this.send({type:'task.state',state,title});
      if (generation !== this.generation) return;
      if (reply.status !== 'running') {
        const prefix = reply.status === 'failed' ? '失败：' : reply.status === 'completed' ? '回复：' : '';
        await this.send({type:'toast',text:deviceText(prefix+reply.text,75),urgent:reply.status==='failed'});
      }
      if (generation === this.generation) this.report(reply.status === 'completed' ? '回复摘要已送达设备，全文见聊天窗口' : reply.status === 'running' ? '设备已收到处理中状态' : '设备已收到结果状态',false);
    }).catch(() => { if (generation === this.generation) this.report('设备未确认接收回复，请检查蓝牙连接；完整结果保留在聊天窗口',true); });
    return this.queue;
  }
}
