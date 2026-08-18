import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Typography } from 'antd';
import { JsonPreview } from '@/features/executions/shared/components/JsonPreview';
import { tryParseJsonValue } from '@/features/executions/shared/lib/common';
import { beautifyText } from '@/features/executions/detail/lib/detailView';
import { normalizeTabSeparatedTable } from '@chat-web/lib/tableNormalizer';

const { Text } = Typography;

interface ExecutionPayloadContentProps {
  value: unknown;
  emptyText?: string;
  treatSingleResultFieldAsMarkdown?: boolean;
}

const contentBlockStyle = {
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-color)',
  padding: '16px 20px',
  borderRadius: 12,
  lineHeight: '1.7',
  fontSize: 14,
} as const;

const MARKDOWN_FIELD_KEY = /^(markdown_content|markdown|content|body|summary|result|text|prompt|description|query|input|output|.*(?:Markdown|Content|Body|Summary|Result|Text))$/i;
const MARKDOWN_SYNTAX = /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```|\|.+\|)|\*\*[^*]+\*\*/m;

const shouldRenderFieldAsMarkdown = (key: string, value: string): boolean =>
  MARKDOWN_FIELD_KEY.test(key) || MARKDOWN_SYNTAX.test(value);

const renderMarkdownContent = (text: string) => {
  const normalized = normalizeTabSeparatedTable(beautifyText(text));
  return (
    <div className="chat-message-markdown" style={contentBlockStyle}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: ({ children }: { children?: React.ReactNode }) => (
            <div className="markdown-table-wrapper">
              <table>{children}</table>
            </div>
          ),
          img: ({ src, alt }: { src?: string; alt?: string }) => (
            <img
              src={src}
              alt={alt || ''}
              className="chat-outcome-inline-img"
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ),
        }}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
};

const ExecutionPayloadContent: React.FC<ExecutionPayloadContentProps> = ({
  value,
  emptyText = '暂无内容。',
  treatSingleResultFieldAsMarkdown,
}) => {
  const parsedValue = tryParseJsonValue(value);

  if (parsedValue === undefined || parsedValue === null || parsedValue === '') {
    return <Text type="secondary">{emptyText}</Text>;
  }

  if (typeof parsedValue === 'string') {
    return renderMarkdownContent(parsedValue);
  }

  const resultRecord =
    parsedValue && typeof parsedValue === 'object' && !Array.isArray(parsedValue)
      ? (parsedValue as Record<string, unknown>)
      : undefined;
  const resultText = typeof resultRecord?.result === 'string' ? resultRecord.result : undefined;
  const onlyHasResultField = treatSingleResultFieldAsMarkdown && resultRecord
    ? Object.keys(resultRecord).length === 1 &&
      Object.prototype.hasOwnProperty.call(resultRecord, 'result')
    : false;

  if (resultText && onlyHasResultField) {
    return renderMarkdownContent(resultText);
  }

  const markdownEntries = resultRecord
    ? Object.entries(resultRecord).filter(
        (entry): entry is [string, string] =>
          typeof entry[1] === 'string' &&
          Boolean(entry[1].trim()) &&
          shouldRenderFieldAsMarkdown(entry[0], entry[1])
      )
    : [];

  if (resultRecord && markdownEntries.length > 0) {
    const markdownKeys = new Set(markdownEntries.map(([key]) => key));
    const remainingValue = Object.fromEntries(
      Object.entries(resultRecord).filter(([key]) => !markdownKeys.has(key))
    );
    const showLabels = markdownEntries.length > 1 || Object.keys(remainingValue).length > 0;

    return (
      <div style={{ display: 'grid', gap: 12 }}>
        {markdownEntries.map(([key, text]) => (
          <div key={key}>
            {showLabels ? (
              <Text type="secondary" code style={{ display: 'inline-block', marginBottom: 6 }}>
                {key}
              </Text>
            ) : null}
            {renderMarkdownContent(text)}
          </div>
        ))}
        {Object.keys(remainingValue).length > 0 ? <JsonPreview value={remainingValue} /> : null}
      </div>
    );
  }

  return (
    <JsonPreview value={parsedValue} />
  );
};

export default ExecutionPayloadContent;
