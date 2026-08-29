import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button, Collapse, Descriptions, Tag, Typography } from 'antd';
import { DownOutlined, UpOutlined } from '@ant-design/icons';
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
  width: '100%',
  maxWidth: '100%',
  boxSizing: 'border-box',
  wordBreak: 'break-word',
  overflowWrap: 'anywhere',
} as const;

const MARKDOWN_FIELD_KEY =
  /^(markdown_content|markdown|content|body|summary|result|text|prompt|description|query|input|output|.*(?:Markdown|Content|Body|Summary|Result|Text))$/i;
const MARKDOWN_SYNTAX = /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```|\|.+\|)|\*\*[^*]+\*\*/m;

const INTERNAL_NOISE_KEYS = new Set([
  'trace',
  'backend',
  'variables',
  'stepResults',
  'browserRunOutput',
  'runtimeEvidence',
  'executionPlanVersion',
  'runtimeSessionId',
  'requiresTakeover',
  'capabilityId',
  'publishedSkillId',
  'capabilityVersion',
  'releaseId',
  'runtime',
  'stepId',
  'snapshot',
  'rawResult',
  'action',
  'status',
  'failedStepId',
  'failedAction',
  'takeoverReason',
  'success',
  'artifacts',
  'degradedMode',
  'degradeReason',
  'pageFingerprint',
  'readiness',
  'phaseVariables',
  'contentCandidate',
  'contentQuality',
  'errorCode',
  'errorMessage',
  'retryable',
  'skillDraftId',
  'exportArtifactId',
  'recorderSessionId',
  'runtimeExecutionId',
  'previousResultRef',
  'previousResultData',
  'upstreamResult',
  'upstreamContext',
  'orchestrationContext',
  'workflowContext',
  'parentExecutionId',
  'sourceExecutionId',
]);

const shouldRenderFieldAsMarkdown = (key: string, value: string): boolean =>
  MARKDOWN_FIELD_KEY.test(key) || MARKDOWN_SYNTAX.test(value);

export const ExpandableMarkdownContent: React.FC<{
  text: string;
  maxCollapsedHeight?: number;
  maxCollapsedLines?: number;
}> = ({ text, maxCollapsedHeight = 240, maxCollapsedLines = 6 }) => {
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
      const isContentLong =
        containerRef.current.scrollHeight > maxCollapsedHeight + 10 ||
        lineCount > maxCollapsedLines ||
        normalized.length > 200;
      setIsOverflow(isContentLong);
    }
  }, [normalized, maxCollapsedHeight, maxCollapsedLines]);

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
      <div
        ref={containerRef}
        className="chat-message-markdown"
        style={{
          ...contentBlockStyle,
          maxHeight: !isExpanded && isOverflow ? maxCollapsedHeight : 'none',
          overflow: 'hidden',
          position: 'relative',
          transition: 'max-height 0.25s ease',
          paddingBottom: !isExpanded && isOverflow ? 44 : 16,
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
              'linear-gradient(to bottom, rgba(0, 0, 0, 0) 0%, var(--bg-secondary, #1f293d) 80%)',
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
              background: 'var(--bg-secondary, #1f293d)',
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

const isArticleItem = (item: unknown): item is Record<string, unknown> =>
  Boolean(
    item &&
      typeof item === 'object' &&
      !Array.isArray(item) &&
      ('title' in item || 'summary' in item || 'content' in item || 'link' in item || 'url' in item)
  );

const ArticleList: React.FC<{ articles: Array<Record<string, unknown>> }> = ({ articles }) => {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const shouldLimit = articles.length > 5;
  const displayArticles = shouldLimit && !isExpanded ? articles.slice(0, 5) : articles;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {displayArticles.map((item, index) => {
        const title = (item.title || item.name || item.header || `条目 ${index + 1}`) as string;
        const link = (item.link || item.url || item.href) as string | undefined;
        const info = (item.info || item.hotness || item.heat || item.source || item.category || item.tag) as
          | string
          | undefined;
        const summary = (item.summary || item.content || item.desc || item.description || item.text || item.body) as
          | string
          | undefined;

        return (
          <div
            key={index}
            style={{
              padding: '12px 16px',
              borderRadius: 8,
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 8,
                marginBottom: summary ? 6 : 0,
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 14 }}>
                <span style={{ color: 'var(--text-secondary)', marginRight: 6 }}>{`${index + 1}.`}</span>
                {link ? (
                  <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--ant-color-primary, #1677ff)' }}
                  >
                    {title}
                  </a>
                ) : (
                  <span>{title}</span>
                )}
              </div>
              {info ? <Tag color="blue">{info}</Tag> : null}
            </div>
            {summary ? (
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                {summary}
              </div>
            ) : null}
          </div>
        );
      })}

      {shouldLimit ? (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
          <Button
            type="link"
            size="small"
            icon={isExpanded ? <UpOutlined /> : <DownOutlined />}
            onClick={() => setIsExpanded(!isExpanded)}
            style={{ fontWeight: 500 }}
          >
            {isExpanded ? '收起文章列表' : `展开全部（共 ${articles.length} 条）`}
          </Button>
        </div>
      ) : null}
    </div>
  );
};

const isSimpleKeyValueObject = (rec: Record<string, unknown>): boolean => {
  const entries = Object.entries(rec);
  if (entries.length === 0) return false;
  return entries.every(
    ([, v]) =>
      v === null ||
      v === undefined ||
      typeof v === 'string' ||
      typeof v === 'number' ||
      typeof v === 'boolean'
  );
};

const renderSimpleKeyValueObject = (rec: Record<string, unknown>) => {
  const entries = Object.entries(rec);
  if (entries.length === 0) return null;

  return (
    <div
      style={{
        padding: '12px 16px',
        borderRadius: 8,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
      }}
    >
      <Descriptions size="small" column={{ xs: 1, sm: 1, md: 2 }}>
        {entries.map(([key, val]) => {
          const strVal = String(val ?? '-');
          const isUrl = typeof val === 'string' && (val.startsWith('http://') || val.startsWith('https://'));

          return (
            <Descriptions.Item
              key={key}
              label={<Text strong style={{ color: 'var(--text-primary)' }}>{key}</Text>}
            >
              {isUrl ? (
                <a
                  href={val as string}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--ant-color-primary, #1677ff)', wordBreak: 'break-all' }}
                >
                  {val as string}
                </a>
              ) : typeof val === 'boolean' ? (
                <Tag color={val ? 'green' : 'default'}>{val ? 'true' : 'false'}</Tag>
              ) : (
                <Text style={{ wordBreak: 'break-all' }}>{strVal}</Text>
              )}
            </Descriptions.Item>
          );
        })}
      </Descriptions>
    </div>
  );
};

const findDeepContent = (
  obj: unknown
): {
  articles?: Array<Record<string, unknown>>;
  text?: string;
} => {
  if (!obj || typeof obj !== 'object') return {};
  const rec = obj as Record<string, unknown>;

  // 1. Direct articles/items
  if (Array.isArray(rec.articles) && rec.articles.length > 0 && rec.articles.every(isArticleItem)) {
    return { articles: rec.articles as Array<Record<string, unknown>> };
  }
  if (Array.isArray(rec.items) && rec.items.length > 0 && rec.items.every(isArticleItem)) {
    return { articles: rec.items as Array<Record<string, unknown>> };
  }

  // 2. Direct data
  if (rec.data && typeof rec.data === 'object') {
    const fromData = findDeepContent(rec.data);
    if (fromData.articles || fromData.text) return fromData;
  }

  // 3. Direct output
  if (rec.output && typeof rec.output === 'object') {
    const fromOutput = findDeepContent(rec.output);
    if (fromOutput.articles || fromOutput.text) return fromOutput;
  }

  // 4. Inside stepResults array (scan all steps from end to start)
  if (Array.isArray(rec.stepResults) && rec.stepResults.length > 0) {
    for (let i = rec.stepResults.length - 1; i >= 0; i--) {
      const step = rec.stepResults[i];
      if (step && typeof step === 'object') {
        const fromStep = findDeepContent((step as Record<string, unknown>).output || step);
        if (fromStep.articles || fromStep.text) return fromStep;
      }
    }
  }

  // 5. Direct text/summary/content
  for (const k of ['text', 'summary', 'content', 'markdown', 'notificationSummary']) {
    if (typeof rec[k] === 'string' && (rec[k] as string).trim()) {
      return { text: (rec[k] as string).trim() };
    }
  }

  return {};
};

const unwrapPayload = (raw: unknown): unknown => {
  let current = raw;
  for (let i = 0; i < 4; i++) {
    if (current && typeof current === 'object' && !Array.isArray(current)) {
      const rec = current as Record<string, unknown>;
      const keys = Object.keys(rec);
      if (keys.length === 1 && (keys[0] === 'output' || keys[0] === 'data') && rec[keys[0]] !== null && rec[keys[0]] !== undefined) {
        current = rec[keys[0]];
      } else if (keys.length === 1 && keys[0] === 'result' && rec.result !== null && typeof rec.result !== 'string') {
        current = rec.result;
      } else {
        break;
      }
    } else {
      break;
    }
  }
  return current;
};

const ExecutionPayloadContent: React.FC<ExecutionPayloadContentProps> = ({
  value,
  emptyText = '暂无内容。',
  treatSingleResultFieldAsMarkdown,
}) => {
  const parsedRaw = tryParseJsonValue(value);
  const parsedValue = unwrapPayload(parsedRaw);

  if (parsedValue === undefined || parsedValue === null || parsedValue === '') {
    return <Text type="secondary">{emptyText}</Text>;
  }

  if (typeof parsedValue === 'string') {
    return <ExpandableMarkdownContent text={parsedValue} />;
  }

  if (Array.isArray(parsedValue)) {
    if (parsedValue.length > 0 && parsedValue.every(isArticleItem)) {
      return <ArticleList articles={parsedValue} />;
    }
    return <JsonPreview value={parsedValue} />;
  }

  const resultRecord =
    parsedValue && typeof parsedValue === 'object'
      ? (parsedValue as Record<string, unknown>)
      : undefined;

  if (!resultRecord) {
    return <JsonPreview value={parsedValue} />;
  }

  // 1. Check if it's a single result field
  const resultText = typeof resultRecord.result === 'string' ? resultRecord.result : undefined;
  const onlyHasResultField =
    treatSingleResultFieldAsMarkdown &&
    Object.keys(resultRecord).length === 1 &&
    Object.prototype.hasOwnProperty.call(resultRecord, 'result');

  if (resultText && onlyHasResultField) {
    return <ExpandableMarkdownContent text={resultText} />;
  }

  // 2. Check for deep extracted content (articles / text in stepResults or data.text)
  const deepContent = findDeepContent(resultRecord);

  // 3. Separate business entries and technical noise entries
  const businessEntries: Array<[string, unknown]> = [];
  const technicalEntries: Array<[string, unknown]> = [];

  Object.entries(resultRecord).forEach(([key, val]) => {
    if (key === 'articles' || key === 'items') {
      return;
    }
    if (INTERNAL_NOISE_KEYS.has(key)) {
      technicalEntries.push([key, val]);
    } else {
      businessEntries.push([key, val]);
    }
  });

  const markdownEntries = businessEntries.filter(
    (entry): entry is [string, string] =>
      typeof entry[1] === 'string' &&
      Boolean(entry[1].trim()) &&
      shouldRenderFieldAsMarkdown(entry[0], entry[1])
  );

  const markdownKeys = new Set(markdownEntries.map(([k]) => k));
  const remainingBusinessEntries = businessEntries.filter(([k]) => !markdownKeys.has(k));

  const hasPrimaryArticles = Boolean(deepContent.articles && deepContent.articles.length > 0);
  const hasDeepText = Boolean(deepContent.text && markdownEntries.length === 0);
  const hasMarkdownEntries = markdownEntries.length > 0;
  const hasRemainingBusiness = remainingBusinessEntries.length > 0;

  const hasPrimaryContent =
    hasPrimaryArticles || hasDeepText || hasMarkdownEntries || hasRemainingBusiness;

  if (hasPrimaryContent) {
    const technicalRecord = Object.fromEntries(technicalEntries);
    const hasTechnicalData = Object.keys(technicalRecord).length > 0;
    const remainingBusinessRecord = Object.fromEntries(remainingBusinessEntries);

    return (
      <div style={{ display: 'grid', gap: 12 }}>
        {hasPrimaryArticles && deepContent.articles ? (
          <ArticleList articles={deepContent.articles} />
        ) : null}

        {hasDeepText && deepContent.text ? (
          <ExpandableMarkdownContent text={deepContent.text} />
        ) : null}

        {markdownEntries.map(([key, text]) => (
          <div key={key}>
            {markdownEntries.length > 1 || hasRemainingBusiness ? (
              <Text type="secondary" code style={{ display: 'inline-block', marginBottom: 6 }}>
                {key}
              </Text>
            ) : null}
            <ExpandableMarkdownContent text={text} />
          </div>
        ))}

        {hasRemainingBusiness ? (
          isSimpleKeyValueObject(remainingBusinessRecord) ? (
            renderSimpleKeyValueObject(remainingBusinessRecord)
          ) : (
            <JsonPreview value={remainingBusinessRecord} />
          )
        ) : null}

        {hasTechnicalData ? (
          <Collapse
            ghost
            size="small"
            defaultActiveKey={[]}
            items={[
              {
                key: 'technical-data',
                label: (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    查看技术元数据与上游数据 ({Object.keys(technicalRecord).length} 项)
                  </Text>
                ),
                children: <JsonPreview value={technicalRecord} />,
              },
            ]}
          />
        ) : null}
      </div>
    );
  }

  // 4. If technical/upstream entries exist without primary business content
  if (technicalEntries.length > 0) {
    const technicalRecord = Object.fromEntries(technicalEntries);
    return (
      <Collapse
        ghost
        size="small"
        defaultActiveKey={[]}
        items={[
          {
            key: 'technical-data',
            label: (
              <Text type="secondary" style={{ fontSize: 13 }}>
                查看上游输入与技术元数据 ({Object.keys(technicalRecord).length} 项)
              </Text>
            ),
            children: <JsonPreview value={technicalRecord} />,
          },
        ]}
      />
    );
  }

  // 5. Fallback: if it's a simple key-value object (like { startUrl: '...' })
  if (isSimpleKeyValueObject(resultRecord)) {
    return renderSimpleKeyValueObject(resultRecord);
  }

  // 6. Complex JSON fallback - collapse by default
  return (
    <Collapse
      ghost
      size="small"
      defaultActiveKey={[]}
      items={[
        {
          key: 'raw-json',
          label: (
            <Text type="secondary" style={{ fontSize: 13 }}>
              查看原始数据
            </Text>
          ),
          children: <JsonPreview value={parsedValue} />,
        },
      ]}
    />
  );
};

export default ExecutionPayloadContent;
