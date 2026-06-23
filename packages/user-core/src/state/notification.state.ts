import { createStore, type StoreApi } from 'zustand/vanilla';
import type { AppNotification } from '../types/notification.types.js';

export interface NotificationStateData {
  items: AppNotification[];
  initialized: boolean;
  entityStateMap: Record<string, string>;
}

export interface NotificationStateActions {
  syncNotifications: (notifications: AppNotification[]) => void;
  upsertNotification: (notification: AppNotification, markUnread?: boolean) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  reset: () => void;
}

export type NotificationStoreState = NotificationStateData & NotificationStateActions;
export type NotificationStore = StoreApi<NotificationStoreState>;

const sortAndLimitItems = (items: AppNotification[]): AppNotification[] =>
  items
    .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
    .slice(0, 20);

const defaultState: NotificationStateData = {
  items: [],
  initialized: false,
  entityStateMap: {},
};

export const createNotificationStore = (): NotificationStore =>
  createStore<NotificationStoreState>()((set) => ({
    ...defaultState,

    syncNotifications: (notifications) =>
      set((state) => {
        const nextEntityStateMap: Record<string, string> = {
          ...state.entityStateMap,
        };

        const nextItems = notifications.map<AppNotification>((notification) => {
          const existingItem = state.items.find(
            (item) => item.dedupeKey === notification.dedupeKey
          );
          const nextStateKey =
            notification.stateKey || notification.status || notification.timestamp;
          const previousStateKey = state.entityStateMap[notification.dedupeKey];
          const shouldMarkUnread = state.initialized
            ? !existingItem || previousStateKey !== nextStateKey
            : false;

          nextEntityStateMap[notification.dedupeKey] = nextStateKey;

          return {
            ...notification,
            unread: existingItem
              ? shouldMarkUnread
                ? true
                : existingItem.unread
              : shouldMarkUnread,
          };
        });

        return {
          items: sortAndLimitItems(nextItems),
          initialized: true,
          entityStateMap: nextEntityStateMap,
        };
      }),

    upsertNotification: (notification, markUnread = true) =>
      set((state) => {
        const nextStateKey = notification.stateKey || notification.status || notification.timestamp;
        const previousStateKey = state.entityStateMap[notification.dedupeKey];
        const existingItem = state.items.find((item) => item.dedupeKey === notification.dedupeKey);
        const hasChanged = !existingItem || previousStateKey !== nextStateKey;
        const nextItems = state.items.filter((item) => item.dedupeKey !== notification.dedupeKey);

        nextItems.push({
          ...notification,
          unread: markUnread && hasChanged ? true : existingItem?.unread || false,
        });

        return {
          items: sortAndLimitItems(nextItems),
          initialized: true,
          entityStateMap: {
            ...state.entityStateMap,
            [notification.dedupeKey]: nextStateKey,
          },
        };
      }),

    markAsRead: (id) =>
      set((state) => ({
        items: state.items.map((item) => (item.id === id ? { ...item, unread: false } : item)),
      })),

    markAllAsRead: () =>
      set((state) => ({
        items: state.items.map((item) => ({ ...item, unread: false })),
      })),

    reset: () => set(defaultState),
  }));
