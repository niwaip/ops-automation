import { createStore, type StoreApi } from 'zustand/vanilla';
import type { I18nPort } from '../ports/i18n.port.js';
import type { StoragePort } from '../ports/storage.port.js';

export type Language = 'zh-CN' | 'en-US' | 'ja-JP';
export type ThemeMode = 'light' | 'dark';

export interface PreferencesStateData {
  language: Language;
  theme: ThemeMode;
  sidebarCollapsed: boolean;
}

export interface PreferencesStateActions {
  setLanguage: (language: Language) => Promise<void>;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

export type PreferencesStoreState = PreferencesStateData & PreferencesStateActions;
export type PreferencesStore = StoreApi<PreferencesStoreState>;

export interface CreatePreferencesStoreOptions {
  storage?: StoragePort;
  i18n?: I18nPort;
  storageKey?: string;
}

const defaultState: PreferencesStateData = {
  language: 'zh-CN',
  theme: 'light',
  sidebarCollapsed: false,
};

const loadPersistedState = (
  storageKey: string,
  storage?: StoragePort
): Partial<PreferencesStateData> => {
  if (!storage) {
    return {};
  }

  try {
    const raw = storage.getItem(storageKey);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Partial<PreferencesStateData>;
    return {
      language:
        parsed.language === 'en-US' || parsed.language === 'ja-JP' ? parsed.language : 'zh-CN',
      theme: parsed.theme === 'dark' ? 'dark' : 'light',
      sidebarCollapsed: Boolean(parsed.sidebarCollapsed),
    };
  } catch {
    return {};
  }
};

const persistState = (
  storageKey: string,
  storage: StoragePort | undefined,
  state: PreferencesStateData
): void => {
  if (!storage) {
    return;
  }

  storage.setItem(
    storageKey,
    JSON.stringify({
      language: state.language,
      theme: state.theme,
      sidebarCollapsed: state.sidebarCollapsed,
    })
  );
};

export const createPreferencesStore = (
  options: CreatePreferencesStoreOptions = {}
): PreferencesStore => {
  const storageKey = options.storageKey || 'ops-user-preferences';
  const initialState: PreferencesStateData = {
    ...defaultState,
    ...loadPersistedState(storageKey, options.storage),
  };

  const store = createStore<PreferencesStoreState>()((set, get) => ({
    ...initialState,
    setLanguage: async (language) => {
      await options.i18n?.changeLanguage(language);
      set({ language });
      persistState(storageKey, options.storage, get());
    },
    setTheme: (theme) => {
      set({ theme });
      persistState(storageKey, options.storage, get());
    },
    toggleTheme: () => {
      set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' }));
      persistState(storageKey, options.storage, get());
    },
    toggleSidebar: () => {
      set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }));
      persistState(storageKey, options.storage, get());
    },
    setSidebarCollapsed: (sidebarCollapsed) => {
      set({ sidebarCollapsed });
      persistState(storageKey, options.storage, get());
    },
  }));

  persistState(storageKey, options.storage, store.getState());
  return store;
};
