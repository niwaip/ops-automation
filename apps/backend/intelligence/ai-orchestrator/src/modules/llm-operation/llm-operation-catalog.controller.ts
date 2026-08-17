import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { LlmOperationService } from './llm-operation.service';
import type { LlmOperationCatalogProjection } from './llm-operation-catalog.projector';

@Controller('ai/internal/operations/catalog')
export class LlmOperationCatalogController {
  constructor(private readonly llmOperationService: LlmOperationService) {}

  @Get()
  async list(): Promise<{ operations: LlmOperationCatalogProjection[] }> {
    const operations = await this.llmOperationService.listOperationCatalog();
    return { operations };
  }

  @Get(':operationId')
  async getEntry(@Param('operationId') operationId: string): Promise<LlmOperationCatalogProjection> {
    const entry = await this.llmOperationService.getCatalogEntry(operationId);
    if (!entry) {
      throw new NotFoundException(`LLM operation catalog entry '${operationId}' not found`);
    }
    return entry;
  }
}