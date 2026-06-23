import { createPreferencesStore } from '@ops/user-core';
import { mobileI18n } from '../adapters/i18n/mobileI18n';
import { memoryStorage } from '../adapters/storage/memoryStorage';

const preferencesStore = createPreferencesStore({
  storage: memoryStorage,
  i18n: mobileI18n,
});

export function App() {
  const snapshot = preferencesStore.getState();

  return (
    <main>
      <h1>Mobile Scaffold</h1>
      <p>Language: {snapshot.language}</p>
      <p>Status: ready for user-core integration.</p>
    </main>
  );
}
