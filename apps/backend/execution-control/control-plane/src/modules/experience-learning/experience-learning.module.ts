import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import {
  HabitLearningAdminController,
  UserHabitController,
} from './habit-learning.controller';
import { HabitLearningRunnerService } from './habit-learning-runner.service';
import { HabitLearningService } from './habit-learning.service';
import { HabitAutoActivationService } from './habit-auto-activation.service';
import {
  RoutingObservationAdminController,
  RoutingObservationController,
} from './routing-observation.controller';
import { RoutingObservationService } from './routing-observation.service';

@Module({
  imports: [PrismaModule],
  controllers: [
    RoutingObservationController,
    RoutingObservationAdminController,
    HabitLearningAdminController,
    UserHabitController,
  ],
  providers: [
    RoutingObservationService,
    HabitAutoActivationService,
    HabitLearningService,
    HabitLearningRunnerService,
  ],
  exports: [RoutingObservationService, HabitLearningService],
})
export class ExperienceLearningModule {}
