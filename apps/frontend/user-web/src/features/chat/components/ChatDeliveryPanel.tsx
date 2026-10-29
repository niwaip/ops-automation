import { memo } from 'react';
import type { ChatMessage } from '@ops/user-core';
import { appendAuthToken, safeUrlTransform } from '@chat-web/components/MessageContentRenderer';

/** Progress and files live outside the Markdown subtree so they cannot rewrite it. */
export const ChatDeliveryPanel = memo(function ChatDeliveryPanel({ message }: { message: ChatMessage }) {
  if (message.role !== 'assistant' || message.metadata?.mode !== 'chat') return null;
  const progress = message.metadata?.progressLogs?.at(-1)?.text;
  const artifacts = message.metadata?.artifacts || [];
  if (message.isStreaming) {
    if (!progress) return null;
    // Suppress drafts left in progress logs by older clients during hot updates.
    const visibleProgress = progress.startsWith('正在生成（待校验）\n')
      ? '正在整理回答，等待校验…' : progress;
    return <div role="status" aria-live="polite" style={{ color: '#667085', fontSize: 13, margin: '8px 0' }}>{visibleProgress}</div>;
  }
  if (!artifacts.length) return null;
  return <section aria-label="生成文件" style={{ marginTop: 16, display: 'grid', gap: 8 }}>
    {artifacts.map((artifact) => {
      const url = safeUrlTransform(artifact.downloadUrl || artifact.url);
      if (!url) return null;
      return <a key={url} href={appendAuthToken(url)} target="_blank" rel="noopener noreferrer"
        style={{ display: 'block', border: '1px solid var(--border-color, #e4e7ec)', borderRadius: 8, padding: '10px 14px' }}>
        📥 {artifact.name || artifact.label || '下载文件'}
      </a>;
    })}
  </section>;
});
