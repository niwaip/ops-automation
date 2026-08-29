import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button, Typography } from 'antd';
import { DownOutlined, UpOutlined } from '@ant-design/icons';
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
  'notificationSummary',
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
    // Check nested rec.output, rec.data, rec.result
    if (rec.data !== undefined) {
      const nested = extractDisplayText(rec.data);
      if (nested) return nested;
    }
    if (rec.output !== undefined) {
      const nested = extractDisplayText(rec.output);
      if (nested) return nested;
    }
    if (rec.result !== undefined) {
      const nested = extractDisplayText(rec.result);
      if (nested) return nested;
    }
  }
  return undefined;
};

const MAX_RESULT_COLLAPSED_HEIGHT = 360;
const MAX_RESULT_COLLAPSED_LINES = 15;

const ExpandableMarkdownBody: React.FC<{ text: string }> = ({ text }) => {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const [isOverflow, setIsOverflow] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const normalized = React.useMemo(
    () => normalizeTabSeparatedTable(beautifyText(text)),
    [text]
  );

  React.useEffect(() => {
    if (containerRef.current) {
      const lineCount = (normalized.match(/\n/g) || []).length + 1;
      const exceedsHeight = containerRef.current.scrollHeight > MAX_RESULT_COLLAPSED_HEIGHT + 10;
      const exceedsLines = lineCount > MAX_RESULT_COLLAPSED_LINES;
      setIsOverflow(exceedsHeight || exceedsLines || normalized.length > 500);
    }
  }, [normalized]);

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
      <div
        ref={containerRef}
        className="chat-message-markdown"
        style={{
          maxHeight: !isExpanded && isOverflow ? MAX_RESULT_COLLAPSED_HEIGHT : 'none',
          overflow: 'hidden',
          position: 'relative',
          transition: 'max-height 0.25s ease',
          paddingBottom: !isExpanded && isOverflow ? 44 : 0,
          wordBreak: 'break-word',
          overflowWrap: 'anywhere',
        }}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ children }: { children?: React.ReactNode }) => (
              <p style={{ margin: '4px 0', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                {children}
              </p>
            ),
            ul: ({ children }: { children?: React.ReactNode }) => (
              <ul style={{ paddingLeft: 20, margin: '4px 0', lineHeight: 1.7, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                {children}
              </ul>
            ),
            ol: ({ children }: { children?: React.ReactNode }) => (
              <ol style={{ paddingLeft: 20, margin: '4px 0', lineHeight: 1.7, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                {children}
              </ol>
            ),
            li: ({ children }: { children?: React.ReactNode }) => (
              <li style={{ margin: '2px 0', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                {children}
              </li>
            ),
            a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--ant-color-primary, #1677ff)', wordBreak: 'break-all', overflowWrap: 'anywhere' }}
              >
                {children}
              </a>
            ),
            table: ({ children }: { children?: React.ReactNode }) => (
              <div className="markdown-table-wrapper" style={{ overflowX: 'auto', maxWidth: '100%', margin: '8px 0' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>{children}</table>
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

      {isOverflow && !isExpanded ? (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 64,
            background:
              'linear-gradient(to bottom, rgba(0, 0, 0, 0) 0%, var(--bg-card, #1f293d) 80%)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            paddingBottom: 8,
            borderRadius: '0 0 12px 12px',
            pointerEvents: 'none',
          }}
        >
          <Button
            type="default"
            size="small"
            icon={<DownOutlined />}
            onClick={() => setIsExpanded(true)}
            style={{
              fontWeight: 500,
              fontSize: 12,
              borderRadius: 14,
              padding: '0 16px',
              height: 28,
              background: 'var(--bg-card, #1f293d)',
              borderColor: 'var(--border-color, rgba(255, 255, 255, 0.15))',
              color: 'var(--ant-color-primary, #1677ff)',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.35)',
              pointerEvents: 'auto',
            }}
          >
            展开全文
          </Button>
        </div>
      ) : null}

      {isOverflow && isExpanded ? (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
          <Button
            type="link"
            size="small"
            icon={<UpOutlined />}
            onClick={() => setIsExpanded(false)}
            style={{ fontWeight: 500 }}
          >
            收起内容
          </Button>
        </div>
      ) : null}
    </div>
  );
};

const ExpandablePlainText: React.FC<{ text: string }> = ({ text }) => {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const [isOverflow, setIsOverflow] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (containerRef.current) {
      const lineCount = (text.match(/\n/g) || []).length + 1;
      const exceedsHeight = containerRef.current.scrollHeight > MAX_RESULT_COLLAPSED_HEIGHT + 10;
      const exceedsLines = lineCount > MAX_RESULT_COLLAPSED_LINES;
      setIsOverflow(exceedsHeight || exceedsLines || text.length > 500);
    }
  }, [text]);

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
      <div
        ref={containerRef}
        style={{
          maxHeight: !isExpanded && isOverflow ? MAX_RESULT_COLLAPSED_HEIGHT : 'none',
          overflow: 'hidden',
          position: 'relative',
          transition: 'max-height 0.25s ease',
          paddingBottom: !isExpanded && isOverflow ? 44 : 0,
          wordBreak: 'break-word',
          overflowWrap: 'anywhere',
        }}
      >
        <Text style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{text}</Text>
      </div>

      {isOverflow && !isExpanded ? (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 64,
            background:
              'linear-gradient(to bottom, rgba(0, 0, 0, 0) 0%, var(--bg-card, #1f293d) 80%)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            paddingBottom: 8,
            borderRadius: '0 0 12px 12px',
            pointerEvents: 'none',
          }}
        >
          <Button
            type="default"
            size="small"
            icon={<DownOutlined />}
            onClick={() => setIsExpanded(true)}
            style={{
              fontWeight: 500,
              fontSize: 12,
              borderRadius: 14,
              padding: '0 16px',
              height: 28,
              background: 'var(--bg-card, #1f293d)',
              borderColor: 'var(--border-color, rgba(255, 255, 255, 0.15))',
              color: 'var(--ant-color-primary, #1677ff)',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.35)',
              pointerEvents: 'auto',
            }}
          >
            展开全文
          </Button>
        </div>
      ) : null}

      {isOverflow && isExpanded ? (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
          <Button
            type="link"
            size="small"
            icon={<UpOutlined />}
            onClick={() => setIsExpanded(false)}
            style={{ fontWeight: 500 }}
          >
            收起内容
          </Button>
        </div>
      ) : null}
    </div>
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
            <ExpandableMarkdownBody text={displayText} />
          ) : (
            <ExpandablePlainText text={displayText} />
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
