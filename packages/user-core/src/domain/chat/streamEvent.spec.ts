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

  it('keeps accumulated round summaries intact and does not leak think into contentParts when THOUGHT event arrives', () => {
    const priorSummary = '⏳ [Harness Agent] 正在根据执行结果汇总交付物 (第 2 轮)...';
    const reduced = reduceChatStreamEvent({
      event: {
        type: StreamEventType.THOUGHT,
        content: 'I need to write index.html to workspace',
        data: {
          mode: 'chat',
          thought: 'I need to write index.html to workspace',
          thoughtLogsSnapshot: ['I need to write index.html to workspace'],
        },
      },
      accumulatedContent: priorSummary,
      mode: 'chat',
    });

    // 严禁冲刷覆盖已有轮次摘要
    assert.equal(reduced.accumulatedContent, priorSummary);
    assert.equal(reduced.messagePatch.content, priorSummary);
    // 严禁将思考内容作为 text part 泄露到正文气泡
    assert.equal(reduced.messagePatch.contentParts, undefined);
    assert.deepEqual(reduced.messagePatch.metadata?.thoughtLogsSnapshot, [
      'I need to write index.html to workspace',
    ]);
  });

  it('extracts usage from sandbox metrics when data.usage is not directly supplied', () => {
    const reduced = reduceChatStreamEvent({
      event: {
        type: StreamEventType.RESULT,
        content: '回答完成',
        data: {
          mode: 'chat',
          sandbox: {
            metrics: {
              tokens: {
                prompt_tokens: 120,
                completion_tokens: 30,
                total_tokens: 150,
              },
            },
          },
        },
      },
      accumulatedContent: '',
      mode: 'chat',
    });

    assert.deepEqual(reduced.messagePatch.metadata?.usage, {
      prompt_tokens: 120,
      completion_tokens: 30,
      total_tokens: 150,
      completion_tokens_details: undefined,
    });
  });
});

describe('resolveChatMessageUsage', () => {
  it('prefers direct metadata.usage when total_tokens > 0', async () => {
    const { resolveChatMessageUsage } = await import('../../../dist/domain/chat/streamEvent.js');
    const usage = resolveChatMessageUsage({
      metadata: {
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
        executionTrace: {
          metrics: {
            tokens: {
              prompt_tokens: 999,
              completion_tokens: 999,
              total_tokens: 1998,
            },
          },
        },
      },
    });

    assert.deepEqual(usage, {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
      completion_tokens_details: undefined,
    });
  });

  it('falls back to executionTrace.metrics.tokens for personal sandbox history messages', async () => {
    const { resolveChatMessageUsage } = await import('../../../dist/domain/chat/streamEvent.js');
    const usage = resolveChatMessageUsage({
      metadata: {
        executionTrace: {
          containerName: 'dsh-user-1',
          metrics: {
            tokens: {
              prompt_tokens: 350,
              completion_tokens: 150,
              total_tokens: 500,
            },
          },
        },
      },
    });

    assert.deepEqual(usage, {
      prompt_tokens: 350,
      completion_tokens: 150,
      total_tokens: 500,
      completion_tokens_details: undefined,
    });
  });

  it('returns undefined if no usage or metrics found', async () => {
    const { resolveChatMessageUsage } = await import('../../../dist/domain/chat/streamEvent.js');
    assert.equal(resolveChatMessageUsage(null), undefined);
    assert.equal(resolveChatMessageUsage({ metadata: {} }), undefined);
  });
});



describe('independent chat progress and artifacts', () => {
  it('does not replace a readable answer or reactivate streaming for progress-only events', () => {
    const body = '已核验的表格正文';
    const reduced = reduceChatStreamEvent({ event: {
      type: StreamEventType.OBSERVATION, content: '正在整理元数据', data: { progressOnly: true },
    }, accumulatedContent: body, mode: 'chat' });
    assert.equal(reduced.accumulatedContent, body);
    assert.equal('content' in reduced.messagePatch, false);
    assert.equal('contentParts' in reduced.messagePatch, false);
    assert.equal('isStreaming' in reduced.messagePatch, false);
    assert.equal(reduced.progressLog?.stage, 'observation');
    assert.equal(reduced.progressLog?.text, '正在整理元数据');
  });

  it('attaches downloads without changing body or contentParts', () => {
    const reduced = reduceChatStreamEvent({ event: {
      type: StreamEventType.RESULT, content: '', data: { artifactsOnly: true,
        artifacts: [{ name: 'result.xlsx', downloadUrl: '/api/ai/chat/workspace-files/me/result.xlsx' }] },
    }, accumulatedContent: '正文保持不变', mode: 'chat' });
    assert.equal(reduced.accumulatedContent, '正文保持不变');
    assert.equal('content' in reduced.messagePatch, false);
    assert.equal('contentParts' in reduced.messagePatch, false);
    assert.equal('isStreaming' in reduced.messagePatch, false);
    assert.equal(reduced.messagePatch.metadata?.artifacts?.[0].name, 'result.xlsx');
  });
});

 it('keeps provisional text hidden while reporting live progress', () => {
   for (const text of ['正在查询', '正在查询\n已读取 3 条热点']) {
     const reduced = reduceChatStreamEvent({ event: {
       type: StreamEventType.OBSERVATION, content: text,
       data: { progressOnly: true, isDelta: true },
     }, accumulatedContent: '正式正文', mode: 'chat' });
     assert.equal(reduced.accumulatedContent, '正式正文');
     assert.equal(reduced.progressLog?.text, `正在整理回答（已处理 ${text.length} 字符），等待校验…`);
     assert.equal('isStreaming' in reduced.messagePatch, false);
     assert.equal('content' in reduced.messagePatch, false);
   }
 });
