import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ReminderController } from './reminder.controller';
import { ReminderService } from './reminder.service';
import { ReminderDispatcherService } from './reminder-dispatcher.service';

@Module({
  imports: [PrismaModule],
  controllers: [ReminderController],
  providers: [ReminderService, ReminderDispatcherService],
  exports: [ReminderService],
})
export class ReminderModule {}
