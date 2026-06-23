import { useEffect, useMemo } from 'react';
import { useQuery } from 'react-query';
import { useStore } from 'zustand';
import { notificationApi } from '../api';
import { authStore } from '../adapters/auth/authStore';
import { notificationStore } from '../adapters/notifications/notificationStore';

const ACTIVE_POLLING_INTERVAL_MS = 10000;
const IDLE_POLLING_INTERVAL_MS = 60000;

export function UserRuntimeEffects() {
  const isAuthenticated = useStore(authStore, (state) => state.isAuthenticated);
  const accessToken = useStore(authStore, (state) => state.accessToken);
  const refreshToken = useStore(authStore, (state) => state.refreshToken);
  const items = useStore(notificationStore, (state) => state.items);
  const syncNotifications = useStore(notificationStore, (state) => state.syncNotifications);
  const resetNotifications = useStore(notificationStore, (state) => state.reset);
  const hasSession = isAuthenticated && Boolean(accessToken || refreshToken);

  const hasPendingNotifications = useMemo(() => items.some((item) => item.requiresAction), [items]);

  const { refetch } = useQuery(
    ['user-web-notifications'],
    () => notificationApi.list({ limit: 100 }),
    {
      enabled: hasSession,
      refetchInterval: () => {
        if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
          return false;
        }
        return hasPendingNotifications ? ACTIVE_POLLING_INTERVAL_MS : IDLE_POLLING_INTERVAL_MS;
      },
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
      keepPreviousData: true,
      onSuccess: (data) => {
        syncNotifications(data.items);
      },
    }
  );

  useEffect(() => {
    if (!hasSession) {
      resetNotifications();
    }
  }, [hasSession, resetNotifications]);

  useEffect(() => {
    if (!hasSession || typeof window === 'undefined') {
      return;
    }

    const refreshIfVisible = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        void refetch();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refetch();
      }
    };

    window.addEventListener('focus', refreshIfVisible);
    window.addEventListener('online', refreshIfVisible);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', refreshIfVisible);
      window.removeEventListener('online', refreshIfVisible);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [hasSession, refetch]);

  return null;
}
