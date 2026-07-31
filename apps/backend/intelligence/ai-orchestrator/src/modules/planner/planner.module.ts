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
import { PlanRouteClassifierService } from './routing/plan-route-classifier.service';
import { CapabilityCandidateSelectorService } from './candidate-selection/capability-candidate-selector.service';
import { DeterministicPlanGeneratorService } from './deterministic/deterministic-plan-generator.service';
import { DeterministicPlanController } from './deterministic/deterministic-plan.controller';

@Module({
  imports: [RecognizerModule, ModelModule],
  controllers: [DeterministicPlanController],
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
    PlanRouteClassifierService,
    CapabilityCandidateSelectorService,
    DeterministicPlanGeneratorService,
  ],
  exports: [
    PlannerService,
    PlanRouteClassifierService,
    CapabilityCandidateSelectorService,
    DeterministicPlanGeneratorService,
    SkillCacheService,
  ],
})
export class PlannerModule {}
