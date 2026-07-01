import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MessageContentRendererProps {
  content: string;
  mode: 'plain' | 'markdown';
  isStreaming?: boolean;
}

const MessageContentRenderer: React.FC<MessageContentRendererProps> = ({
  content,
  mode,
  isStreaming = false,
}) => {
  if (!content) {
    return null;
  }

  if (mode === 'plain') {
    return <div className="chat-message-plain">{content}</div>;
  }

  return (
    <div className="chat-message-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code: ({ className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || '');
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
          table: ({ children }) => (
            <div className="markdown-table-wrapper">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
      {isStreaming ? <span className="streaming-indicator">...</span> : null}
    </div>
  );
};

export default MessageContentRenderer;
