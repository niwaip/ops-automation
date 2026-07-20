import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@ops/user-core';
import {
  normalizeComparableMessageText,
  dedupeThoughtTexts,
  mergeDefinedMetadata,
  areMessagesEquivalent,
} from './messageState';

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
    const current = {
      taskStatus: 'running',
      executionId: '123',
    };
    const patch = {
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
    const current = { taskStatus: 'running' };
    expect(mergeDefinedMetadata(current, undefined)).toBe(current);
    expect(mergeDefinedMetadata(current, { taskStatus: undefined })).toBe(current);
  });
});

describe('areMessagesEquivalent', () => {
  const baseUserMsg: ChatMessage = {
    id: 'u1',
    role: 'user',
    content: 'hello',
    timestamp: '2026-07-20T12:00:00.000Z',
  };

  it('should return false if roles are different', () => {
    const msg2 = { ...baseUserMsg, role: 'assistant' as const };
    expect(areMessagesEquivalent(baseUserMsg, msg2)).toBe(false);
  });

  it('should return false if time difference is greater than 15 seconds', () => {
    const msg2 = {
      ...baseUserMsg,
      timestamp: '2026-07-20T12:00:16.000Z',
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
});
