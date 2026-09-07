import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@ops/user-core';
import {
  normalizeComparableMessageText,
  dedupeThoughtTexts,
  mergeDefinedMetadata,
  areMessagesEquivalent,
  mergeHistoryMessages,
} from './messageState';
import { resolveMessageExecutionId } from './taskStatus';

describe('normalizeComparableMessageText', () => {
  it('should remove think tags and clean up whitespace', () => {
    expect(normalizeComparableMessageText('<think>hello</think> world')).toBe('world');
    expect(normalizeComparableMessageText('  hello   <think>world</think>  ')).toBe('hello');
    expect(normalizeComparableMessageText('hello <think>world')).toBe('hello');
    expect(normalizeComparableMessageText('hello \n\t world')).toBe('hello world');
  });
});

describe('dedupeThoughtTexts', () => {
  it('should deduplicate thought texts based on normalized content', () => {
    const thoughts = [
      'Thinking about something',
      'Thinking about something',
      'thinking about something', // lowercase
      'Different thought',
      '', // empty
      '   ', // whitespace
    ];
    // Note: 'thinking about something' should have a different normalized key if case is preserved
    // normalizeComparableMessageText does not lowercase. So case is preserved.
    expect(dedupeThoughtTexts(thoughts)).toEqual([
      'Thinking about something',
      'thinking about something',
      'Different thought',
    ]);
  });
});

describe('mergeDefinedMetadata', () => {
  it('should merge only defined fields from patchMetadata', () => {
    const current: ChatMessage['metadata'] = {
      taskStatus: 'running',
      executionId: '123',
    };
    const patch: ChatMessage['metadata'] = {
      taskStatus: undefined,
      executionId: '456',
      errorMessage: 'Failed',
    };
    expect(mergeDefinedMetadata(current, patch)).toEqual({
      taskStatus: 'running',
      executionId: '456',
      errorMessage: 'Failed',
    });
  });

  it('should return current metadata if patch is empty or all undefined', () => {
    const current: ChatMessage['metadata'] = { taskStatus: 'running' };
    expect(mergeDefinedMetadata(current, undefined)).toBe(current);
    expect(mergeDefinedMetadata(current, { taskStatus: undefined })).toBe(current);
  });
});

