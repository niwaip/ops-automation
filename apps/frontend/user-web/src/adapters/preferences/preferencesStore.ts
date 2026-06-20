import { createPreferencesStore, type PreferencesStoreState } from '@ops/user-core';
import { useStore } from 'zustand';
import { browserI18n } from '../i18n/browserI18n';
import { browserStorage } from '../storage/browserStorage';

export const preferencesStore = createPreferencesStore({
  storage: browserStorage,
  i18n: browserI18n,
});

export const usePreferencesStore = <T>(selector: (state: PreferencesStoreState) => T): T =>
  useStore(preferencesStore, selector);
