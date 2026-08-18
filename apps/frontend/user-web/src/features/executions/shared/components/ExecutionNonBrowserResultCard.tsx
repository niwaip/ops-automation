import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Typography } from 'antd';
import { JsonPreview } from '@/features/executions/shared/components/JsonPreview';
import { tryParseJsonValue } from '@/features/executions/shared/lib/common';
import { beautifyText } from '@/features/executions/detail/lib/detailView';
import { formatStructuredDataToMarkdown, normalizeTabSeparatedTable } from '@chat-web/lib/tableNormalizer';

const { Text } = Typography;

/** Fields tried in order to extract a human-readable result text from raw JSON */
const TEXT_FIELD_CANDIDATES = [
  'detailText',
  'formatted_output',
  'finalAnswer',
  'chatSummary',
  'summary',
  'result',
  'text',
  'content',
  'message',
  'body',
  'output',
] as const;

const MARKDOWN_SYNTAX = /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```|\|.+\|)|\*\*[^*]+\*\*/m;

const extractDisplayText = (value: unknown): string | undefined => {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const rec = value as Record<string, unknown>;
    for (const field of TEXT_FIELD_CANDIDATES) {
      if (typeof rec[field] === 'string' && (rec[field] as string).trim()) {
        return (rec[field] as string).trim();
      }
    }
  }
  return undefined;
};

const MarkdownBody: React.FC<{ text: string }> = ({ text }) => {
  const normalized = normalizeTabSeparatedTable(beautifyText(text));
  return (
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
  );
};

interface ExecutionNonBrowserResultCardLabels {
  title: string;
  input: string;
  result: string;
  resultArtifacts: string;
  sourceLinks: string;
  temporalExecutionLink: string;
  noInput: string;
  noStructuredResult: string;
  noResultOutput: string;
}

interface ExecutionNonBrowserResultCardProps {
  executionInput?: unknown;
  normalizedResult?: {
    hasBusinessResult?: boolean;
    title?: string;
    resultType?: string;
    artifacts?: unknown[];
    temporalLink?: string;
  };
  primaryResultText?: string;
  shouldRenderPrimaryAsMarkdown?: boolean;
  shouldShowStructuredResult?: boolean;
  resultPreviewValue?: unknown;
  effectiveResultJson?: unknown;
  labels: ExecutionNonBrowserResultCardLabels;
}

const ExecutionNonBrowserResultCard: React.FC<ExecutionNonBrowserResultCardProps> = ({
  primaryResultText,
  effectiveResultJson,
  labels,
}) => {
  const parsedData = tryParseJsonValue(effectiveResultJson);
  // 1. primaryResultText wins, then extractDisplayText, then auto-formatting structured data
  const displayText =
    primaryResultText ||
    extractDisplayText(parsedData) ||
    formatStructuredDataToMarkdown(parsedData);
  const hasMarkdown = displayText ? MARKDOWN_SYNTAX.test(displayText) : false;

  if (displayText) {
    return (
      <div className="chat-outcome-card success">
        <div className="chat-outcome-header">
          <div className="chat-outcome-title">任务结果</div>
        </div>
        <div className="chat-outcome-body">
          {hasMarkdown ? (
            <MarkdownBody text={displayText} />
          ) : (
            <Text style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{displayText}</Text>
          )}
        </div>
      </div>
    );
  }

  // 2. No extractable text — render the raw JSON prettily in the same card style
  const parsedFallback = tryParseJsonValue(effectiveResultJson);
  if (parsedFallback !== undefined && parsedFallback !== null && parsedFallback !== '') {
    // If fallback is purely finalOutputs/artifact payload, do not print raw JSON dump
    const hasFinalOutputs =
      typeof parsedFallback === 'object' &&
      parsedFallback !== null &&
      ('finalOutputs' in (parsedFallback as Record<string, unknown>) ||
        'artifact' in (parsedFallback as Record<string, unknown>));

    if (hasFinalOutputs) {
      return (
        <div className="chat-outcome-card success">
          <div className="chat-outcome-header">
            <div className="chat-outcome-title">任务结果</div>
          </div>
          <div className="chat-outcome-body">
            <Text style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
              任务已成功完成，已为您生成结果文档。您可以直接点击下方按钮进行查看与下载。
            </Text>
          </div>
        </div>
      );
    }

    // Try to render as formatted JSON inside the styled card
    const jsonString =
      typeof parsedFallback === 'string'
        ? parsedFallback
        : JSON.stringify(parsedFallback, null, 2);
    return (
      <div className="chat-outcome-card success">
        <div className="chat-outcome-header">
          <div className="chat-outcome-title">任务结果</div>
        </div>
        <div className="chat-outcome-body">
          {typeof parsedFallback === 'object' ? (
            <JsonPreview value={parsedFallback} />
          ) : (
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13 }}>
              {jsonString}
            </pre>
          )}
        </div>
      </div>
    );
  }

  return <Text type="secondary">{labels.noResultOutput}</Text>;
};

export default ExecutionNonBrowserResultCard;
