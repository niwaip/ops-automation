import type { ApiClient } from './client.js';
import type { SkillConfig } from '../types/skill.types.js';

export const createSkillApi = (client: ApiClient) => ({
  list: async (): Promise<{ skills: SkillConfig[] }> => client.get('/skills'),
  getById: async (id: string): Promise<SkillConfig> => client.get(`/skills/${id}`),
});
