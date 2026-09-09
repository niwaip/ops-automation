import { apiClient } from './index';

export type CredentialCategory =
  | 'api_key'
  | 'device_key'
  | 'basic_auth'
  | 'bearer_token'
  | 'custom';

export interface MaskedPreview {
  summary: string;
  fields: Record<string, string>;
}

export interface UserCredentialItem {
  id: string;
  userId: string;
  orgId?: string | null;
  name: string;
  category: CredentialCategory;
  description?: string | null;
  maskedPreview: MaskedPreview;
  status: string;
  expiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
  bindingCount?: number;
}

export interface CreateCredentialRequest {
  name: string;
  category: CredentialCategory;
  description?: string;
  payload: Record<string, any>;
  expiresAt?: string;
}

export interface UpdateCredentialRequest {
  name?: string;
  description?: string;
  payload?: Record<string, any>;
  status?: string;
  expiresAt?: string;
}

export interface SkillCredentialFieldRequirement {
  paramName: string;
  title: string;
  description?: string;
  credentialCategory: CredentialCategory;
  required: boolean;
  boundCredential?: {
    id: string;
    name: string;
    category: CredentialCategory;
    maskedPreview: MaskedPreview;
  } | null;
}

export interface SkillCredentialStatus {
  skillId: string;
  skillName: string;
  hasCredentialRequirements: boolean;
  isFullyConfigured: boolean;
  fields: SkillCredentialFieldRequirement[];
}

export interface BindSkillCredentialRequest {
  paramName: string;
  credentialId: string;
}

export const credentialApi = {
  list: async (category?: string): Promise<UserCredentialItem[]> => {
    return apiClient.get('/credentials', { params: category ? { category } : undefined });
  },

  get: async (id: string): Promise<UserCredentialItem> => {
    return apiClient.get(`/credentials/${id}`);
  },

  create: async (data: CreateCredentialRequest): Promise<UserCredentialItem> => {
    return apiClient.post('/credentials', data);
  },

  update: async (id: string, data: UpdateCredentialRequest): Promise<UserCredentialItem> => {
    return apiClient.put(`/credentials/${id}`, data);
  },

  delete: async (id: string): Promise<{ success: boolean }> => {
    return apiClient.delete(`/credentials/${id}`);
  },

  getSkillStatus: async (skillId: string): Promise<SkillCredentialStatus> => {
    return apiClient.get(`/credentials/skills/${encodeURIComponent(skillId)}/status`);
  },

  bindSkill: async (
    skillId: string,
    data: BindSkillCredentialRequest
  ): Promise<{ success: boolean; bindingId: string }> => {
    return apiClient.post(`/credentials/skills/${encodeURIComponent(skillId)}/bind`, data);
  },

  unbindSkill: async (
    skillId: string,
    paramName: string
  ): Promise<{ success: boolean }> => {
    return apiClient.delete(
      `/credentials/skills/${encodeURIComponent(skillId)}/bind/${encodeURIComponent(paramName)}`
    );
  },
};
