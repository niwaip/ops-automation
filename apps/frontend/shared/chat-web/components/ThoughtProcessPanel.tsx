import React from 'react';
import { DownOutlined, RightOutlined } from '@ant-design/icons';

interface ThoughtProcessPanelProps {
  thoughts: string[];
  expanded: boolean;
  onToggle: () => void;
  collapsedSummary?: string;
  preserveSummaryWhenCollapsed?: boolean;
}

const ThoughtProcessPanel: React.FC<ThoughtProcessPanelProps> = ({
  thoughts,
  expanded,
  onToggle,
  collapsedSummary,
  preserveSummaryWhenCollapsed = false,
}) => {
  if (thoughts.length === 0) {
    return null;
  }

  const normalizedSummary = collapsedSummary?.trim();
  const showCollapsedSummary =
    preserveSummaryWhenCollapsed && !expanded && Boolean(normalizedSummary);

  return (
    <div className="chat-thoughts-wrapper">
      <div className="chat-thoughts-header" onClick={onToggle}>
        {expanded ? <DownOutlined /> : <RightOutlined />}
        <span className="chat-thoughts-header-text">
          <span className="chat-thoughts-header-line">
            <span className="chat-thoughts-title">
              {expanded ? '隐藏思考过程' : showCollapsedSummary ? '思考结果' : '查看思考过程'}
            </span>
            <span className="chat-thoughts-count">({thoughts.length} 步)</span>
          </span>
          {showCollapsedSummary ? (
            <span className="chat-thoughts-summary">{normalizedSummary}</span>
          ) : null}
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
