import type { ChatMessage } from '@ops/user-core';

/** Evict only unmodified server histories; local drafts and streams are never evicted. */
export function pruneChatHistories(
  histories: Record<string, ChatMessage[]>,
  selectedId: string | null,
  syncedIds: ReadonlySet<string>,
  maxCached = 3
): Record<string, ChatMessage[]> {
  const candidates = Object.keys(histories).filter(
    (id) => id !== selectedId && syncedIds.has(id) && !histories[id].some((m) => m.isStreaming)
  );
  const keepInactive = Math.max(0, maxCached - 1);
  if (candidates.length <= keepInactive) return histories;
  const next = { ...histories };
  candidates.slice(0, candidates.length - keepInactive).forEach((id) => delete next[id]);
  return next;
}
