import { Injectable } from '@nestjs/common';
import { ExecutionFlowTemplateService } from './execution-flow-template.service';
import { ExecutionFlowValidationService } from './execution-flow-validation.service';
import type { ValidationResult } from './interfaces';

@Injectable()
export class ExecutionFlowValidationFacadeService {
  constructor(
    private readonly templateService: ExecutionFlowTemplateService,
    private readonly executionFlowValidationService: ExecutionFlowValidationService
  ) {}

  async validateTemplate(
    id: string,
    aiServiceUrl?: string,
    testParams?: Record<string, unknown>,
    enableExecutionTest?: boolean,
    testUserInput?: string
  ): Promise<ValidationResult> {
    const template = await this.templateService.getTemplate(id);
    if (!template) {
      throw new Error('Template not found');
    }

    return this.executionFlowValidationService.validateResolvedTemplate(
      id,
      template,
      aiServiceUrl,
      testParams,
      enableExecutionTest,
      testUserInput
    );
  }
}
