import React from 'react';
import { CopyOutlined, EyeOutlined, RedoOutlined } from '@ant-design/icons';
import { Button, Space, Tooltip } from 'antd';

export interface SharedLLMUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  completion_tokens_details?: {
    reasoning_tokens?: number;
  };
}

interface ChatMessageActionsProps {
  usage?: SharedLLMUsage;
  canViewPrompt?: boolean;
  onOpenPrompt?: () => void;
  onCopy: () => void;
  onRetry?: () => void;
  extraContent?: React.ReactNode;
}

const UsageSummary: React.FC<{ usage?: SharedLLMUsage }> = ({ usage }) => {
  if (!usage) {
    return null;
  }

  const {
    prompt_tokens = 0,
    completion_tokens = 0,
    total_tokens = 0,
    completion_tokens_details,
  } = usage;

  if (total_tokens === 0) {
    return null;
  }

  const reasoningTokens = completion_tokens_details?.reasoning_tokens;

  return (
    <div className="chat-message-usage">
      <Space size={4} split={<span className="chat-usage-divider">/</span>}>
        <span className="chat-usage-item">
          <span className="chat-usage-label">Tokens:</span>
          <span className="chat-usage-value">{total_tokens}</span>
        </span>
        <span className="chat-usage-detail">
          输入:{prompt_tokens} 输出:{completion_tokens}
          {reasoningTokens ? ` (含推理:${reasoningTokens})` : ''}
        </span>
      </Space>
    </div>
  );
};

const ChatMessageActions: React.FC<ChatMessageActionsProps> = ({
  usage,
  canViewPrompt = false,
  onOpenPrompt,
  onCopy,
  onRetry,
  extraContent,
}) => {
  return (
    <div className="chat-message-actions">
      <Space size={12} wrap>
        <UsageSummary usage={usage} />
        {extraContent}
        <div className="chat-action-buttons">
          <Tooltip title="复制">
            <Button
              size="small"
              type="text"
              icon={<CopyOutlined />}
              onClick={onCopy}
              className="chat-action-btn chat-action-btn-icon"
              aria-label="复制"
            />
          </Tooltip>
          {canViewPrompt && onOpenPrompt ? (
            <Tooltip title="查看 Prompt">
              <Button
                size="small"
                type="text"
                icon={<EyeOutlined />}
                onClick={onOpenPrompt}
                className="chat-action-btn chat-action-btn-icon"
                aria-label="查看 Prompt"
              />
            </Tooltip>
          ) : null}
          {onRetry ? (
            <Tooltip title="重试">
              <Button
                size="small"
                type="text"
                icon={<RedoOutlined />}
                onClick={onRetry}
                className="chat-action-btn chat-action-btn-icon"
                aria-label="重试"
              />
            </Tooltip>
          ) : null}
        </div>
      </Space>
    </div>
  );
};

export default ChatMessageActions;
