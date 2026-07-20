import React from 'react';
import { Alert } from 'antd';

interface ExecutionErrorAlertProps {
  message: React.ReactNode;
  description?: React.ReactNode;
}

const ExecutionErrorAlert: React.FC<ExecutionErrorAlertProps> = ({ message, description }) => {
  return <Alert type="error" showIcon message={message} description={description} />;
};

export default ExecutionErrorAlert;
