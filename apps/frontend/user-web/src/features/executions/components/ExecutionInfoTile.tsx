import React from 'react';
import { Typography } from 'antd';

const { Text } = Typography;

interface ExecutionInfoTileProps {
  label: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

const ExecutionInfoTile: React.FC<ExecutionInfoTileProps> = ({ label, children, style }) => {
  return (
    <div
      style={{
        minWidth: 0,
        padding: 10,
        borderRadius: 8,
        border: '1px solid var(--bg-secondary)',
        background: 'var(--bg-card)',
        ...style,
      }}
    >
      <Text type="secondary">{label}</Text>
      <div style={{ marginTop: 6 }}>{children}</div>
    </div>
  );
};

export default ExecutionInfoTile;
