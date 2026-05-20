import { apiClient } from './client';
import type {
  AppNotification,
  NotificationSource,
} from '@/shared/notifications/types';

export interface NotificationListResponse {
  items: AppNotification[];
  total: number;
}

export interface NotificationListParams {
  source?: NotificationSource;
  limit?: number;
  requiresActionOnly?: boolean;
}

export const notificationApi = {
  list: (params?: NotificationListParams) => (
    apiClient.get<NotificationListResponse>('/notifications', {
      params,
    })
  ),
};

export default notificationApi;
