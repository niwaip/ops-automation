import type { ApiClient } from './client.js';
import type {
  PublishedSkillCatalogItem,
  SkillAccessRequest,
  SkillConfig,
} from '../types/skill.types.js';

export const createSkillApi = (client: ApiClient) => ({
  list: async (): Promise<{ skills: SkillConfig[] }> => client.get('/skills'),
  listCatalog: async (): Promise<{ skills: PublishedSkillCatalogItem[] }> =>
    client.get('/skills/catalog'),
  getById: async (id: string): Promise<SkillConfig> => client.get(`/skills/${id}`),
  requestAccess: async (
    id: string,
    data?: { reason?: string }
  ): Promise<{ request: SkillAccessRequest }> => client.post(`/skills/${id}/access-requests`, data),
});
