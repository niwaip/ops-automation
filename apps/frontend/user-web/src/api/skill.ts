import {
  type PublishedSkillCatalogItem,
  type SkillAccessRequest,
  type SkillConfig,
  type SkillParamsSchema,
} from '@ops/user-core';
import { skillApi } from './index';

export interface SkillConfigDTO extends SkillConfig {
  carboneSkillId?: string;
}

export type { SkillParamsSchema };
export type { PublishedSkillCatalogItem, SkillAccessRequest };

export { skillApi };

export default skillApi;
