import { Module } from '@nestjs/common';
import { SchedulerController } from './scheduler.controller';
import { SchedulerService } from './scheduler.service';
import { ExecutionModule } from '../execution/execution.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SavedSkillModule } from '../saved-skill/saved-skill.module';
import { ScheduleFireService } from './schedule-fire.service';
import { ScheduleFireDispatcherService } from './schedule-fire-dispatcher.service';

@Module({
  imports: [PrismaModule, ExecutionModule, SavedSkillModule],
  controllers: [SchedulerController],
  providers: [SchedulerService, ScheduleFireService, ScheduleFireDispatcherService],
  exports: [SchedulerService, ScheduleFireService],
})
export class SchedulerModule {}
