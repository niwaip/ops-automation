import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@ops/user-core';
import { resolveMessageTaskStatus } from './taskStatus';

describe('taskStatus - resolveMessageTaskStatus', () => {
  it('does not treat queued status as terminal when message has finished and has outcome', () => {
    const finishedMessageWithQueuedMeta: ChatMessage = {
      id: 'msg-1',
      sessionId: 'sess-1',
      role: 'assistant',
      content: '财务识别已完成：全部 10 张表已解析完成。',
      timestamp: new Date().toISOString(),
      isStreaming: false,
      metadata: {
        mode: 'task',
        taskStatus: 'queued',
        hasBusinessResult: true,
        finalResult: '财务识别已完成',
      },
    };

    const status = resolveMessageTaskStatus(finishedMessageWithQueuedMeta);
    expect(status).toBe('completed');
  });

  it('clears residual queued status when message has finished streaming and has no business outcome', () => {
    const finishedMessageResidualQueued: ChatMessage = {
      id: 'msg-2',
      sessionId: 'sess-1',
      role: 'assistant',
      content: '执行完毕',
      timestamp: new Date().toISOString(),
      isStreaming: false,
      metadata: {
        taskStatus: 'queued',
      },
    };

    const status = resolveMessageTaskStatus(finishedMessageResidualQueued);
    expect(status).toBeUndefined();
  });

  it('preserves queued status when message is actively streaming/waiting', () => {
    const streamingQueuedMessage: ChatMessage = {
      id: 'msg-3',
      sessionId: 'sess-1',
      role: 'assistant',
      content: '⏳ 任务排队中...',
      timestamp: new Date().toISOString(),
      isStreaming: true,
      metadata: {
        taskStatus: 'queued',
      },
    };

    const status = resolveMessageTaskStatus(streamingQueuedMessage);
    expect(status).toBe('queued');
  });
});
