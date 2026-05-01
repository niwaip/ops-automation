import { Module } from '@nestjs/common';
import { ExecutionController } from './execution.controller';
import { ExecutionEventService } from './execution-event.service';
import { ExecutionStateService } from './execution-state.service';
import { ExecutionStepService } from './execution-step.service';
import { ExecutionService } from './execution.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ExecutionController],
  providers: [ExecutionService, ExecutionEventService, ExecutionStateService, ExecutionStepService],
  exports: [ExecutionService, ExecutionEventService, ExecutionStateService, ExecutionStepService],
})
export class ExecutionModule {}
