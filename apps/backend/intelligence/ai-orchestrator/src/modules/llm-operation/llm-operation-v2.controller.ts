import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { LlmOperationV2RuntimeService } from './runtime/llm-operation-v2-runtime.service';
import type { ExecuteLlmOperationV2Request, LlmOperationV2Result } from './runtime/v2-runtime-types';

@Controller('ai/operations/v2')
export class LlmOperationV2Controller {
  constructor(private readonly v2Runtime: LlmOperationV2RuntimeService) {}

  @Post('execute')
  @HttpCode(HttpStatus.OK)
  async execute(@Body() request: ExecuteLlmOperationV2Request): Promise<LlmOperationV2Result> {
    return this.v2Runtime.execute(request);
  }
}