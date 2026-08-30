export interface ChatComposerEnterEvent {
  shiftKey: boolean;
  nativeEvent?: {
    isComposing?: boolean;
    keyCode?: number;
  };
}

/**
 * Enter must not submit while an IME is committing text. Some browsers emit
 * the final input event after keydown; submitting during that window clears
 * the controlled value first and then writes the last composition fragment
 * back into the textarea.
 */
export const shouldSubmitChatComposerOnEnter = (
  event: ChatComposerEnterEvent,
  compositionActive: boolean
): boolean =>
  !event.shiftKey &&
  !compositionActive &&
  event.nativeEvent?.isComposing !== true &&
  event.nativeEvent?.keyCode !== 229;
