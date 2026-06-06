import React, { useEffect, useMemo } from "react";
import ReactDOM from "react-dom/client";
import { App as AntdApp, ConfigProvider, theme as antdTheme } from "antd";
import zhCN from "antd/locale/zh_CN";
import enUS from "antd/locale/en_US";
import jaJP from "antd/locale/ja_JP";
import { QueryClient, QueryClientProvider } from "react-query";
import { useStore } from "zustand";
import { authStore } from "./auth";
import App from "./app.tsx";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const AntdProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const language = useStore(authStore, (state) => state.language);
  const theme = useStore(authStore, (state) => state.theme);
  const locale = language === "en-US" ? enUS : language === "ja-JP" ? jaJP : zhCN;

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const themeConfig = useMemo(() => ({
    algorithm: theme === "dark" ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: "#4f46e5",
      borderRadius: 10,
    },
  }), [theme]);

  return (
    <ConfigProvider locale={locale} theme={themeConfig}>
      <AntdApp>{children}</AntdApp>
    </ConfigProvider>
  );
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AntdProvider>
        <App />
      </AntdProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
