import { apiClient, runtimeConfig } from './index';

const resolveControlPlanePath = (path: string): string => {
  const baseUrl = runtimeConfig.controlPlaneApiBaseUrl?.trim();
  return baseUrl ? `${baseUrl.replace(/\/+$/, '')}${path}` : path;
};

export interface UserHabit {
  id: string;
  kind: string;
  status: 'active' | 'disabled' | 'held' | 'expired';
  intentKey: string;
  savedSkillId?: string;
  savedVersion?: number;
  version: number;
  expiresAt?: string;
  updatedAt: string;
}

export interface UserPersonalizationState {
  personalization: {
    recommendationEnabled: boolean;
    updatedAt?: string;
  };
  habits: UserHabit[];
}

export const personalizationApi = {
  getState: (): Promise<UserPersonalizationState> =>
    apiClient.get(resolveControlPlanePath('/user-habits')),
  setEnabled: (recommendationEnabled: boolean): Promise<UserPersonalizationState> =>
    apiClient.patch(resolveControlPlanePath('/user-preferences/personalization'), {
      recommendationEnabled,
    }),
  setHabitStatus: (
    id: string,
    status: 'active' | 'disabled',
  ): Promise<UserPersonalizationState> =>
    apiClient.patch(resolveControlPlanePath(`/user-habits/${id}/status`), { status }),
  clear: (): Promise<{ cleared: true }> =>
    apiClient.delete(resolveControlPlanePath('/user-habits')),
};

