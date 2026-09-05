import { Module } from '@nestjs/common';
import { RecognizerModule } from '../recognizer/recognizer.module';
import { ModelModule } from '../model/model.module';
import { LlmOperationModule } from '../llm-operation/llm-operation.module';
import { PlannerService } from './facade';
import { PlannerMatchPhaseService } from './intent';
import { PlanGeneratorService, PlanSemanticService } from './plan';
import { PlannerPlanDraftService } from './planning';
import {
  DeterministicParamResolverService,
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
import { RoutingPolicyService } from './routing/routing-policy.service';
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
import { ExplicitSkillIntentService } from './topology/explicit-skill-intent.service';
import { UserHabitRouterService } from './habit/user-habit-router.service';
import { TaskCommandResolverService } from './policy/task-command-resolver.service';

import { DeterministicPlanPresentationService } from './params/deterministic-plan-presentation.service';
import {
  DisabledCandidateReranker,
  DisabledSemanticCandidateRetriever,
} from './candidate-selection/semantic-routing.port';
import { WorkflowAuthoringController } from './workflow-authoring/workflow-authoring.controller';
import { WorkflowAuthoringService } from './workflow-authoring/workflow-authoring.service';

@Module({
  imports: [RecognizerModule, ModelModule, LlmOperationModule],
  controllers: [DeterministicPlanController, WorkflowAuthoringController],
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
    DeterministicParamResolverService,
    RoutingPolicyService,
    PlanRouteClassifierService,
    CapabilityCandidateSelectorService,
    RoutingCapabilityCardProjector,
    DeterministicPlanGeneratorService,
    DeterministicTopologyPlannerService,
    DeterministicTopologyValidatorService,
    DeterministicRecipeMatcherService,
    DeterministicRecipeTopologyBuilderService,
    ExplicitSkillIntentService,
    NodeOutputBindingResolverService,
    MultiNodeParameterBinderService,
    DeterministicContractAssemblerService,
    DeterministicPlanPresentationService,
    DisabledSemanticCandidateRetriever,
    DisabledCandidateReranker,
    WorkflowAuthoringService,
    UserHabitRouterService,
    TaskCommandResolverService,
  ],
  exports: [
    PlannerService,
    RoutingPolicyService,
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
    DisabledSemanticCandidateRetriever,
    DisabledCandidateReranker,
    WorkflowAuthoringService,
    UserHabitRouterService,
    TaskCommandResolverService,
  ],
})
export class PlannerModule {}
