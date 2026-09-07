export * from './interfaces';
export * from './skill-registry.ports';
export * from './skill-match-policy';
export { SkillAccessService } from './skill-access.service';
export { SkillController } from './skill.controller';
export { SkillEnrichmentService } from './skill-enrichment.service';
export { SkillMatcherService } from './skill-matcher.service';
export { SkillModule } from './skill.module';
export { SkillService } from './skill.service';
export { SkillToolBindingService } from './skill-tool-binding.service';
export { SkillValidationService } from './skill-validation.service';
export type {
  SkillValidationEmitter,
  SkillValidationStreamEvent,
} from './skill-validation.service';
export { ToolCatalogController } from './tool-catalog.controller';
export { ToolCatalogService } from './tool-catalog.service';

import type { SkillConfigDto } from './interfaces';

export function isActiveSkillConfig(
  skill: Pick<SkillConfigDto, 'isActive' | 'isPublished'>,
): boolean {
  return skill.isActive === true && skill.isPublished === true;
}

export function collectSkillTriggerKeywords(
  skill: Pick<SkillConfigDto, 'triggerKeywords'>,
): string[] {
  return [...new Set((skill.triggerKeywords || []).map((item) => String(item || '').trim()).filter(Boolean))].sort();
}
