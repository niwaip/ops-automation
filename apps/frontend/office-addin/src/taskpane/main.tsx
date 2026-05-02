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

  // 渲染 React 应用
  const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});