describe('areMessagesEquivalent', () => {
  const baseUserMsg: ChatMessage = {
    id: 'u1',
    sessionId: 's1',
    role: 'user',
    content: 'hello',
    timestamp: '2026-07-20T12:00:00.000Z',
  };

  it('should return false if roles are different', () => {
    const msg2 = { ...baseUserMsg, role: 'assistant' as const };
    expect(areMessagesEquivalent(baseUserMsg, msg2)).toBe(false);
  });

  it('should return false for user message if time difference is greater than 5 minutes', () => {
    const msg2 = {
      ...baseUserMsg,
      timestamp: '2026-07-20T12:05:01.000Z',
    };
    expect(areMessagesEquivalent(baseUserMsg, msg2)).toBe(false);
  });

  it('should return true for user message if content is normalized equivalent', () => {
    const msg2 = {
      ...baseUserMsg,
      content: '  hello  ',
      timestamp: '2026-07-20T12:00:05.000Z',
    };
    expect(areMessagesEquivalent(baseUserMsg, msg2)).toBe(true);
  });

  it('should return false for user message if content differs', () => {
    const msg2 = {
      ...baseUserMsg,
      content: 'hello world',
      timestamp: '2026-07-20T12:00:05.000Z',
    };
    expect(areMessagesEquivalent(baseUserMsg, msg2)).toBe(false);
  });

  it('uses the stable client message id beyond the time-based reconciliation window', () => {
    const localMessage: ChatMessage = {
      ...baseUserMsg,
      metadata: { clientMessageId: 'client-message-1' },
    };
    const persistedMessage: ChatMessage = {
      ...baseUserMsg,
      id: 'persisted-message-1',
      timestamp: '2026-07-20T12:20:00.000Z',
      metadata: { clientMessageId: 'client-message-1' },
    };

    expect(areMessagesEquivalent(localMessage, persistedMessage)).toBe(true);
  });

  it('does not merge repeated user text when stable client message ids differ', () => {
    expect(
      areMessagesEquivalent(
        { ...baseUserMsg, metadata: { clientMessageId: 'client-message-1' } },
        { ...baseUserMsg, metadata: { clientMessageId: 'client-message-2' } },
      ),
    ).toBe(false);
  });

  const baseAssistantMsg: ChatMessage = {
    id: 'a1',
    sessionId: 's1',
    role: 'assistant',
    content: 'hello',
    timestamp: '2026-07-20T12:00:00.000Z',
  };

  it('should return true for assistant message if time difference is within 2 minutes', () => {
    const msg2 = {
      ...baseAssistantMsg,
      timestamp: '2026-07-20T12:01:50.000Z',
    };
    expect(areMessagesEquivalent(baseAssistantMsg, msg2)).toBe(true);
  });

  it('should return false for assistant message if time difference is greater than 2 minutes', () => {
    const msg2 = {
      ...baseAssistantMsg,
      timestamp: '2026-07-20T12:02:10.000Z',
    };
    expect(areMessagesEquivalent(baseAssistantMsg, msg2)).toBe(false);
  });

  it('should return true for ephemeral assistant message if time difference is within 5 minutes', () => {
    const ephemeralMsg: ChatMessage = {
      ...baseAssistantMsg,
      isStreaming: true,
    };
    const msg2 = {
      ...ephemeralMsg,
      timestamp: '2026-07-20T12:04:50.000Z',
    };
    expect(areMessagesEquivalent(ephemeralMsg, msg2)).toBe(true);
  });

  it('correctly matches assistant message when remote has legacy mismatched clientMessageId but identical content within 2 minutes', () => {
    const localMsg: ChatMessage = {
      ...baseAssistantMsg,
      id: 'local-assistant-id',
      content: '生成pdf,保存到个人空间',
      metadata: { mode: 'chat', clientMessageId: 'local-assistant-id' },
    };
    const remoteMsg: ChatMessage = {
      ...baseAssistantMsg,
      id: 'remote-server-id',
      content: '生成pdf,保存到个人空间',
      timestamp: '2026-07-20T12:00:30.000Z',
      metadata: { mode: 'chat', clientMessageId: 'user-msg-id' },
    };

    expect(areMessagesEquivalent(localMsg, remoteMsg)).toBe(true);
    const merged = mergeHistoryMessages([remoteMsg], [localMsg]);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('remote-server-id');
  });

  it('correctly matches assistant message when matching clientAssistantMessageId is present', () => {
    const localMsg: ChatMessage = {
      ...baseAssistantMsg,
      id: 'assistant-uuid-1',
      content: '生成pdf完成',
      metadata: { mode: 'chat', clientMessageId: 'assistant-uuid-1' },
    };
    const remoteMsg: ChatMessage = {
      ...baseAssistantMsg,
      id: 'assistant-uuid-1',
      content: '生成pdf完成',
      timestamp: '2026-07-20T12:00:10.000Z',
      metadata: { mode: 'chat', clientMessageId: 'assistant-uuid-1' },
    };

    expect(areMessagesEquivalent(localMsg, remoteMsg)).toBe(true);
    const merged = mergeHistoryMessages([remoteMsg], [localMsg]);
    expect(merged).toHaveLength(1);
  });

  it('does not merge nearby task messages from different executions', () => {
    const localMessage: ChatMessage = {
      ...baseAssistantMsg,
      metadata: { mode: 'task', taskStatus: 'completed', executionId: 'execution-bilibili' },
    };
    const remoteMessage: ChatMessage = {
      ...baseAssistantMsg,
      id: 'a2',
      timestamp: '2026-07-20T12:00:30.000Z',
      metadata: { mode: 'task', taskStatus: 'completed', executionId: 'execution-weibo' },
    };

    expect(areMessagesEquivalent(localMessage, remoteMessage)).toBe(false);
    expect(mergeHistoryMessages([remoteMessage], [localMessage])).toHaveLength(2);
  });

  it('matches the same execution even when persisted after a long task', () => {
    const localMessage: ChatMessage = {
      ...baseAssistantMsg,
      metadata: { mode: 'task', taskStatus: 'completed', executionId: 'execution-weibo' },
    };
    const remoteMessage: ChatMessage = {
      ...baseAssistantMsg,
      id: 'a2',
      timestamp: '2026-07-20T12:10:00.000Z',
      metadata: { mode: 'task', taskStatus: 'completed', executionId: 'execution-weibo' },
    };

    expect(areMessagesEquivalent(localMessage, remoteMessage)).toBe(true);
  });

  it('does not merge waiting_input message with completed message for the same execution', () => {
    const waitingInputMsg: ChatMessage = {
      ...baseAssistantMsg,
      id: 'assistant-turn-1',
      content: '已创建等待补充信息的执行单。请补充：城市',
      metadata: { mode: 'task', taskStatus: 'waiting_input', executionId: 'execution-weather-1' },
    };
    const completedMsg: ChatMessage = {
      ...baseAssistantMsg,
      id: 'assistant-turn-2',
      content: '上海今日天气晴，26℃',
      timestamp: '2026-07-20T12:02:00.000Z',
      metadata: { mode: 'task', taskStatus: 'completed', executionId: 'execution-weather-1' },
    };

    expect(areMessagesEquivalent(waitingInputMsg, completedMsg)).toBe(false);
  });

  it('does not merge pending_approval message with completed message for the same execution', () => {
    const approvalMsg: ChatMessage = {
      ...baseAssistantMsg,
      id: 'assistant-turn-1',
      content: '等待审批',
      metadata: { mode: 'task', taskStatus: 'pending_approval', executionId: 'execution-deploy-1' },
    };
    const completedMsg: ChatMessage = {
      ...baseAssistantMsg,
      id: 'assistant-turn-2',
      content: '部署已完成',
      timestamp: '2026-07-20T12:05:00.000Z',
      metadata: { mode: 'task', taskStatus: 'completed', executionId: 'execution-deploy-1' },
    };

    expect(areMessagesEquivalent(approvalMsg, completedMsg)).toBe(false);
  });

  it('requires matching outcome text for task messages without execution IDs', () => {
    const localMessage: ChatMessage = {
      ...baseAssistantMsg,
      content: '',
      metadata: { mode: 'task', taskStatus: 'completed', finalSummary: 'Bilibili 热点总结' },
    };
    const remoteMessage: ChatMessage = {
      ...baseAssistantMsg,
      id: 'a2',
      content: '',
      timestamp: '2026-07-20T12:00:30.000Z',
      metadata: { mode: 'task', taskStatus: 'completed', finalSummary: '微博热点总结' },
    };

    expect(areMessagesEquivalent(localMessage, remoteMessage)).toBe(false);
  });

  it('preserves the streamed task card when persisted history omits structured parts', () => {
    const localMessage: ChatMessage = {
      ...baseAssistantMsg,
      content: '',
      contentParts: [
        { type: 'task_card', taskStatus: 'completed', executionId: 'execution-weibo' },
      ],
      metadata: { mode: 'task', taskStatus: 'completed', finalSummary: '微博热点总结' },
    };
    const remoteMessage: ChatMessage = {
      ...baseAssistantMsg,
      id: 'a2',
      content: '微博热点总结',
      timestamp: '2026-07-20T12:00:30.000Z',
      metadata: { mode: 'task', taskStatus: 'completed', finalSummary: '微博热点总结' },
    };

    const [mergedMessage] = mergeHistoryMessages([remoteMessage], [localMessage]);
    expect(mergedMessage.id).toBe('a2');
    expect(resolveMessageExecutionId(mergedMessage)).toBe('execution-weibo');
  });
});

describe('resolveMessageExecutionId', () => {
  it('prefers the current task card when reconciled metadata is stale', () => {
    const message: ChatMessage = {
      id: 'a1',
      sessionId: 's1',
      role: 'assistant',
      content: '',
      timestamp: '2026-07-20T12:00:00.000Z',
      metadata: { mode: 'task', executionId: 'execution-bilibili' },
      contentParts: [
        { type: 'task_card', taskStatus: 'completed', executionId: 'execution-weibo' },
      ],
    };

    expect(resolveMessageExecutionId(message)).toBe('execution-weibo');
  });
});
