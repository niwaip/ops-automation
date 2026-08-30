import { describe, expect, it } from 'vitest';
import { shouldSubmitChatComposerOnEnter } from './chatComposerKeyboard';

describe('shouldSubmitChatComposerOnEnter', () => {
  it('submits a regular Enter press', () => {
    expect(
      shouldSubmitChatComposerOnEnter({ shiftKey: false, nativeEvent: {} }, false)
    ).toBe(true);
  });

  it('does not submit Shift+Enter', () => {
    expect(
      shouldSubmitChatComposerOnEnter({ shiftKey: true, nativeEvent: {} }, false)
    ).toBe(false);
  });

  it.each([
    [{ shiftKey: false, nativeEvent: { isComposing: true } }, false],
    [{ shiftKey: false, nativeEvent: { keyCode: 229 } }, false],
    [{ shiftKey: false, nativeEvent: {} }, true],
  ])('does not submit while IME composition is active', (event, compositionActive) => {
    expect(shouldSubmitChatComposerOnEnter(event, compositionActive)).toBe(false);
  });
});
