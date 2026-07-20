import React from 'react';
import { Space, Typography } from 'antd';
import type { SpaceProps } from 'antd';

const { Text, Link } = Typography;

interface ExecutionExternalLinkProps {
  href: string;
  label?: string;
  text?: string;
  icon?: React.ReactNode;
  copyable?: boolean;
  size?: SpaceProps['size'];
}

const ExecutionExternalLink: React.FC<ExecutionExternalLinkProps> = ({
  href,
  label,
  text,
  icon,
  copyable = true,
  size = [8, 4],
}) => {
  return (
    <Space wrap size={size}>
      {label ? <Text type="secondary">{`${label}:`}</Text> : null}
      {icon}
      <Link href={href} target="_blank" rel="noopener noreferrer" copyable={copyable}>
        {text || href}
      </Link>
    </Space>
  );
};

export default ExecutionExternalLink;
