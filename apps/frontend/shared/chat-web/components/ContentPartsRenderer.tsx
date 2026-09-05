import React from 'react';
import { Button } from 'antd';
import {
  EXECUTION_RESULT_TYPE,
  isExecutionResultPayload,
} from '@ops/backend-ai-chat-protocol';
import MessageContentRenderer from './MessageContentRenderer';

type SharedChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'markdown'; markdown: string }
  | { type: 'structured_result'; schemaType: string; data: unknown }
  | { type: 'task_card'; taskStatus: string; executionId: string }
  | { type: 'approval_card'; executionId: string; riskLevel?: string }
  | { type: 'file_ref'; fileId: string; fileName: string; mimeType?: string }
  | { type: 'deeplink'; url: string; label: string };

interface ContentPartsRendererProps {
  parts?: SharedChatContentPart[];
  isStreaming?: boolean;
  renderStructuredResult?: boolean;
  renderDeeplink?: boolean;
  renderFileRef?: boolean;
  textMode?: 'plain' | 'markdown';
}

const toStructuredResultText = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (isExecutionResultPayload(value)) {
    switch (value.type) {
      case EXECUTION_RESULT_TYPE.BROWSER_TASK:
        return value.summary?.trim() || null;
      case EXECUTION_RESULT_TYPE.REPORT:
        return [
          '文件已生成。',
          `- 文件名：${value.fileName}`,
          `- 下载链接：${value.downloadUrl}`,
          ...(value.previewUrl ? [`- 预览链接：${value.previewUrl}`] : []),
        ].join('\n');
      case EXECUTION_RESULT_TYPE.GENERIC:
        if (typeof value.summary === 'string' && value.summary.trim()) {
          return value.summary.trim();
        }
        if (value.data !== undefined) {
          try {
            return JSON.stringify(value.data, null, 2);
          } catch {
            return String(value.data);
          }
        }
        return null;
      default:
        break;
    }
  }
  if (typeof value === 'string') {
    return value.trim() || null;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const ContentPartsRenderer: React.FC<ContentPartsRendererProps> = ({
  parts,
  isStreaming = false,
  renderStructuredResult = true,
  renderDeeplink = true,
  renderFileRef = true,
  textMode = 'markdown',
}) => {
  if (!parts?.length) {
    return null;
  }

  const renderableParts = parts.filter((part) => {
    if (part.type === 'task_card' || part.type === 'approval_card') {
      return false;
    }
    if (part.type === 'structured_result' && !renderStructuredResult) {
      return false;
    }
    if (part.type === 'deeplink' && !renderDeeplink) {
      return false;
    }
    if (part.type === 'file_ref' && !renderFileRef) {
      return false;
    }
    return true;
  });

  if (renderableParts.length === 0) {
    return null;
  }

  return (
    <div className="chat-content-parts">
      {renderableParts.map((part, index) => {
        switch (part.type) {
          case 'text':
            return (
              <MessageContentRenderer
                key={`text-${index}`}
                content={part.text}
                mode={textMode}
                isStreaming={isStreaming && index === renderableParts.length - 1}
              />
            );
          case 'markdown':
            return (
              <MessageContentRenderer
                key={`markdown-${index}`}
                content={part.markdown}
                mode="markdown"
                isStreaming={isStreaming && index === renderableParts.length - 1}
              />
            );
          case 'structured_result': {
            const text = toStructuredResultText(part.data);
            if (!text) {
              return null;
            }
            return (
              <details key={`structured-${index}`} className="chat-outcome-details">
                <summary>查看结构化结果</summary>
                <pre className="chat-structured-result">{text}</pre>
              </details>
            );
          }
          case 'deeplink':
            return (
              <div key={`link-${index}`} className="chat-outcome-actions">
                <Button size="small" type="primary" ghost href={part.url} target="_blank">
                  {part.label}
                </Button>
              </div>
            );
          case 'file_ref':
            return (
              <div key={`file-${index}`} className="chat-message-files">
                <div className="chat-message-file">
                  <span>{part.fileName}</span>
                </div>
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
};

export default ContentPartsRenderer;
