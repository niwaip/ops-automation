import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from 'react-query';
import { AntdProvider } from './app/providers/AntdProvider';
import App from './app/App';
import './index.css';
import { browserI18n } from './adapters/i18n/browserI18n';
import { preferencesStore } from './adapters/preferences/preferencesStore';

// Initialize i18n synchronously before rendering to prevent React hook order issues
browserI18n.changeLanguage(preferencesStore.getState().language);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AntdProvider>
        <App />
      </AntdProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
