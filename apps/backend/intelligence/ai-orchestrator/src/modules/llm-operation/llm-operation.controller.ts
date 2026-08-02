import { Controller, Post, Get, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { LlmOperationService } from './llm-operation.service';
import type { ExecuteLlmOperationDto } from './llm-operation.service';

@Controller('ai/operations')
export class LlmOperationController {
  constructor(private readonly llmOperationService: LlmOperationService) {}

  @Post('execute')
  @HttpCode(HttpStatus.OK)
  async execute(@Body() dto: ExecuteLlmOperationDto) {
    return this.llmOperationService.executeOperation(dto);
  }

  /**
   * Machine-readable operation definition (incl. authoritative input/output
   * schemas), consumed by the control plane at plan freeze time (§6.4).
   */
  @Get(':operationId')
  getDefinition(@Param('operationId') operationId: string) {
    return this.llmOperationService.getOperationDefinition(operationId);
  }
}
