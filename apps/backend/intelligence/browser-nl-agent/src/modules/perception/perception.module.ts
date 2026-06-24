import { Module } from '@nestjs/common';
import { GoalInterpreterService } from './goal-interpreter.service';
import { PageObservationService } from './page-observation.service';

@Module({
  providers: [GoalInterpreterService, PageObservationService],
  exports: [GoalInterpreterService, PageObservationService],
})
export class PerceptionModule {}
