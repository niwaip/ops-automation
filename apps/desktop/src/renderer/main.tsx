import ReactDOM from 'react-dom/client';
import { createAuthStore } from '@ops/user-core';
import { desktopRuntimeConfig } from './adapters/runtime/runtimeConfig';
import { ExecutionListExample } from './examples/execution-list.example';

const authStore = createAuthStore();

function DesktopApp() {
  return (
    <main>
      <h1>Desktop Renderer Scaffold</h1>
      <p>API base: {desktopRuntimeConfig.apiBaseUrl}</p>
      <p>Authenticated: {String(authStore.getState().isAuthenticated)}</p>
      <ExecutionListExample />
    </main>
  );
}

const root = document.getElementById('root');

if (root) {
  ReactDOM.createRoot(root).render(<DesktopApp />);
}
