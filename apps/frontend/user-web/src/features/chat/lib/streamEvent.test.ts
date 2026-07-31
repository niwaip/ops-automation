import { describe, expect, it } from 'vitest';
import { reduceChatStreamEvent } from '@ops/user-core';
import { StreamEventType } from '@ops/user-core/types';

describe('reduceChatStreamEvent', () => {
  it('completes a ReAct task result without a control-plane execution id', () => {
    const reduced = reduceChatStreamEvent({
      event: {
        type: StreamEventType.RESULT,
        content: '当前没有匹配的实时搜索能力。\n\n任务完成',
        data: {
          taskStatus: 'completed',
          result: {
            taskComplete: true,
            capabilityMatched: false,
          },
        },
        iteration: 1,
      },
      accumulatedContent: '',
      mode: 'task',
    });

    expect(reduced.messagePatch.isStreaming).toBe(false);
    expect(reduced.messagePatch.metadata?.taskStatus).toBe('completed');
    expect(reduced.messagePatch.metadata?.finalResult).toContain('没有匹配');
  });
});
