import { createAuthStore, type AuthSessionPort } from "@ops/user-core";
import { browserStorage } from "../storage/browserStorage";

export const authStore = createAuthStore({
  storage: browserStorage,
  onLogout: () => {
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      window.location.assign("/login");
    }
  },
});

export const authSessionPort: AuthSessionPort = {
  getSnapshot: () => {
    const state = authStore.getState();
    return {
      accessToken: state.accessToken,
      refreshToken: state.refreshToken,
    };
  },
  setTokens: (accessToken, refreshToken) => {
    authStore.getState().setTokens(accessToken, refreshToken);
  },
  clearSession: () => {
    authStore.getState().logout();
  },
  onUnauthorized: () => {
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      window.location.assign("/login");
    }
  },
};
