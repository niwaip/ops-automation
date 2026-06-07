import { createAuthStore, type AuthSessionPort, type UserDto } from "@ops/user-core";
import { notificationStore } from "../notifications/notificationStore";
import { browserStorage } from "../storage/browserStorage";
import {
  redirectToLogin,
  redirectToSsoLogin,
  resolveSsoCallbackUrl,
} from "./navigation";

interface SsoCallbackResponse {
  accessToken: string;
  refreshToken: string;
  user: UserDto;
}

export const authStore = createAuthStore({
  storage: browserStorage,
  onLogout: () => {
    notificationStore.getState().reset();
    redirectToLogin();
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
  onUnauthorized: redirectToLogin,
  initiateLogin: () => {
    redirectToSsoLogin();
  },
  handleCallback: async (code) => {
    const response = await fetch(resolveSsoCallbackUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code }),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || "SSO 登录失败");
    }

    const payload = await response.json() as SsoCallbackResponse;
    authStore.getState().login(payload.accessToken, payload.refreshToken, payload.user);
  },
};
