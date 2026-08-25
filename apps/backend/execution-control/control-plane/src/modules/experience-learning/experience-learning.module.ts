import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { HabitLearningAdminController, UserHabitController } from './habit-learning.controller';
import { HabitLearningRunnerService } from './habit-learning-runner.service';
import { HabitLearningService } from './habit-learning.service';
import { HabitAutoActivationService } from './habit-auto-activation.service';
import {
  RoutingObservationAdminController,
  RoutingObservationController,
} from './routing-observation.controller';
import { RoutingObservationService } from './routing-observation.service';
import { PlanningDecisionController } from './planning-decision.controller';
import { PlanningDecisionService } from './planning-decision.service';
import { ModelInvocationLedgerController } from './model-invocation-ledger.controller';
import { ModelInvocationLedgerService } from './model-invocation-ledger.service';
import { ScopedMemoryService } from './scoped-memory.service';
import { ScopedMemoryController } from './scoped-memory.controller';
import { CandidateRecipeService } from './candidate-recipe.service';
import { CandidateRecipeController } from './candidate-recipe.controller';

@Module({
  imports: [PrismaModule],
  controllers: [
    RoutingObservationController,
    RoutingObservationAdminController,
    PlanningDecisionController,
    ModelInvocationLedgerController,
    HabitLearningAdminController,
    UserHabitController,
    ScopedMemoryController,
    CandidateRecipeController,
  ],
  providers: [
    RoutingObservationService,
    PlanningDecisionService,
    ModelInvocationLedgerService,
    ScopedMemoryService,
    CandidateRecipeService,
    HabitAutoActivationService,
    HabitLearningService,
    HabitLearningRunnerService,
  ],
  exports: [
    RoutingObservationService,
    PlanningDecisionService,
    ModelInvocationLedgerService,
    ScopedMemoryService,
    CandidateRecipeService,
    HabitLearningService,
  ],
})
export class ExperienceLearningModule {}
