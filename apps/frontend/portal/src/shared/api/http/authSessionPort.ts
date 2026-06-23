import type { AuthSessionPort } from '@ops/user-core';
import { useAuthStore } from '@/shared/store/authStore';

const redirectToLogin = (): void => {
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.assign('/login');
  }
};

export const authSessionPort: AuthSessionPort = {
  getSnapshot: () => {
    const state = useAuthStore.getState();
    return {
      accessToken: state.accessToken,
      refreshToken: state.refreshToken,
    };
  },
  setTokens: (accessToken, refreshToken) => {
    useAuthStore.getState().setTokens(accessToken, refreshToken);
  },
  clearSession: () => {
    useAuthStore.getState().logout();
  },
  onUnauthorized: redirectToLogin,
};

export const handleUnauthorizedRedirect = redirectToLogin;
