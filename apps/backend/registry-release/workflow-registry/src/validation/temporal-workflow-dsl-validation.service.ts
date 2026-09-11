import { Injectable } from '@nestjs/common';
import { TemporalWorkflowSupportService } from '../temporal/temporal-workflow-support.service';
import type {
  ActivityDsl,
  TemporalValidationResult,
  WorkflowDsl,
} from '../temporal/temporal-workflow.types';

@Injectable()
export class TemporalWorkflowDslValidationService {
  constructor(private readonly workflowSupportService: TemporalWorkflowSupportService) {}

  async validate(
    workflowDsl: WorkflowDsl,
    activityDsl: ActivityDsl
  ): Promise<TemporalValidationResult> {
    return this.workflowSupportService.validateDsl(workflowDsl, activityDsl);
  }
}
