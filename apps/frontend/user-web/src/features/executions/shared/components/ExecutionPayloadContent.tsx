import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button, Collapse, Descriptions, Tag, Typography } from 'antd';
import {
  CommentOutlined,
  DownOutlined,
  DownloadOutlined,
  FileExcelFilled,
  FilePdfFilled,
  FileTextFilled,
  FileTextOutlined,
  FileWordFilled,
  PaperClipOutlined,
  UpOutlined,
} from '@ant-design/icons';
import { JsonPreview } from '@/features/executions/shared/components/JsonPreview';
import { tryParseJsonValue } from '@/features/executions/shared/lib/common';
import { beautifyText } from '@/features/executions/detail/lib/detailView';
import { normalizeTabSeparatedTable } from '@chat-web/lib/tableNormalizer';
import { HtmlPreviewBlock } from '@chat-web/components/HtmlPreviewBlock';
import { parseCustomerFacingPayload, INTERNAL_NOISE_KEYS } from '@/features/executions/shared/lib/customerFacingPayload';
import styles from '../../pages/ExecutionListPage.module.css';

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

const isHtmlPreviewBlock = (className?: string, codeText?: string) => {
  const match = /language-(\w+)/.exec(className || '');
  if (!match || match[1] !== 'html' || !codeText) return false;
  return (
    codeText.includes('<!DOCTYPE html') ||
    codeText.includes('<html') ||
    codeText.includes('class="slide') ||
    codeText.includes('presentation') ||
    codeText.includes('guizang') ||
    codeText.includes('diff-ins') ||
    codeText.includes('diff-del')
  );
};

const isBase64String = (val: unknown): boolean =>
  typeof val === 'string' &&
  (val.startsWith('data:') ||
    val.startsWith('UEsDB') ||
    (val.length > 200 && /^[A-Za-z0-9+/=\r\n]+$/.test(val.slice(0, 100))));

const isBinaryOrNoiseKey = (key: string, val: unknown): boolean =>
  INTERNAL_NOISE_KEYS.has(key) ||
  /base64/i.test(key) ||
  key === 'fileContent' ||
  key === 'fileData' ||
  key === 'rawFile' ||
  isBase64String(val);

