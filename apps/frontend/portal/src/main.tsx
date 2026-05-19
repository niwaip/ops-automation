import React, { useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { App as AntdApp, ConfigProvider, theme as antdTheme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import jaJP from 'antd/locale/ja_JP';
import { QueryClient, QueryClientProvider } from 'react-query';
import App from '@/app/App';
import { useAuthStore } from '@/shared/store/authStore';
import '@/shared/i18n';
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
  const { language, theme } = useAuthStore();
  const locale = language === 'en-US' ? enUS : language === 'ja-JP' ? jaJP : zhCN;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const themeConfig = useMemo(() => ({
    algorithm: theme === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: '#6366f1',
      colorInfo: '#6366f1',
      colorSuccess: '#10b981',
      colorWarning: '#f59e0b',
      colorError: '#ef4444',
      borderRadius: 10,
      wireframe: false,
      colorBgLayout: theme === 'dark' ? '#0f172a' : '#f8fafc',
      colorBgContainer: theme === 'dark' ? '#1e293b' : '#ffffff',
      colorBgElevated: theme === 'dark' ? '#1f2937' : '#ffffff',
      colorBorder: theme === 'dark' ? '#334155' : '#e2e8f0',
      colorBorderSecondary: theme === 'dark' ? '#334155' : '#e2e8f0',
      colorText: theme === 'dark' ? '#f8fafc' : '#1e293b',
      colorTextSecondary: theme === 'dark' ? '#cbd5e1' : '#64748b',
      colorTextTertiary: theme === 'dark' ? '#94a3b8' : '#94a3b8',
      colorFillAlter: theme === 'dark' ? '#273449' : '#f1f5f9',
      boxShadowSecondary: theme === 'dark'
        ? '0 12px 24px rgba(0, 0, 0, 0.35)'
        : '0 10px 24px rgba(15, 23, 42, 0.08)',
    },
    components: {
      Layout: {
        headerBg: theme === 'dark' ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.95)',
        bodyBg: theme === 'dark' ? '#0f172a' : '#f8fafc',
        siderBg: '#1e1b4b',
      },
      Menu: {
        darkItemBg: 'transparent',
        darkSubMenuItemBg: 'transparent',
        darkItemSelectedBg: 'rgba(255, 255, 255, 0.15)',
        darkItemHoverBg: 'rgba(255, 255, 255, 0.1)',
      },
      Card: {
        colorBgContainer: theme === 'dark' ? '#1e293b' : '#ffffff',
      },
      Table: {
        headerBg: theme === 'dark' ? '#273449' : '#f1f5f9',
        headerColor: theme === 'dark' ? '#f8fafc' : '#1e293b',
        rowHoverBg: theme === 'dark' ? '#243244' : '#f8fafc',
        colorBgContainer: theme === 'dark' ? '#1e293b' : '#ffffff',
        borderColor: theme === 'dark' ? '#334155' : '#e2e8f0',
      },
      Drawer: {
        colorBgElevated: theme === 'dark' ? '#162033' : '#ffffff',
      },
      Modal: {
        contentBg: theme === 'dark' ? '#162033' : '#ffffff',
        headerBg: theme === 'dark' ? '#162033' : '#ffffff',
      },
      Collapse: {
        headerBg: theme === 'dark' ? '#1e293b' : '#ffffff',
        contentBg: theme === 'dark' ? '#1e293b' : '#ffffff',
      },
      Descriptions: {
        colorFillAlter: theme === 'dark' ? '#273449' : '#f8fafc',
      },
      Input: {
        colorBgContainer: theme === 'dark' ? '#1e293b' : '#ffffff',
      },
      Select: {
        colorBgContainer: theme === 'dark' ? '#1e293b' : '#ffffff',
        optionSelectedBg: theme === 'dark' ? '#243244' : '#eef2ff',
      },
    },
  }), [theme]);

  return (
    <ConfigProvider locale={locale} theme={themeConfig}>
      <AntdApp>
        {children}
      </AntdApp>
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
