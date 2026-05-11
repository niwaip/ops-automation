/**
 * Office Addin - 入口文件
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

// Office 初始化
Office.onReady((info) => {
  console.log('Office Addin Ready:', info.host);

  try {
    // Give the task pane a wider default footprint when the host supports TaskPaneApi 1.1.
    const officeWithTaskpaneApi = Office as typeof Office & {
      extensionLifeCycle?: {
        taskpane?: {
          setWidth?: (width: number) => void;
        };
      };
    };
    officeWithTaskpaneApi.extensionLifeCycle?.taskpane?.setWidth?.(420);
  } catch (error) {
    console.warn('Taskpane width setup skipped:', error);
  }

  // 渲染 React 应用
  const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
