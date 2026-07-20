import React from 'react';
import { Alert, Space } from 'antd';
import type { AlertProps } from 'antd';

interface ExecutionDetailAlertActionsProps {
  type?: AlertProps['type'];
  message: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  footerContent?: React.ReactNode;
  separateFooter?: boolean;
  alertStyle?: React.CSSProperties;
}

const ExecutionDetailAlertActions: React.FC<ExecutionDetailAlertActionsProps> = ({
  type = 'warning',
  message,
  description,
  actions,
  footerContent,
  separateFooter = false,
  alertStyle,
}) => {
  const hasFooter = Boolean(actions || footerContent);

  return (
    <Space direction="vertical" size={hasFooter ? 16 : 0} style={{ width: '100%' }}>
      <Alert
        type={type}
        showIcon
        message={message}
        description={description}
        style={alertStyle}
      />
      {hasFooter ? (
        <div
          style={
            separateFooter
              ? {
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 12,
                  paddingTop: 12,
                  borderTop: '1px solid var(--bg-secondary)',
                }
              : undefined
          }
        >
          {footerContent}
          {actions}
        </div>
      ) : null}
    </Space>
  );
};

export default ExecutionDetailAlertActions;
