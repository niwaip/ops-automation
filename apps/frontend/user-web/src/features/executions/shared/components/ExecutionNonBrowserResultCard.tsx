import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button, Space, Typography } from 'antd';
import { DownOutlined, DownloadOutlined, EyeOutlined, UpOutlined } from '@ant-design/icons';
import { JsonPreview } from '@/features/executions/shared/components/JsonPreview';
import { tryParseJsonValue } from '@/features/executions/shared/lib/common';
import { beautifyText } from '@/features/executions/detail/lib/detailView';
import { formatStructuredDataToMarkdown, normalizeTabSeparatedTable } from '@chat-web/lib/tableNormalizer';
import { HtmlPreviewBlock } from '@chat-web/components/HtmlPreviewBlock';
import { replaceLocalhostWithCurrentHost } from '@/shared/utils/publicUrl';

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

const LEGAL_ARTICLE_HEADER_REGEX =
  /^\s*(?:第\s*[一二三四五六七八九十百千万\d]+\s*条|(?:ARTICLE|CLAUSE)\s+(?:[IVXLCDM\d]+|\d+)\b|[一二三四五六七八九十百]+[、\s]+|(?:\d+[\.、\s]+[^\d\s]))/i;

const LEGAL_CHAPTER_HEADER_REGEX =
  /^\s*(?:第\s*[一二三四五六七八九十百千万\d]+\s*[编章节篇部]|(?:CHAPTER|PART|TITLE|SECTION)\s+(?:[IVXLCDM\d]+|[A-Z]|\d+)\b)/i;

/**
 * Detect plain text legal documents with chapter or article structures and promote them
 * to clean hierarchical markdown headers so they render as distinct structured sections.
 */
