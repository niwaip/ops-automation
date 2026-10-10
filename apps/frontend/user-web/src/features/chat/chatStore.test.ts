/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { useChatStore, STORAGE_KEY_CHAT_FONT_SIZE, CHAT_FONT_SIZE_OPTIONS } from './chatStore';

describe('useChatStore - fontSize preferences', () => {
  const storageMap: Record<string, string> = {};

  beforeEach(() => {
    for (const key of Object.keys(storageMap)) {
      delete storageMap[key];
    }
    const mockStorage = {
      getItem: (key: string) => storageMap[key] || null,
      setItem: (key: string, value: string) => {
        storageMap[key] = value;
      },
      removeItem: (key: string) => {
        delete storageMap[key];
      },
      clear: () => {
        for (const key of Object.keys(storageMap)) {
          delete storageMap[key];
        }
      },
    };
    vi.stubGlobal('localStorage', mockStorage);
    if (typeof document !== 'undefined') {
      document.documentElement.removeAttribute('data-chat-font-size');
    }
  });

  it('provides all 4 predefined font size options', () => {
    expect(CHAT_FONT_SIZE_OPTIONS).toHaveLength(4);
    const keys = CHAT_FONT_SIZE_OPTIONS.map((o) => o.key);
    expect(keys).toContain('compact');
    expect(keys).toContain('comfortable');
    expect(keys).toContain('spacious');
    expect(keys).toContain('extra-large');
  });

  it('defaults to comfortable font size and applies to DOM', () => {
    const state = useChatStore.getState();
    expect(state.fontSize).toBe('comfortable');
  });

  it('updates font size, persists to localStorage and sets document attribute', () => {
    const { setFontSize } = useChatStore.getState();

    setFontSize('spacious');
    expect(useChatStore.getState().fontSize).toBe('spacious');
    expect(storageMap[STORAGE_KEY_CHAT_FONT_SIZE]).toBe('spacious');
    expect(document.documentElement.getAttribute('data-chat-font-size')).toBe('spacious');

    setFontSize('extra-large');
    expect(useChatStore.getState().fontSize).toBe('extra-large');
    expect(storageMap[STORAGE_KEY_CHAT_FONT_SIZE]).toBe('extra-large');
    expect(document.documentElement.getAttribute('data-chat-font-size')).toBe('extra-large');

    // Restore to comfortable
    setFontSize('comfortable');
    expect(useChatStore.getState().fontSize).toBe('comfortable');
    expect(document.documentElement.getAttribute('data-chat-font-size')).toBe('comfortable');
  });
});
