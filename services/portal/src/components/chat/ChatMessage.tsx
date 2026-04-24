/**
 * ChatMessage
 * 单条消息渲染组件 - 支持Markdown渲染和思考折叠
 */

import React, { useMemo, useState } from 'react';
import { Avatar, Button, Space, Switch, Tag, message as antdMessage } from 'antd';
import { UserOutlined, RobotOutlined, FileTextOutlined, DownOutlined, RightOutlined, CopyOutlined, RedoOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessage } from './types';
import './ChatMessage.css';

interface ChatMessageProps {
  message: ChatMessage;
  isStreaming?: boolean;
  streamingContent?: string;
  onRetry?: (messageId: string) => void;
}

// 解析消息内容，分离思考和最终回答
const parseMessageContent = (content: string): { thoughts: string[]; answer: string } => {
  const thoughts: string[] = [];
  let answer = content;

  // 匹配【思考】和【行动】标签
  const thoughtRegex = /【思考】([^\n]*(?:\n(?!【)[^\n]*)*)/g;
  const actionRegex = /【行动】([^\n]*(?:\n(?!【)[^\n]*)*)/g;
  const observationRegex = /【观察】([^\n]*(?:\n(?!【)[^\n]*)*)/g;

  // 提取所有思考内容
  let match;
  while ((match = thoughtRegex.exec(content)) !== null) {
    thoughts.push(`💭 思考: ${match[1].trim()}`);
  }
  while ((match = actionRegex.exec(content)) !== null) {
    thoughts.push(`🔧 行动: ${match[1].trim()}`);
  }
  while ((match = observationRegex.exec(content)) !== null) {
    // 观察内容通常是模型回复，不作为思考过程
  }

  // 移除思考/行动/观察标签，保留最终回答
  answer = content
    .replace(thoughtRegex, '')
    .replace(actionRegex, '')
    .replace(observationRegex, '')
    .replace(/❌ 错误: [^\n]+/g, '')  // 移除错误信息（如果有）
    .trim();

  // 如果answer为空但有observation内容，使用observation作为answer
  if (!answer) {
    const obsMatch = content.match(/【观察】([^\n]*(?:\n(?!【)[^\n]*)*)/);
    if (obsMatch) {
      answer = obsMatch[1].trim();
    }
  }

  return { thoughts, answer };
};

const ChatMessageComponent: React.FC<ChatMessageProps> = ({
  message,
  isStreaming,
  streamingContent,
  onRetry,
}) => {
  const [thoughtsExpanded, setThoughtsExpanded] = useState(true); // 默认展开思考内容
  const [taskCompleted, setTaskCompleted] = useState(true);
  const isUser = message.role === 'user';
  const rawContent = isStreaming && streamingContent ? streamingContent : message.content;
  const isWaitingInput = message.metadata?.taskStatus === 'waiting_input';

  // 解析内容
  const { thoughts, answer } = parseMessageContent(rawContent);
  const answerWithoutTaskCheckbox = useMemo(
    () => answer.replace(/\n?- \[x\]\s*任务完成（可改为未完成）\s*$/m, '').trim(),
    [answer],
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(answerWithoutTaskCheckbox || rawContent);
      antdMessage.success('已复制');
    } catch {
      antdMessage.error('复制失败');
    }
  };

  // 渲染文件附件
  const renderFiles = () => {
    if (!message.metadata?.files?.length) return null;

    return (
      <div className="chat-message-files">
        {message.metadata.files.map((fileName, idx) => (
          <div key={idx} className="chat-message-file">
            <FileTextOutlined />
            <span>{fileName}</span>
          </div>
        ))}
      </div>
    );
  };

  // 渲染下载链接
  const renderDownloadLink = () => {
    if (!message.metadata?.downloadUrl) return null;

    return (
      <div className="chat-message-download">
        <a href={message.metadata.downloadUrl} target="_blank" rel="noopener noreferrer">
          点击下载文档
        </a>
      </div>
    );
  };

  // 渲染思考过程（可折叠）
  const renderThoughts = () => {
    if (thoughts.length === 0 || isUser) return null;

    return (
      <div className="chat-thoughts-wrapper">
        <div
          className="chat-thoughts-header"
          onClick={() => setThoughtsExpanded(!thoughtsExpanded)}
        >
          {thoughtsExpanded ? <DownOutlined /> : <RightOutlined />}
          <span className="chat-thoughts-title">
            {thoughtsExpanded ? '隐藏思考过程' : '查看思考过程'}
          </span>
          <span className="chat-thoughts-count">({thoughts.length} 步)</span>
        </div>
        {thoughtsExpanded && (
          <div className="chat-thoughts-content">
            {thoughts.map((thought, idx) => (
              <div key={idx} className="chat-thought-step">{thought}</div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // 渲染Markdown内容
  const renderContent = () => {
    if (isUser) {
      return <div className="chat-message-plain">{answerWithoutTaskCheckbox}</div>;
    }

    return (
      <div className="chat-message-markdown">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // 自定义代码块样式
            code: ({ className, children, ...props }) => {
              const match = /language-(\w+)/.exec(className || '');
              return match ? (
                <pre className={`code-block language-${match[1]}`}>
                  <code {...props}>{children}</code>
                </pre>
              ) : (
                <code className="inline-code" {...props}>{children}</code>
              );
            },
            // 自定义表格样式
            table: ({ children }) => (
              <div className="markdown-table-wrapper">
                <table>{children}</table>
              </div>
            ),
          }}
        >
          {answerWithoutTaskCheckbox}
        </ReactMarkdown>
        {isStreaming && <span className="streaming-indicator">...</span>}
      </div>
    );
  };

  return (
    <div className={`chat-message ${isUser ? 'user' : 'assistant'}`}>
      {!isUser && (
        <Avatar
          icon={<RobotOutlined />}
          className="chat-message-avatar assistant"
        />
      )}

      <div className={`chat-message-stack ${isUser ? 'user' : 'assistant'}`}>
        <div className={`chat-message-content ${isUser ? 'user' : 'assistant'}`}>
          {renderThoughts()}
          {isWaitingInput && (
            <Tag color="gold" className="chat-waiting-tag">
              等待你输入
            </Tag>
          )}
          {renderContent()}
          {renderFiles()}
          {renderDownloadLink()}
        </div>

        <div className={`chat-message-meta ${isUser ? 'user' : 'assistant'}`}>
          {!isUser && (
            <div className="chat-message-actions">
              <Space size={8}>
                <Button size="small" type="text" icon={<CopyOutlined />} onClick={handleCopy}>
                  复制
                </Button>
                {onRetry && (
                  <Button size="small" type="text" icon={<RedoOutlined />} onClick={() => onRetry(message.id)}>
                    重试
                  </Button>
                )}
                {(answer.includes('任务完成') || message.metadata?.taskStatus === 'completed') && (
                  <div className="chat-task-switch">
                    <span>任务完成</span>
                    <Switch
                      size="small"
                      checked={taskCompleted}
                      onChange={setTaskCompleted}
                      checkedChildren="是"
                      unCheckedChildren="否"
                    />
                  </div>
                )}
              </Space>
            </div>
          )}

          <div className="chat-message-time">
            {message.timestamp.toLocaleTimeString()}
          </div>
        </div>
      </div>

      {isUser && (
        <Avatar
          icon={<UserOutlined />}
          className="chat-message-avatar user"
        />
      )}
    </div>
  );
};

export default ChatMessageComponent;
