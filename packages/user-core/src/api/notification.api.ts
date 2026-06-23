import type { ApiClient } from './client.js';
import type { AppNotification, NotificationSource } from '../types/notification.types.js';

export interface NotificationListParams {
  source?: NotificationSource;
  limit?: number;
  requiresActionOnly?: boolean;
}

export interface NotificationListResponse {
  items: AppNotification[];
  total: number;
}

export const createNotificationApi = (client: ApiClient) => ({
  list: async (params?: NotificationListParams): Promise<NotificationListResponse> =>
    client.get('/notifications', { params }),
});
