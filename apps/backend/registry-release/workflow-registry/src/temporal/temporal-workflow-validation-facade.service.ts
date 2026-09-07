import { Injectable } from '@nestjs/common';
import { TemporalWorkflowValidationService } from './temporal-workflow-validation.service';

@Injectable()
export class TemporalWorkflowValidationFacadeService {
  constructor(private readonly validationService: TemporalWorkflowValidationService) {}

  async validateWorkflowReal(
    code: string,
    fn: string,
    input?: Record<string, any>,
    taskQueue?: string,
    timeout?: string
  ): Promise<{ success: boolean; logs: string[]; result?: any; error?: string; score: number }> {
    return this.validationService.validateWorkflowReal(code, fn, input, taskQueue, timeout);
  }

  async validateWorkflowRealStreaming(
    code: string,
    fn: string,
    input: Record<string, any> | undefined,
    taskQueue: string | undefined,
    timeout: string | undefined,
    onLog: (log: string) => void
  ): Promise<{
    success: boolean;
    result?: any;
    logs?: string[];
    traceback?: string;
    error?: string;
    score: number;
  }> {
    return this.validationService.validateWorkflowRealStreaming(
      code,
      fn,
      input,
      taskQueue,
      timeout,
      onLog
    );
  }
}
