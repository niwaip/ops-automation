import { useEffect, useMemo } from "react";
import { useQuery } from "react-query";
import type { AppNotification } from "@ops/user-core";
import { useStore } from "zustand";
import { notificationApi } from "../api";
import { authStore } from "../adapters/auth/authStore";
import { notificationStore } from "../adapters/notifications/notificationStore";
import { runtimeSocket } from "../adapters/socket/runtimeSocket";

const ACTIVE_POLLING_INTERVAL_MS = 10000;
const IDLE_POLLING_INTERVAL_MS = 60000;
const SOCKET_NOTIFICATION_EVENTS = ["notification", "execution.notification", "report.notification"];

const isAppNotification = (value: unknown): value is AppNotification => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string"
    && typeof candidate.dedupeKey === "string"
    && typeof candidate.source === "string"
    && typeof candidate.sourceId === "string"
    && typeof candidate.severity === "string"
    && typeof candidate.category === "string"
    && typeof candidate.stateKey === "string"
    && typeof candidate.timestamp === "string"
    && typeof candidate.unread === "boolean"
    && typeof candidate.requiresAction === "boolean"
    && typeof candidate.actionUrl === "string"
  );
};

export function UserRuntimeEffects() {
  const isAuthenticated = useStore(authStore, (state) => state.isAuthenticated);
  const accessToken = useStore(authStore, (state) => state.accessToken);
  const refreshToken = useStore(authStore, (state) => state.refreshToken);
  const items = useStore(notificationStore, (state) => state.items);
  const syncNotifications = useStore(notificationStore, (state) => state.syncNotifications);
  const upsertNotification = useStore(notificationStore, (state) => state.upsertNotification);
  const resetNotifications = useStore(notificationStore, (state) => state.reset);
  const hasSession = isAuthenticated && Boolean(accessToken || refreshToken);

  const hasPendingNotifications = useMemo(
    () => items.some((item) => item.requiresAction),
    [items],
  );

  useQuery(
    ["user-web-notifications"],
    () => notificationApi.list({ limit: 100 }),
    {
      enabled: hasSession,
      refetchInterval: hasPendingNotifications ? ACTIVE_POLLING_INTERVAL_MS : IDLE_POLLING_INTERVAL_MS,
      keepPreviousData: true,
      onSuccess: (data) => {
        syncNotifications(data.items);
      },
    },
  );

  useEffect(() => {
    if (!hasSession) {
      runtimeSocket.disconnect();
      resetNotifications();
      return;
    }

    // Keep socket lifecycle in the App layer so login, token refresh, and logout
    // always rebind notification subscriptions from a single place.
    const subscriptions = SOCKET_NOTIFICATION_EVENTS.map((event) => runtimeSocket.subscribe(event, (payload) => {
      if (isAppNotification(payload)) {
        upsertNotification(payload, true);
      }
    }));

    void Promise.resolve(runtimeSocket.connect()).catch(() => undefined);

    return () => {
      subscriptions.forEach((subscription) => subscription.unsubscribe());
      runtimeSocket.disconnect();
    };
  }, [accessToken, hasSession, resetNotifications, upsertNotification]);

  return null;
}
