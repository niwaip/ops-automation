import { NotFoundException } from '@nestjs/common';
import { parseSavePersonalSkillIntent } from './personal-skill-intent.util';

/** Select business work, never a save acknowledgement or a known failed execution. */
export function selectPersonalSkillSourceTurn(history: any[], messageId?: string): number {
  const isUsable = (index: number): boolean => {
    const msg = history[index];
    const user = history[index - 1];
    const trace = msg?.metadata?.executionTrace;
    return msg?.role === 'assistant' && Boolean(String(msg.content || '').trim()) &&
      user?.role === 'user' && !parseSavePersonalSkillIntent(user.content).isMatch &&
      !msg.metadata?.personalSkillCapture &&
      !(trace?.cancelled || trace?.abortedByUser || trace?.executed === false ||
        trace?.verified === false || (trace?.exitCode != null && trace.exitCode !== 0));
  };
  if (messageId) {
    const index = history.findIndex((m) => m.id === messageId || m.messageId === messageId);
    const target = history[index]?.role === 'user' ? index + 1 : index;
    if (index < 0 || !isUsable(target)) {
      throw new NotFoundException(`指定消息 [${messageId}] 没有可复用的已完成任务结果`);
    }
    return target;
  }
  for (let i = history.length - 1; i >= 0; i--) {
    if (isUsable(i)) return i;
  }
  throw new NotFoundException('当前会话没有可保存为技能的任务结果');
}
