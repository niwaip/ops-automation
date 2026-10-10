import { describe, expect, it } from 'vitest';
import type { AIModel } from '@ops/user-core';
import {
  resolveModelDisplayInfo,
  resolveSessionChannel,
  formatRelativeTime,
  summarizeSessionTitle,
} from './sessionView';

describe('sessionView', () => {
  describe('resolveModelDisplayInfo', () => {
    const mockModels: AIModel[] = [
      {
        id: 'a03d8fee-a525-4ef4-8ef4-96ff88c05823',
        name: 'qwen36-35b-a3b',
        provider: 'local',
        config: { display_name: 'Qwen 36-35B' },
        status: 'active',
      },
      {
        id: 'b11d8fee-a525-4ef4-8ef4-96ff88c05999',
        name: 'deepseek-r1',
        provider: 'ollama',
        status: 'active',
      },
    ];

    it('returns null for default or missing modelId', () => {
      expect(resolveModelDisplayInfo(undefined, mockModels)).toBeNull();
      expect(resolveModelDisplayInfo(null, mockModels)).toBeNull();
      expect(resolveModelDisplayInfo('', mockModels)).toBeNull();
      expect(resolveModelDisplayInfo('default', mockModels)).toBeNull();
    });

    it('matches availableModels by id and uses display_name', () => {
      const result = resolveModelDisplayInfo('a03d8fee-a525-4ef4-8ef4-96ff88c05823', mockModels);
      expect(result).not.toBeNull();
      expect(result?.name).toBe('Qwen 36-35B');
      expect(result?.provider).toBe('local');
      expect(result?.tooltip).toContain('Qwen 36-35B (local)');
      expect(result?.rawId).toBe('a03d8fee-a525-4ef4-8ef4-96ff88c05823');
    });

    it('matches availableModels by id fallback to name if display_name is not provided', () => {
      const result = resolveModelDisplayInfo('b11d8fee-a525-4ef4-8ef4-96ff88c05999', mockModels);
      expect(result).not.toBeNull();
      expect(result?.name).toBe('deepseek-r1');
      expect(result?.provider).toBe('ollama');
    });

    it('resolves historical model ID d13e0d30-87b9-4e87-b96a-d8b1b3cf78af to qwen36-35b-a3b', () => {
      const result = resolveModelDisplayInfo('d13e0d30-87b9-4e87-b96a-d8b1b3cf78af', []);
      expect(result).not.toBeNull();
      expect(result?.name).toBe('qwen36-35b-a3b');
      expect(result?.provider).toBe('local');
      expect(result?.tooltip).toContain('qwen36-35b-a3b');
    });

    it('falls back to single active model when an unknown UUID is provided', () => {
      const singleModel: AIModel[] = [mockModels[0]];
      const unknownUuid = 'c1234567-89ab-cdef-0123-456789abcdef';
      const result = resolveModelDisplayInfo(unknownUuid, singleModel);
      expect(result).not.toBeNull();
      expect(result?.name).toBe('Qwen 36-35B');
      expect(result?.tooltip).toContain(unknownUuid);
    });

    it('truncates unknown UUIDs when multiple models exist', () => {
      const unknownUuid = 'e1234567-89ab-cdef-0123-456789abcdef';
      const result = resolveModelDisplayInfo(unknownUuid, mockModels);
      expect(result).not.toBeNull();
      expect(result?.name).toBe('模型 e1234567');
      expect(result?.tooltip).toBe(`模型 ID: ${unknownUuid}`);
    });

    it('returns raw string for non-UUID model identifier', () => {
      const result = resolveModelDisplayInfo('gpt-4o', mockModels);
      expect(result).not.toBeNull();
      expect(result?.name).toBe('gpt-4o');
    });
  });

  describe('resolveSessionChannel', () => {
    it('identifies local channel by default', () => {
      const channel = resolveSessionChannel({ id: 's1', status: 'active', createdAt: '', updatedAt: '' });
      expect(channel.key).toBe('local');
      expect(channel.badgeText).toBe('网页');
    });

    it('identifies wechat channel from session prefix or channel property', () => {
      const byId = resolveSessionChannel({ id: 'wechat:user123', status: 'active', createdAt: '', updatedAt: '' });
      expect(byId.key).toBe('wechat');
      expect(byId.badgeText).toBe('微信');

      const byProp = resolveSessionChannel({ id: 's2', channel: 'wechat', status: 'active', createdAt: '', updatedAt: '' });
      expect(byProp.key).toBe('wechat');
    });
  });

  describe('summarizeSessionTitle', () => {
    it('summarizes empty title to 新对话', () => {
      expect(summarizeSessionTitle('')).toBe('新对话');
      expect(summarizeSessionTitle('   ')).toBe('新对话');
    });

    it('slices title to 24 chars', () => {
      expect(summarizeSessionTitle('这是一段非常非常长的用户提问用于测试标题自动截断功能')).toBe(
        '这是一段非常非常长的用户提问用于测试标题自动截断'
      );
    });
  });
});