export function autoFormatLegalMarkdown(text: string): string {
  if (!text || text.includes('# ') || text.includes('## ')) {
    return text;
  }

  const lines = text.split(/\r?\n/);
  let hasLegalStructure = false;

  const processed = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return '';

    if (
      LEGAL_CHAPTER_HEADER_REGEX.test(trimmed) &&
      trimmed.length < 50 &&
      !/[。！？；]$/.test(trimmed)
    ) {
      hasLegalStructure = true;
      return `\n## ${trimmed}\n`;
    }

    if (
      LEGAL_ARTICLE_HEADER_REGEX.test(trimmed) &&
      trimmed.length < 60 &&
      !/[。！？；]$/.test(trimmed)
    ) {
      hasLegalStructure = true;
      return `\n### ${trimmed}\n`;
    }

    if (/^[甲乙丙丁]方\s*[:：]/.test(trimmed) && trimmed.length < 60) {
      return `**${trimmed}**`;
    }

    return line;
  });

  return hasLegalStructure ? processed.join('\n') : text;
}

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

  const hasHtmlArtifact = React.useMemo(
    () => /```html[\s\S]*?(?:<!DOCTYPE html|<html|diff-ins|diff-del)/i.test(normalized),
    [normalized]
  );

  React.useEffect(() => {
    if (containerRef.current) {
      if (hasHtmlArtifact) {
        setIsOverflow(false);
        return;
      }
      const lineCount = (normalized.match(/\n/g) || []).length + 1;
      const exceedsHeight = containerRef.current.scrollHeight > MAX_RESULT_COLLAPSED_HEIGHT + 10;
      const exceedsLines = lineCount > MAX_RESULT_COLLAPSED_LINES;
      setIsOverflow(exceedsHeight || exceedsLines || normalized.length > 500);
    }
  }, [normalized, hasHtmlArtifact]);

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
      <div
        ref={containerRef}
        className="chat-message-markdown"
        style={{
          maxHeight: !isExpanded && isOverflow && !hasHtmlArtifact ? MAX_RESULT_COLLAPSED_HEIGHT : 'none',
          overflow: 'hidden',
          position: 'relative',
          transition: 'max-height 0.25s ease',
          paddingBottom: !isExpanded && isOverflow && !hasHtmlArtifact ? 44 : 0,
          wordBreak: 'break-word',
          overflowWrap: 'anywhere',
        }}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }: { children?: React.ReactNode }) => (
              <h1 style={{ fontSize: 17, fontWeight: 700, margin: '14px 0 8px', borderBottom: '1px solid var(--border-color, #e2e8f0)', paddingBottom: 4 }}>
                {children}
              </h1>
            ),
            h2: ({ children }: { children?: React.ReactNode }) => (
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: '12px 0 6px', color: 'var(--ant-color-primary, #1677ff)' }}>
                {children}
              </h2>
            ),
            h3: ({ children }: { children?: React.ReactNode }) => (
              <h3 style={{ fontSize: 14, fontWeight: 600, margin: '10px 0 4px', color: 'var(--text-primary, #243041)' }}>
                {children}
              </h3>
            ),
            h4: ({ children }: { children?: React.ReactNode }) => (
              <h4 style={{ fontSize: 13, fontWeight: 600, margin: '8px 0 3px' }}>
                {children}
              </h4>
            ),
            hr: () => (
              <hr style={{ border: 'none', borderTop: '1px solid var(--border-color, #e2e8f0)', margin: '12px 0' }} />
            ),
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
            code: ({
              className,
              children,
              ...props
            }: React.ComponentPropsWithoutRef<'code'> & { className?: string }) => {
              const match = /language-(\w+)/.exec(className || '');
              const codeText = String(children || '');
              if (
                match &&
                match[1] === 'html' &&
                (codeText.includes('<!DOCTYPE html') ||
                  codeText.includes('<html') ||
                  codeText.includes('class="slide') ||
                  codeText.includes('presentation') ||
                  codeText.includes('guizang') ||
                  codeText.includes('diff-ins') ||
                  codeText.includes('diff-del'))
              ) {
                return <HtmlPreviewBlock code={codeText.trim()} className={className} />;
              }

              return match ? (
                <pre className={`code-block language-${match[1]}`}>
                  <code {...props}>{children}</code>
                </pre>
              ) : (
                <code className="inline-code" {...props}>
                  {children}
                </code>
              );
            },
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
    downloadUrl?: string;
    temporalLink?: string;
  };
  primaryResultText?: string;
  shouldRenderPrimaryAsMarkdown?: boolean;
  shouldShowStructuredResult?: boolean;
  resultPreviewValue?: unknown;
  effectiveResultJson?: unknown;
  labels: ExecutionNonBrowserResultCardLabels;
}

interface ExtractedArtifact {
  id?: string;
  name?: string;
  label?: string;
  url?: string;
  downloadUrl?: string;
  mimeType?: string;
  artifactType?: string;
}

const collectArtifactsFromSources = (
  normalizedResult?: ExecutionNonBrowserResultCardProps['normalizedResult'],
  parsedData?: unknown
): ExtractedArtifact[] => {
  const result: ExtractedArtifact[] = [];
  const seenUrls = new Set<string>();

  const addArtifact = (item: unknown) => {
    if (!item || typeof item !== 'object') return;
    const rec = item as Record<string, unknown>;
    const url = typeof rec.url === 'string' ? rec.url : undefined;
    const downloadUrl =
      typeof rec.downloadUrl === 'string'
        ? rec.downloadUrl
        : typeof rec.download_url === 'string'
        ? rec.download_url
        : undefined;
    const primaryUrl = downloadUrl || url;
    if (!primaryUrl || seenUrls.has(primaryUrl)) return;
    seenUrls.add(primaryUrl);

    const name =
      typeof rec.name === 'string'
        ? rec.name
        : typeof rec.label === 'string'
        ? rec.label
        : typeof rec.fileName === 'string'
        ? rec.fileName
        : undefined;

    result.push({
      id: typeof rec.id === 'string' ? rec.id : undefined,
      name,
      label: typeof rec.label === 'string' ? rec.label : name,
      url,
      downloadUrl,
      mimeType: typeof rec.mimeType === 'string' ? rec.mimeType : undefined,
      artifactType: typeof rec.artifactType === 'string' ? rec.artifactType : undefined,
    });
  };

  if (Array.isArray(normalizedResult?.artifacts)) {
    normalizedResult.artifacts.forEach(addArtifact);
  }
  if (normalizedResult?.downloadUrl) {
    addArtifact({ downloadUrl: normalizedResult.downloadUrl, name: '结果文件' });
  }

  if (parsedData && typeof parsedData === 'object') {
    const rec = parsedData as Record<string, unknown>;
    if (Array.isArray(rec.artifacts)) {
      rec.artifacts.forEach(addArtifact);
    }
    if (rec.artifact && typeof rec.artifact === 'object') {
      addArtifact(rec.artifact);
    }
    if (rec.finalOutputs && typeof rec.finalOutputs === 'object') {
      const fo = rec.finalOutputs as Record<string, unknown>;
      if (Array.isArray(fo.artifacts)) fo.artifacts.forEach(addArtifact);
      if (fo.artifact && typeof fo.artifact === 'object') addArtifact(fo.artifact);
      if (typeof fo.downloadUrl === 'string' || typeof fo.url === 'string') addArtifact(fo);
    }
    if (rec.result && typeof rec.result === 'object') {
      const res = rec.result as Record<string, unknown>;
      if (Array.isArray(res.artifacts)) res.artifacts.forEach(addArtifact);
      if (res.artifact && typeof res.artifact === 'object') addArtifact(res.artifact);
      if (typeof res.downloadUrl === 'string' || typeof res.url === 'string') addArtifact(res);
    }
  }

  return result;
};

const renderArtifactActions = (artifacts: ExtractedArtifact[]) => {
  if (!artifacts.length) return null;
  return (
    <div
      style={{
        marginTop: 14,
        paddingTop: 12,
        borderTop: '1px solid var(--border-color, rgba(0, 0, 0, 0.08))',
      }}
    >
      <Space wrap size={[10, 10]}>
        {artifacts.map((art, idx) => {
          const rawUrl = art.downloadUrl || art.url;
          const targetUrl = replaceLocalhostWithCurrentHost(rawUrl) || rawUrl;
          if (!targetUrl) return null;
          const displayName = art.name || art.label || `生成文档 ${idx + 1}`;
          const isHtml =
            displayName.endsWith('.html') || (art.mimeType && art.mimeType.includes('html'));
          return (
            <Space key={art.id || idx} size={8}>
              <Button
                type="primary"
                size="small"
                icon={<DownloadOutlined />}
                onClick={() => window.open(targetUrl, '_blank')}
                style={{ borderRadius: 6 }}
              >
                {`下载 ${displayName}`}
              </Button>
              {isHtml && (
                <Button
                  size="small"
                  icon={<EyeOutlined />}
                  onClick={() => window.open(targetUrl, '_blank')}
                  style={{ borderRadius: 6 }}
                >
                  在线预览报告
                </Button>
              )}
            </Space>
          );
        })}
      </Space>
    </div>
  );
};

const ExecutionNonBrowserResultCard: React.FC<ExecutionNonBrowserResultCardProps> = ({
  normalizedResult,
  primaryResultText,
  effectiveResultJson,
  labels,
}) => {
  const parsedData = tryParseJsonValue(effectiveResultJson);
  const artifacts = collectArtifactsFromSources(normalizedResult, parsedData);
  const rawDisplayText =
    primaryResultText ||
    extractDisplayText(parsedData) ||
    formatStructuredDataToMarkdown(parsedData);
  const displayText = rawDisplayText ? autoFormatLegalMarkdown(rawDisplayText) : undefined;
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
          {renderArtifactActions(artifacts)}
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
            {renderArtifactActions(artifacts)}
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
            <pre
              style={{
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontSize: 13,
              }}
            >
              {jsonString}
            </pre>
          )}
          {renderArtifactActions(artifacts)}
        </div>
      </div>
    );
  }

  return <Text type="secondary">{labels.noResultOutput}</Text>;
};

export default ExecutionNonBrowserResultCard;
