import { Injectable } from '@nestjs/common';
import { TemporalWorkflowSupportService } from '../../modules/temporal-workflow/temporal-workflow-support.service';
import type { TemporalWorkflowSessionSupport } from '../../modules/temporal-workflow/temporal-workflow-session.service';

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
