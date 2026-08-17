import { Module } from '@nestjs/common';
import { LlmOperationAuditService } from './llm-operation-audit.service';

@Module({
  providers: [LlmOperationAuditService],
  exports: [LlmOperationAuditService],
})
export class LlmOperationAuditModule {}