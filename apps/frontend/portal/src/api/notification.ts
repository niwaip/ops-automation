import {
  createNotificationApi,
  type AppNotification,
  type NotificationListParams,
  type NotificationListResponse,
  type NotificationSource,
} from '@ops/user-core';
import { apiClient } from './client';

export type {
  AppNotification,
  NotificationListParams,
  NotificationListResponse,
  NotificationSource,
};

export const notificationApi = createNotificationApi(apiClient);

export default notificationApi;
