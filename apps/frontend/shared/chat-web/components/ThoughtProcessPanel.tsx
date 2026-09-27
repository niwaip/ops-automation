import React from 'react';
import { DownOutlined, RightOutlined } from '@ant-design/icons';

interface ThoughtProcessPanelProps {
  thoughts: string[];
  expanded: boolean;
  onToggle: () => void;
  collapsedSummary?: string;
  preserveSummaryWhenCollapsed?: boolean;
  isStreaming?: boolean;
}

const ThoughtProcessPanel: React.FC<ThoughtProcessPanelProps> = ({
  thoughts,
  expanded,
  onToggle,
  isStreaming = false,
}) => {
  if (thoughts.length === 0) {
    return null;
  }

  const titleText = expanded
    ? isStreaming
      ? '正在思考中...'
      : '隐藏思考过程'
    : isStreaming
    ? '思考中...'
    : '查看思考过程';

  const countBadge =
    thoughts.length > 1
      ? `(${thoughts.length} 步)`
      : isStreaming
      ? '(深度思考)'
      : '(已深度思考)';

  return (
    <div className="chat-thoughts-wrapper">
      <div className="chat-thoughts-header" onClick={onToggle}>
        {expanded ? <DownOutlined /> : <RightOutlined />}
        <span className="chat-thoughts-header-text">
          <span className="chat-thoughts-header-line">
            <span className="chat-thoughts-title">{titleText}</span>
            <span className="chat-thoughts-count">{countBadge}</span>
          </span>
        </span>
      </div>
      {expanded ? (
        <div className="chat-thoughts-content">
          {thoughts.map((thought: string, idx: number) => (
            <div key={idx} className="chat-thought-step">
              {thought}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export default ThoughtProcessPanel;
