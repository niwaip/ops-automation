import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { reduceChatStreamEvent } from '../../../dist/domain/chat/streamEvent.js';
import { StreamEventType } from '../../../dist/types/chat.types.js';

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

    assert.equal(reduced.messagePatch.isStreaming, false);
    assert.equal(reduced.messagePatch.metadata?.taskStatus, 'completed');
    assert.ok(reduced.messagePatch.metadata?.finalResult?.includes('没有匹配'));
  });

  it('correctly updates accumulatedContent for streaming deltas without adding Observation prefix', () => {
    // 模拟第 1 个 delta chunk
    const r1 = reduceChatStreamEvent({
      event: {
        type: StreamEventType.OBSERVATION,
        content: '你好',
        data: { mode: 'chat', isDelta: true },
      },
      accumulatedContent: '',
      mode: 'chat',
    });
    assert.equal(r1.accumulatedContent, '你好');
    assert.equal(r1.messagePatch.content, '你好');
    assert.equal(r1.messagePatch.isStreaming, true);
    assert.equal(r1.accumulatedContent.includes('【观察】'), false);

    // 模拟第 2 个 delta chunk（累加串）
    const r2 = reduceChatStreamEvent({
      event: {
        type: StreamEventType.OBSERVATION,
        content: '你好，世界！',
        data: { mode: 'chat', isDelta: true },
      },
      accumulatedContent: r1.accumulatedContent,
      mode: 'chat',
    });
    assert.equal(r2.accumulatedContent, '你好，世界！');
    assert.equal(r2.messagePatch.content, '你好，世界！');
    assert.equal(r2.messagePatch.isStreaming, true);
    assert.equal(r2.accumulatedContent.includes('【观察】'), false);
  });

  it('correctly sets isQueued and queued taskStatus on queued observation event', () => {
    const reduced = reduceChatStreamEvent({
      event: {
        type: StreamEventType.OBSERVATION,
        content: '⏳ 任务已排队，等待前序任务完成后自动开始...',
        data: { isQueued: true, waitedMs: 1200 },
      },
      accumulatedContent: '',
      mode: 'chat',
    });

    assert.equal(reduced.messagePatch.isStreaming, true);
    assert.equal(reduced.messagePatch.metadata?.isQueued, true);
    assert.equal(reduced.messagePatch.metadata?.taskStatus, 'queued');
    assert.ok(reduced.messagePatch.content?.includes('⏳ 任务已排队'));
  });
});
