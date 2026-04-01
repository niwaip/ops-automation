import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import jaJP from 'antd/locale/ja_JP';
import { QueryClient, QueryClientProvider } from 'react-query';
import App from './App';
import { useAuthStore } from './store/authStore';
import './i18n';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const AntdProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { language } = useAuthStore();
  const locale = language === 'en-US' ? enUS : language === 'ja-JP' ? jaJP : zhCN;
  return (
    <ConfigProvider locale={locale}>
      {children}
    </ConfigProvider>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AntdProvider>
        <App />
      </AntdProvider>
    </QueryClientProvider>
  </React.StrictMode>
);