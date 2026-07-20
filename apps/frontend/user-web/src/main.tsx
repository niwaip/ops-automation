import React, { useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { App as AntdApp, ConfigProvider, theme as antdTheme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import jaJP from 'antd/locale/ja_JP';
import { QueryClient, QueryClientProvider } from 'react-query';
import { useStore } from 'zustand';
import { browserI18n } from './adapters/i18n/browserI18n';
import { preferencesStore } from './adapters/preferences/preferencesStore';
import { BORDER_RADIUS, PRIMARY_COLOR } from '@/shared/config/theme';
import App from './app/App';
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
  const language = useStore(preferencesStore, (state) => state.language);
  const theme = useStore(preferencesStore, (state) => state.theme);
  const locale = language === 'en-US' ? enUS : language === 'ja-JP' ? jaJP : zhCN;

  useEffect(() => {
    void browserI18n.changeLanguage(language);
    document.documentElement.setAttribute('data-theme', theme);
  }, [language, theme]);

  const themeConfig = useMemo(
    () => ({
      algorithm: theme === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
      token: {
        colorPrimary: PRIMARY_COLOR,
        borderRadius: BORDER_RADIUS,
      },
    }),
    [theme]
  );

  return (
    <ConfigProvider locale={locale} theme={themeConfig}>
      <AntdApp>{children}</AntdApp>
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
