import React from 'react';
import { Button } from 'antd';

interface ExecutionLinkButtonProps {
  href: string;
  children: React.ReactNode;
  fitContent?: boolean;
}

const ExecutionLinkButton: React.FC<ExecutionLinkButtonProps> = ({
  href,
  children,
  fitContent = false,
}) => {
  return (
    <Button
      type="link"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        paddingInline: 0,
        ...(fitContent ? { width: 'fit-content' } : {}),
      }}
    >
      {children}
    </Button>
  );
};

export default ExecutionLinkButton;
