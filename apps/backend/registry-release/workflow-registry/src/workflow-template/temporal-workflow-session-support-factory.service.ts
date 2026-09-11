import { Injectable } from '@nestjs/common';
import { TemporalWorkflowSupportService } from '../temporal/temporal-workflow-support.service';
import type { TemporalWorkflowSessionSupport } from '../temporal/temporal-workflow-session.service';

@Injectable()
export class TemporalWorkflowSessionSupportFactoryService {
  constructor(private readonly workflowSupportService: TemporalWorkflowSupportService) {}

  createSessionSupport(
    generateAiWorkflowDraft: TemporalWorkflowSessionSupport['generateAiWorkflowDraft'],
    refineAiWorkflowDraft: TemporalWorkflowSessionSupport['refineAiWorkflowDraft']
  ): TemporalWorkflowSessionSupport {
    return this.workflowSupportService.createSessionSupport(
      generateAiWorkflowDraft,
      refineAiWorkflowDraft
    );
  }
}
