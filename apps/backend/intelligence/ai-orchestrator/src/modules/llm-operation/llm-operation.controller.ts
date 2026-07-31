import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
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
}
