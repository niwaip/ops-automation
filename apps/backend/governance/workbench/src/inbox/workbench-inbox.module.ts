import { Module } from "@nestjs/common";
import { UserConnectionModule } from "../connection/user-connection.module";
import { WorkbenchTodoModule } from "../todo/workbench-todo.module";
import { WorkbenchInboxController } from "./workbench-inbox.controller";
import { WorkbenchInboxService } from "./workbench-inbox.service";
import { WorkbenchInboxIngestionService } from "./workbench-inbox-ingestion.service";
import { WorkbenchInboxClarifierService } from "./workbench-inbox-clarifier.service";
import { EmailInboxSyncService } from "./workflow/email-inbox-sync.service";
import { EmailInboxSyncController } from "./workflow/email-inbox-sync.controller";
import { ExecutionInterventionGateService } from "./interceptor/execution-intervention-gate.service";
import { ExecutionInterventionGateController } from "./interceptor/execution-intervention-gate.controller";
import { WorkbenchInboxInternalController } from "./workbench-inbox-internal.controller";

@Module({
  imports: [WorkbenchTodoModule, UserConnectionModule],
  controllers: [
    WorkbenchInboxController,
    EmailInboxSyncController,
    ExecutionInterventionGateController,
    WorkbenchInboxInternalController,
  ],
  providers: [
    WorkbenchInboxService,
    WorkbenchInboxIngestionService,
    WorkbenchInboxClarifierService,
    EmailInboxSyncService,
    ExecutionInterventionGateService,
  ],
  exports: [
    WorkbenchInboxService,
    EmailInboxSyncService,
    ExecutionInterventionGateService,
  ],
})
export class WorkbenchInboxModule {}
