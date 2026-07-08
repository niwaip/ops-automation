import React from 'react';

interface ExecutionDetailActionBarProps {
  children: React.ReactNode;
  marginTop?: number;
}

const ExecutionDetailActionBar: React.FC<ExecutionDetailActionBarProps> = ({
  children,
  marginTop = 0,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'flex-end',
        flexWrap: 'wrap',
        gap: 8,
        paddingTop: 12,
        marginTop,
        borderTop: '1px solid var(--bg-secondary)',
      }}
    >
      {children}
    </div>
  );
};

export default ExecutionDetailActionBar;
