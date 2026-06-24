import { Module } from '@nestjs/common';
import { ActionSelectionService } from './action-selection.service';
import { SessionMemoryService } from './session-memory.service';

@Module({
  providers: [ActionSelectionService, SessionMemoryService],
  exports: [ActionSelectionService, SessionMemoryService],
})
export class ActionLoopModule {}
