import { createStore, type StoreApi } from "zustand/vanilla";
import type { UserDto } from "../types/user.types.js";
import type { I18nPort } from "../ports/i18n.port.js";
import type { StoragePort } from "../ports/storage.port.js";

export type Language = "zh-CN" | "en-US" | "ja-JP";
export type ThemeMode = "light" | "dark";

export interface AuthStateData {
  accessToken: string | null;
  refreshToken: string | null;
  user: UserDto | null;
  isAuthenticated: boolean;
  language: Language;
  theme: ThemeMode;
  sidebarCollapsed: boolean;
}

export interface AuthStateActions {
  setTokens: (accessToken: string, refreshToken: string) => void;
  setUser: (user: UserDto | null) => void;
  login: (accessToken: string, refreshToken: string, user: UserDto) => void;
  logout: () => void;
  setLanguage: (language: Language) => Promise<void>;
  toggleTheme: () => void;
  toggleSidebar: () => void;
}

export type AuthStoreState = AuthStateData & AuthStateActions;
export type AuthStore = StoreApi<AuthStoreState>;

export interface CreateAuthStoreOptions {
  storage?: StoragePort;
  i18n?: I18nPort;
  onLogout?: () => void;
}

const STORAGE_KEY = "ops-user-auth";

const defaultState: AuthStateData = {
  accessToken: null,
  refreshToken: null,
  user: null,
  isAuthenticated: false,
  language: "zh-CN",
  theme: "light",
  sidebarCollapsed: false,
};

const loadPersistedState = (storage?: StoragePort): Partial<AuthStateData> => {
  if (!storage) {
    return {};
  }

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Partial<AuthStateData>;
    return {
      accessToken: typeof parsed.accessToken === "string" ? parsed.accessToken : null,
      refreshToken: typeof parsed.refreshToken === "string" ? parsed.refreshToken : null,
      user: parsed.user ?? null,
      isAuthenticated: Boolean(parsed.accessToken || parsed.refreshToken),
      language: parsed.language === "en-US" || parsed.language === "ja-JP" ? parsed.language : "zh-CN",
      theme: parsed.theme === "dark" ? "dark" : "light",
      sidebarCollapsed: Boolean(parsed.sidebarCollapsed),
    };
  } catch {
    return {};
  }
};

const persistState = (storage: StoragePort | undefined, state: AuthStateData): void => {
  if (!storage) {
    return;
  }

  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      accessToken: state.accessToken,
      refreshToken: state.refreshToken,
      user: state.user,
      isAuthenticated: state.isAuthenticated,
      language: state.language,
      theme: state.theme,
      sidebarCollapsed: state.sidebarCollapsed,
    }),
  );
};

export const createAuthStore = (options: CreateAuthStoreOptions = {}): AuthStore => {
  const initialState: AuthStateData = {
    ...defaultState,
    ...loadPersistedState(options.storage),
  };

  const store = createStore<AuthStoreState>()((set, get) => ({
    ...initialState,
    setTokens: (accessToken, refreshToken) => {
      set({
        accessToken,
        refreshToken,
        isAuthenticated: Boolean(accessToken || refreshToken),
      });
      persistState(options.storage, get());
    },
    setUser: (user) => {
      set({
        user,
        isAuthenticated: Boolean(get().accessToken || get().refreshToken),
      });
      persistState(options.storage, get());
    },
    login: (accessToken, refreshToken, user) => {
      set({
        accessToken,
        refreshToken,
        user,
        isAuthenticated: true,
      });
      persistState(options.storage, get());
    },
    logout: () => {
      set({
        accessToken: null,
        refreshToken: null,
        user: null,
        isAuthenticated: false,
      });
      persistState(options.storage, get());
      options.onLogout?.();
    },
    setLanguage: async (language) => {
      await options.i18n?.changeLanguage(language);
      set({ language });
      persistState(options.storage, get());
    },
    toggleTheme: () => {
      set((state) => ({ theme: state.theme === "light" ? "dark" : "light" }));
      persistState(options.storage, get());
    },
    toggleSidebar: () => {
      set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }));
      persistState(options.storage, get());
    },
  }));

  persistState(options.storage, store.getState());
  return store;
};
