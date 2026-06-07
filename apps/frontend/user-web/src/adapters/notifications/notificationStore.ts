import { createNotificationStore, type NotificationStoreState } from "@ops/user-core";
import { useStore } from "zustand";

export const notificationStore = createNotificationStore();

export const useNotificationStore = <T>(selector: (state: NotificationStoreState) => T): T =>
  useStore(notificationStore, selector);
