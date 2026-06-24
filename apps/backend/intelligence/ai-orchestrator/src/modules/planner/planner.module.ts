import { Module } from '@nestjs/common';
import { RecognizerModule } from '../recognizer/recognizer.module';
import { ModelModule } from '../model/model.module';
import { PlannerService } from './facade';
import { PlannerMatchPhaseService } from './intent';
import { PlanGeneratorService, PlanSemanticService } from './plan';
import { PlannerPlanDraftService } from './planning';
import {
  ParamBilingualService,
  ParamContextMergeService,
  ParamPolicyService,
  ParamRecognizerService,
  ParamRequiredInputPresentationService,
  ParamSchemaService,
  ParamValueService,
} from './params';
import { SkillCacheService, SkillMatcherService } from './skill';

@Module({
  imports: [RecognizerModule, ModelModule],
  providers: [
    PlannerService,
    PlannerMatchPhaseService,
    PlannerPlanDraftService,
    SkillCacheService,
    SkillMatcherService,
    PlanSemanticService,
    PlanGeneratorService,
    ParamSchemaService,
    ParamContextMergeService,
    ParamBilingualService,
    ParamPolicyService,
    ParamValueService,
    ParamRequiredInputPresentationService,
    ParamRecognizerService,
  ],
  exports: [PlannerService],
})
export class PlannerModule {}
