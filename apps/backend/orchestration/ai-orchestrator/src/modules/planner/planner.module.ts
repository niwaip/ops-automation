import { Module } from '@nestjs/common';
import { RecognizerModule } from '../recognizer/recognizer.module';
import { ModelModule } from '../model/model.module';
import { PlannerService } from './planner.service';
import { PlanGeneratorService, PlanSemanticService } from './plan';
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