const sanitizeTechnicalValue = (val: unknown): unknown => {
  if (typeof val === 'string' && isBase64String(val)) {
    return `[二进制/Base64 数据，约 ${(val.length / 1024).toFixed(1)} KB]`;
  }
  if (val && typeof val === 'object') {
    if (Array.isArray(val)) {
      return val.map(sanitizeTechnicalValue);
    }
    const cleanObj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      cleanObj[k] = sanitizeTechnicalValue(v);
    }
    return cleanObj;
  }
  return val;
};


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
      const isContentLong =
        containerRef.current.scrollHeight > maxCollapsedHeight + 10 ||
        lineCount > maxCollapsedLines ||
        normalized.length > 200;
      setIsOverflow(isContentLong);
    }
  }, [normalized, maxCollapsedHeight, maxCollapsedLines, hasHtmlArtifact]);

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
            pre: ({ children, className: preClassName, ...props }: React.ComponentPropsWithoutRef<'pre'>) => {
              const childElement = React.isValidElement(children) ? children : null;
              const childProps = childElement ? (childElement.props as { className?: string; children?: React.ReactNode }) : null;
              const codeClassName = childProps?.className || '';
              const codeText = Array.isArray(childProps?.children)
                ? childProps.children.join('')
                : String(childProps?.children || '');

              if (isHtmlPreviewBlock(codeClassName, codeText)) {
                return <>{children}</>;
              }

              const mergedClass = ['code-block', preClassName, codeClassName].filter(Boolean).join(' ');
              return (
                <pre className={mergedClass} {...props}>
                  {children}
                </pre>
              );
            },
            code: ({
              className,
              children,
              ...props
            }: React.ComponentPropsWithoutRef<'code'> & { className?: string }) => {
              const codeText = Array.isArray(children) ? children.join('') : String(children || '');
              if (isHtmlPreviewBlock(className, codeText)) {
                return <HtmlPreviewBlock code={codeText.trim()} className={className} />;
              }

              return (
                <code className={className || 'inline-code'} {...props}>
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

const getFriendlyFieldLabel = (key: string): { label: string; icon?: React.ReactNode } => {
  switch (key) {
    case 'fileNameA':
      return { label: '比对基准版 (A)', icon: <FileTextOutlined style={{ color: '#1677ff' }} /> };
    case 'fileNameB':
      return { label: '比对修订版 (B)', icon: <FileTextOutlined style={{ color: '#52c41a' }} /> };
    case 'fileName':
      return { label: '输入文档', icon: <FileTextOutlined style={{ color: '#1677ff' }} /> };
    case 'user_input':
    case 'prompt':
    case 'query':
    case 'instruction':
      return { label: '用户需求', icon: <CommentOutlined style={{ color: '#fa8c16' }} /> };
    default:
      return { label: key };
  }
};

const isFileField = (key: string, val: unknown): boolean => {
  if (typeof val !== 'string') return false;
  const lowerKey = key.toLowerCase();
  const lowerVal = val.toLowerCase();
  return (
    lowerKey.includes('file') ||
    lowerKey.includes('doc') ||
    /\.(docx?|pdf|xlsx?|pptx?|txt|csv|json)$/i.test(lowerVal)
  );
};

const isSimpleKeyValueObject = (rec: Record<string, unknown>): boolean => {
  const visibleEntries = Object.entries(rec).filter(([k, v]) => !isBinaryOrNoiseKey(k, v));
  if (visibleEntries.length === 0) return false;
  return visibleEntries.every(
    ([, v]) =>
      v === null ||
      v === undefined ||
      typeof v === 'number' ||
      typeof v === 'boolean' ||
      (typeof v === 'string' && !isBase64String(v))
  );
};

const renderSimpleKeyValueObject = (rec: Record<string, unknown>) => {
  const entries = Object.entries(rec).filter(([key, val]) => {
    if (isBinaryOrNoiseKey(key, val)) return false;
    if (
      key === 'fileName' &&
      (rec.fileNameA !== undefined || rec.fileNameB !== undefined) &&
      (val === rec.fileNameA || val === rec.fileNameB)
    ) {
      return false;
    }
    return true;
  });

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
          const { label, icon } = getFriendlyFieldLabel(key);
          const isFile = isFileField(key, val);

          return (
            <Descriptions.Item
              key={key}
              label={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {icon}
                  <Text strong style={{ color: 'var(--text-primary)' }}>{label}</Text>
                </span>
              }
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
              ) : isFile ? (
                <Tag
                  color="blue"
                  style={{
                    fontSize: 13,
                    padding: '2px 8px',
                    borderRadius: 6,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <PaperClipOutlined />
                  <span style={{ fontWeight: 500 }}>{strVal}</span>
                </Tag>
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

const resolvePayloadDocIcon = (name?: string) => {
  const ext = (name || '').split('.').pop()?.toLowerCase();
  if (ext === 'doc' || ext === 'docx') {
    return <FileWordFilled style={{ color: '#2563eb', fontSize: 20 }} />;
  }
  if (ext === 'pdf') {
    return <FilePdfFilled style={{ color: '#ef4444', fontSize: 20 }} />;
  }
  if (ext === 'xls' || ext === 'xlsx' || ext === 'csv') {
    return <FileExcelFilled style={{ color: '#16a34a', fontSize: 20 }} />;
  }
  return <FileTextFilled style={{ color: '#6366f1', fontSize: 20 }} />;
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
    if (parsedValue.every((item) => typeof item === 'string' || typeof item === 'number')) {
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {parsedValue.map((item, idx) => (
            <Tag key={idx}>{String(item)}</Tag>
          ))}
        </div>
      );
    }
    return (
      <Collapse
        ghost
        size="small"
        items={[
          {
            key: 'array-data',
            label: (
              <Text type="secondary" style={{ fontSize: 12 }}>
                查看数据列表 ({parsedValue.length} 项)
              </Text>
            ),
            children: <JsonPreview value={parsedValue} />,
          },
        ]}
      />
    );
  }

  const resultRecord =
    parsedValue && typeof parsedValue === 'object'
      ? (parsedValue as Record<string, unknown>)
      : undefined;

  if (!resultRecord) {
    return <Text type="secondary">{emptyText}</Text>;
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
  if (deepContent.articles && deepContent.articles.length > 0) {
    return <ArticleList articles={deepContent.articles} />;
  }
  if (deepContent.text) {
    return <ExpandableMarkdownContent text={deepContent.text} />;
  }

  // 3. Customer-Facing Structured Business Presentation
  const payloadModel = parseCustomerFacingPayload(resultRecord);
  if (payloadModel.hasBusinessContent) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
        {/* Documents & Files */}
        {payloadModel.documents.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {payloadModel.documents.map((doc, idx) => (
              <div key={idx} className={styles['execution-input-doc-card']}>
                <div className={styles['execution-input-doc-left']}>
                  <span className={styles['execution-input-doc-icon']}>
                    {resolvePayloadDocIcon(doc.name)}
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: 2 }}>
                    {doc.role && (
                      <Text type="secondary" style={{ fontSize: 11, fontWeight: 500 }}>
                        {doc.role}
                      </Text>
                    )}
                    <Text strong className={styles['execution-input-doc-name']}>
                      {doc.name}
                    </Text>
                  </div>
                </div>
                {doc.url && (
                  <Button
                    type="link"
                    size="small"
                    icon={<DownloadOutlined />}
                    onClick={() => window.open(doc.url, '_blank')}
                    style={{ flexShrink: 0 }}
                  >
                    下载原文件
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Business Settings (立场、比对模式、单号等) */}
        {payloadModel.settings.length > 0 && (
          <div className={styles['execution-input-settings-row']}>
            {payloadModel.settings.map((st, idx) => (
              <div key={idx} className={styles['execution-input-setting-item']}>
                <span className={styles['execution-input-setting-label']}>{st.label}：</span>
                {st.color ? (
                  <Tag color={st.color} bordered={false} style={{ margin: 0, fontSize: 12 }}>
                    {st.value}
                  </Tag>
                ) : (
                  <Text strong style={{ fontSize: 12 }}>
                    {st.value}
                  </Text>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Review Comments (拟定批注意见) */}
        {payloadModel.reviewComments.length > 0 && (
          <div className={styles['execution-input-comments-card']}>
            <div className={styles['execution-input-comments-header']}>
              <CommentOutlined style={{ color: '#6366f1' }} />
              <span>预置审查批注与修改要求 ({payloadModel.reviewComments.length} 条)</span>
            </div>
            <div className={styles['execution-input-comments-list']}>
              {payloadModel.reviewComments.map((comm, idx) => (
                <div key={idx} className={styles['execution-input-comment-item']}>
                  <span className={styles['execution-input-comment-badge']}>#{idx + 1}</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
                    {comm.clauseTitle && (
                      <Text type="secondary" style={{ fontSize: 11, fontWeight: 600 }}>
                        {comm.clauseTitle}
                      </Text>
                    )}
                    <Text style={{ fontSize: 12.5, lineHeight: 1.6, wordBreak: 'break-word' }}>
                      {comm.text}
                    </Text>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Primary text / user prompt */}
        {payloadModel.primaryText && (
          <div className={styles['execution-input-prompt-card']}>
            <div className={styles['execution-input-prompt-header']}>
              <Text strong style={{ fontSize: 13 }}>
                用户诉求与指令要求
              </Text>
            </div>
            <ExpandableMarkdownContent text={payloadModel.primaryText} />
          </div>
        )}

        {/* Remaining business fields - collapsed by default */}
        {payloadModel.remainingEntries.length > 0 && (
          <Collapse
            ghost
            size="small"
            items={[
              {
                key: 'other-params',
                label: (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    查看其他配置与业务参数 ({payloadModel.remainingEntries.length} 项)
                  </Text>
                ),
                children: (
                  <div
                    style={{
                      padding: '10px 14px',
                      borderRadius: 8,
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                    }}
                  >
                    <Descriptions size="small" column={{ xs: 1, sm: 1, md: 2 }}>
                      {payloadModel.remainingEntries.map(({ key, label, value: entryVal }) => {
                        const isBool = typeof entryVal === 'boolean';
                        const isUrl =
                          typeof entryVal === 'string' &&
                          (entryVal.startsWith('http://') || entryVal.startsWith('https://'));
                        const strVal =
                          typeof entryVal === 'object' ? JSON.stringify(entryVal) : String(entryVal);

                        return (
                          <Descriptions.Item key={key} label={<Text strong>{label}</Text>}>
                            {isBool ? (
                              <Tag color={entryVal ? 'green' : 'default'}>{entryVal ? '是' : '否'}</Tag>
                            ) : isUrl ? (
                              <a href={entryVal as string} target="_blank" rel="noopener noreferrer">
                                打开链接
                              </a>
                            ) : (
                              <Text style={{ wordBreak: 'break-all', fontSize: 12.5 }}>{strVal}</Text>
                            )}
                          </Descriptions.Item>
                        );
                      })}
                    </Descriptions>
                  </div>
                ),
              },
            ]}
          />
        )}

        {/* Technical debug payload - collapsed by default */}
        <Collapse
          ghost
          size="small"
          items={[
            {
              key: 'raw-debug',
              label: (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  查看技术调试参数 (JSON)
                </Text>
              ),
              children: <JsonPreview value={parsedValue} />,
            },
          ]}
        />
      </div>
    );
  }

  // 4. Fallback: if it's a simple key-value object
  if (isSimpleKeyValueObject(resultRecord)) {
    const rendered = renderSimpleKeyValueObject(resultRecord);
    if (rendered) return rendered;
  }

  // 5. Complex JSON fallback - collapsed by default
  return (
    <Collapse
      ghost
      size="small"
      items={[
        {
          key: 'raw-json',
          label: (
            <Text type="secondary" style={{ fontSize: 12 }}>
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
