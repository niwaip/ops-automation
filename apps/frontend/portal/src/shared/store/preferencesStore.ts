import { createPreferencesStore, type PreferencesStoreState } from '@ops/user-core';
import { useStore } from 'zustand';
import i18n from '@/shared/i18n';
import { browserStorage } from '@/adapters/storage/browserStorage';

export const preferencesStore = createPreferencesStore({
  storage: browserStorage,
  i18n: {
    changeLanguage: async (language) => {
      await i18n.changeLanguage(language);
    },
  },
  storageKey: 'portal-preferences',
});

type UsePreferencesStore = {
  (): PreferencesStoreState;
  <T>(selector: (state: PreferencesStoreState) => T): T;
  getState: typeof preferencesStore.getState;
  setState: typeof preferencesStore.setState;
  subscribe: typeof preferencesStore.subscribe;
};

const identity = (state: PreferencesStoreState): PreferencesStoreState => state;

function usePreferencesStoreImpl(): PreferencesStoreState;
function usePreferencesStoreImpl<T>(selector: (state: PreferencesStoreState) => T): T;
function usePreferencesStoreImpl<T>(
  selector?: (state: PreferencesStoreState) => T
): PreferencesStoreState | T {
  return useStore(preferencesStore, (selector ?? identity) as (state: PreferencesStoreState) => T);
}

export const usePreferencesStore = Object.assign(usePreferencesStoreImpl as UsePreferencesStore, {
  getState: preferencesStore.getState,
  setState: preferencesStore.setState,
  subscribe: preferencesStore.subscribe,
});
