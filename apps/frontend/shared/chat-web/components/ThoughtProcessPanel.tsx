import React from 'react';
import { DownOutlined, RightOutlined } from '@ant-design/icons';

interface ThoughtProcessPanelProps {
  thoughts: string[];
  expanded: boolean;
  onToggle: () => void;
}

const ThoughtProcessPanel: React.FC<ThoughtProcessPanelProps> = ({
  thoughts,
  expanded,
  onToggle,
}) => {
  if (thoughts.length === 0) {
    return null;
  }

  return (
    <div className="chat-thoughts-wrapper">
      <div className="chat-thoughts-header" onClick={onToggle}>
        {expanded ? <DownOutlined /> : <RightOutlined />}
        <span className="chat-thoughts-title">{expanded ? '隐藏思考过程' : '查看思考过程'}</span>
        <span className="chat-thoughts-count">({thoughts.length} 步)</span>
      </div>
      {expanded ? (
        <div className="chat-thoughts-content">
          {thoughts.map((thought, idx) => (
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
