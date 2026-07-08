import React from 'react';

interface ExecutionDetailInfoBlockProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
}

const ExecutionDetailInfoBlock: React.FC<ExecutionDetailInfoBlockProps> = ({ children, style }) => {
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 10,
        border: '1px solid var(--bg-secondary)',
        background: 'var(--bg-secondary)',
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export default ExecutionDetailInfoBlock;
