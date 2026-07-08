import React from 'react';

interface ExecutionDetailPanelBlockProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
}

const ExecutionDetailPanelBlock: React.FC<ExecutionDetailPanelBlockProps> = ({ children, style }) => {
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 10,
        border: '1px solid var(--bg-secondary)',
        background: 'var(--bg-card)',
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export default ExecutionDetailPanelBlock;
