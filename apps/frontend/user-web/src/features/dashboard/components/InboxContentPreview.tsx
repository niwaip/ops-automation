import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import inboxStyles from './InboxList.module.css';

/** Collapsed inbox cards must not parse or mount the full email/report. */
export const InboxContentPreview = memo(function InboxContentPreview({
  content,
  expanded,
}: {
  content: string;
  expanded: boolean;
}) {
  if (!expanded) {
    return (
      <p className={inboxStyles['inbox-md-p']} style={{ whiteSpace: 'pre-wrap' }}>
        {content.slice(0, 180) || '暂无详细内容'}
        {content.length > 180 ? '…' : ''}
      </p>
    );
  }
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <div className={inboxStyles['inbox-md-h1']}>{children}</div>,
        h2: ({ children }) => <div className={inboxStyles['inbox-md-h2']}>{children}</div>,
        h3: ({ children }) => <div className={inboxStyles['inbox-md-h3']}>{children}</div>,
        p: ({ children }) => <p className={inboxStyles['inbox-md-p']}>{children}</p>,
        ul: ({ children }) => <ul className={inboxStyles['inbox-md-list']}>{children}</ul>,
        ol: ({ children }) => <ol className={inboxStyles['inbox-md-list']}>{children}</ol>,
        li: ({ children }) => <li className={inboxStyles['inbox-md-li']}>{children}</li>,
        code: ({ children }) => <code className={inboxStyles['inbox-md-code']}>{children}</code>,
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={inboxStyles['inbox-md-link']}
          >
            {children}
          </a>
        ),
      }}
    >
      {content || '暂无详细内容'}
    </ReactMarkdown>
  );
});
