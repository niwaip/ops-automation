import type {
  AIMatchResponse,
  CreateSkillDTO,
  GrantSkillDTO,
  LLMUsage,
  ParamsSchema,
  SkillConfigDto,
  SkillMatchResult,
  SkillPermissionDTO,
  SkillRuntimeMetadata,
  SkillToolBinding,
  SkillToolValidationMessage,
  SkillToolValidationResult,
  SkillValidationResult,
} from '../../../../core/platform/src/modules/skill/interfaces';
import { SkillModule as PlatformSkillModule } from '../../../../core/platform/src/modules/skill/skill.module';
import { SkillService as PlatformSkillService } from '../../../../core/platform/src/modules/skill/skill.service';
import { SkillController as PlatformSkillController } from '../../../../core/platform/src/modules/skill/skill.controller';
import { SkillAccessService as PlatformSkillAccessService } from '../../../../core/platform/src/modules/skill/skill-access.service';
import { SkillEnrichmentService as PlatformSkillEnrichmentService } from '../../../../core/platform/src/modules/skill/skill-enrichment.service';

export type {
  AIMatchResponse,
  CreateSkillDTO,
  GrantSkillDTO,
  LLMUsage,
  ParamsSchema,
  SkillConfigDto,
  SkillMatchResult,
  SkillPermissionDTO,
  SkillRuntimeMetadata,
  SkillToolBinding,
  SkillToolValidationMessage,
  SkillToolValidationResult,
  SkillValidationResult,
};
export {
  PlatformSkillAccessService as SkillAccessService,
  PlatformSkillController as SkillController,
  PlatformSkillEnrichmentService as SkillEnrichmentService,
  PlatformSkillModule as SkillModule,
  PlatformSkillService as SkillService,
};

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
