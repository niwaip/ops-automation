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
  const isReasoningIncluded =
    Boolean(reasoningTokens) && total_tokens === prompt_tokens + completion_tokens;
  const reasoningPrefix = isReasoningIncluded ? '含推理' : '+推理';

  const tooltipTitle = (
    <div style={{ fontSize: 12, lineHeight: 1.6 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Token 消耗统计（模型上游官方返回）</div>
      <div>• 输入（Prompt）: {prompt_tokens}</div>
      <div>• 输出（Completion）: {completion_tokens}</div>
      {reasoningTokens ? (
        <div>
          • 思考推理（Reasoning）: {reasoningTokens} ({isReasoningIncluded ? '已计入输出' : '未计入输出，单独累加'})
        </div>
      ) : null}
      <div style={{ marginTop: 4, paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.2)' }}>
        总计: {total_tokens} {reasoningTokens && !isReasoningIncluded ? `(${prompt_tokens} + ${completion_tokens} + ${reasoningTokens} = ${total_tokens})` : `(${prompt_tokens} + ${completion_tokens} = ${total_tokens})`}
      </div>
    </div>
  );

  return (
    <Tooltip title={tooltipTitle} placement="top">
      <div className="chat-message-usage" style={{ cursor: 'pointer' }}>
        <Space size={4} split={<span className="chat-usage-divider">/</span>}>
          <span className="chat-usage-item">
            <span className="chat-usage-label">Tokens:</span>
            <span className="chat-usage-value">{total_tokens}</span>
          </span>
          <span className="chat-usage-detail">
            输入:{prompt_tokens} 输出:{completion_tokens}
            {reasoningTokens ? ` (${reasoningPrefix}:${reasoningTokens})` : ''}
          </span>
        </Space>
      </div>
    </Tooltip>
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
