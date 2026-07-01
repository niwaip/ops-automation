import { type AuthStoreState } from '@ops/user-core';
import { useStore } from 'zustand';
import { authStore } from '@/adapters/auth/authStore';

type UseAuthStore = {
  (): AuthStoreState;
  <T>(selector: (state: AuthStoreState) => T): T;
  getState: typeof authStore.getState;
  setState: typeof authStore.setState;
  subscribe: typeof authStore.subscribe;
};

const identity = (state: AuthStoreState): AuthStoreState => state;

function useAuthStoreImpl(): AuthStoreState;
function useAuthStoreImpl<T>(selector: (state: AuthStoreState) => T): T;
function useAuthStoreImpl<T>(selector?: (state: AuthStoreState) => T): AuthStoreState | T {
  return useStore(authStore, (selector ?? identity) as (state: AuthStoreState) => T);
}

export const useAuthStore = Object.assign(useAuthStoreImpl as UseAuthStore, {
  getState: authStore.getState,
  setState: authStore.setState,
  subscribe: authStore.subscribe,
});
