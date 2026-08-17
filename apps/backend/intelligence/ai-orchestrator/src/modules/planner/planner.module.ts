import { Module } from '@nestjs/common';
import { RecognizerModule } from '../recognizer/recognizer.module';
import { ModelModule } from '../model/model.module';
import { LlmOperationModule } from '../llm-operation/llm-operation.module';
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
import { NodeOutputBindingResolverService } from './binding/node-output-binding-resolver.service';
import { MultiNodeParameterBinderService } from './binding/multi-node-parameter-binder.service';
import { DeterministicContractAssemblerService } from './deterministic/deterministic-contract-assembler.service';

import { RoutingCapabilityCardProjector } from './candidate-selection/routing-capability-card.projector';
import { DeterministicTopologyPlannerService } from './topology/deterministic-topology-planner.service';
import { DeterministicTopologyValidatorService } from './topology/deterministic-topology-validator.service';
import { DeterministicRecipeMatcherService } from './topology/deterministic-recipe-matcher.service';
import { DeterministicRecipeTopologyBuilderService } from './topology/deterministic-recipe-topology-builder.service';

import { DeterministicPlanPresentationService } from './params/deterministic-plan-presentation.service';

@Module({
  imports: [RecognizerModule, ModelModule, LlmOperationModule],
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
    RoutingCapabilityCardProjector,
    DeterministicPlanGeneratorService,
    DeterministicTopologyPlannerService,
    DeterministicTopologyValidatorService,
    DeterministicRecipeMatcherService,
    DeterministicRecipeTopologyBuilderService,
    NodeOutputBindingResolverService,
    MultiNodeParameterBinderService,
    DeterministicContractAssemblerService,
    DeterministicPlanPresentationService,
  ],
  exports: [
    PlannerService,
    PlanRouteClassifierService,
    CapabilityCandidateSelectorService,
    RoutingCapabilityCardProjector,
    DeterministicPlanGeneratorService,
    DeterministicTopologyPlannerService,
    DeterministicTopologyValidatorService,
    NodeOutputBindingResolverService,
    MultiNodeParameterBinderService,
    DeterministicContractAssemblerService,
    DeterministicPlanPresentationService,
    SkillCacheService,
  ],
})
export class PlannerModule {}
