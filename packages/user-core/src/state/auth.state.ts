import { createStore, type StoreApi } from "zustand/vanilla";
import type { UserDto } from "../types/user.types.js";
import type { StoragePort } from "../ports/storage.port.js";

export interface AuthStateData {
  accessToken: string | null;
  refreshToken: string | null;
  user: UserDto | null;
  isAuthenticated: boolean;
}

export interface AuthStateActions {
  setTokens: (accessToken: string, refreshToken: string) => void;
  setUser: (user: UserDto | null) => void;
  login: (accessToken: string, refreshToken: string, user: UserDto) => void;
  logout: () => void;
}

export type AuthStoreState = AuthStateData & AuthStateActions;
export type AuthStore = StoreApi<AuthStoreState>;

export interface CreateAuthStoreOptions {
  storage?: StoragePort;
  onLogout?: () => void;
  storageKey?: string;
}

const defaultState: AuthStateData = {
  accessToken: null,
  refreshToken: null,
  user: null,
  isAuthenticated: false,
};

const loadPersistedState = (
  storageKey: string,
  storage?: StoragePort,
): Partial<AuthStateData> => {
  if (!storage) {
    return {};
  }

  try {
    const raw = storage.getItem(storageKey);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Partial<AuthStateData>;
    return {
      accessToken: typeof parsed.accessToken === "string" ? parsed.accessToken : null,
      refreshToken: typeof parsed.refreshToken === "string" ? parsed.refreshToken : null,
      user: parsed.user ?? null,
      isAuthenticated: Boolean(parsed.accessToken || parsed.refreshToken),
    };
  } catch {
    return {};
  }
};

const persistState = (
  storageKey: string,
  storage: StoragePort | undefined,
  state: AuthStateData,
): void => {
  if (!storage) {
    return;
  }

  storage.setItem(
    storageKey,
    JSON.stringify({
      accessToken: state.accessToken,
      refreshToken: state.refreshToken,
      user: state.user,
      isAuthenticated: state.isAuthenticated,
    }),
  );
};

export const createAuthStore = (options: CreateAuthStoreOptions = {}): AuthStore => {
  const storageKey = options.storageKey || "ops-user-auth";
  const initialState: AuthStateData = {
    ...defaultState,
    ...loadPersistedState(storageKey, options.storage),
  };

  const store = createStore<AuthStoreState>()((set, get) => ({
    ...initialState,
    setTokens: (accessToken, refreshToken) => {
      set({
        accessToken,
        refreshToken,
        isAuthenticated: Boolean(accessToken || refreshToken),
      });
      persistState(storageKey, options.storage, get());
    },
    setUser: (user) => {
      set({
        user,
        isAuthenticated: Boolean(get().accessToken || get().refreshToken),
      });
      persistState(storageKey, options.storage, get());
    },
    login: (accessToken, refreshToken, user) => {
      set({
        accessToken,
        refreshToken,
        user,
        isAuthenticated: true,
      });
      persistState(storageKey, options.storage, get());
    },
    logout: () => {
      set({
        accessToken: null,
        refreshToken: null,
        user: null,
        isAuthenticated: false,
      });
      persistState(storageKey, options.storage, get());
      options.onLogout?.();
    },
  }));

  persistState(storageKey, options.storage, store.getState());
  return store;
};
