import { useCallback, useMemo, useRef, useState } from 'react';

interface UseChatComposerHistoryProps {
  draft: string;
  onDraftChange: (text: string) => void;
  sentHistory?: string[];
}

export function useChatComposerHistory({
  draft,
  onDraftChange,
  sentHistory = [],
}: UseChatComposerHistoryProps) {
  const [historyIndex, setHistoryIndex] = useState(-1);
  const savedDraftRef = useRef('');
  const isNavigatingHistoryRef = useRef(false);

  const effectiveHistory = useMemo(() => {
    return sentHistory.filter((item) => item && item.trim().length > 0);
  }, [sentHistory]);

  const moveCaretToEnd = useCallback((textarea: HTMLTextAreaElement) => {
    requestAnimationFrame(() => {
      const len = textarea.value.length;
      textarea.setSelectionRange(len, len);
    });
  }, []);

  const resetHistoryIndex = useCallback(() => {
    if (!isNavigatingHistoryRef.current) {
      setHistoryIndex(-1);
    }
    isNavigatingHistoryRef.current = false;
  }, []);

  const handleHistoryKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (
        (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') ||
        e.shiftKey ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey
      ) {
        return;
      }

      const el = e.currentTarget;
      const { selectionStart, value } = el;
      const lines = value.split('\n');

      if (e.key === 'ArrowUp') {
        const firstLineEnd = lines[0]?.length ?? 0;
        if (selectionStart > firstLineEnd) return;

        const nextIndex = historyIndex + 1;
        if (nextIndex >= effectiveHistory.length) return;
        e.preventDefault();
        isNavigatingHistoryRef.current = true;
        if (historyIndex === -1) {
          savedDraftRef.current = draft;
        }
        setHistoryIndex(nextIndex);
        const nextText =
          effectiveHistory[effectiveHistory.length - 1 - nextIndex] ?? '';
        onDraftChange(nextText);
        moveCaretToEnd(el);
      } else if (e.key === 'ArrowDown') {
        if (historyIndex === -1) return;

        const lastLineStart =
          value.length - (lines[lines.length - 1]?.length ?? 0);
        if (selectionStart < lastLineStart) return;

        e.preventDefault();
        isNavigatingHistoryRef.current = true;
        const nextIndex = historyIndex - 1;
        if (nextIndex < 0) {
          setHistoryIndex(-1);
          onDraftChange(savedDraftRef.current);
        } else {
          setHistoryIndex(nextIndex);
          const nextText =
            effectiveHistory[effectiveHistory.length - 1 - nextIndex] ?? '';
          onDraftChange(nextText);
        }
        moveCaretToEnd(el);
      }
    },
    [draft, effectiveHistory, historyIndex, moveCaretToEnd, onDraftChange]
  );

  return {
    historyIndex,
    setHistoryIndex,
    isNavigatingHistoryRef,
    resetHistoryIndex,
    handleHistoryKeyDown,
  };
}
