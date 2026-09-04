import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { WorkbenchTodoModule } from '../workbench-todo/workbench-todo.module';
import { WorkbenchInboxController } from './workbench-inbox.controller';
import { WorkbenchInboxService } from './workbench-inbox.service';
import { WorkbenchInboxIngestionService } from './workbench-inbox-ingestion.service';
import { WorkbenchInboxClarifierService } from './workbench-inbox-clarifier.service';

@Module({
  imports: [PrismaModule, WorkbenchTodoModule],
  controllers: [WorkbenchInboxController],
  providers: [
    WorkbenchInboxService,
    WorkbenchInboxIngestionService,
    WorkbenchInboxClarifierService,
  ],
  exports: [WorkbenchInboxService],
})
export class WorkbenchInboxModule {}
