import { Module } from '@nestjs/common';
import { ModelModule } from '../model/model.module';
import { LlmOperationController } from './llm-operation.controller';
import { LlmOperationService } from './llm-operation.service';

@Module({
  imports: [ModelModule],
  controllers: [LlmOperationController],
  providers: [LlmOperationService],
  exports: [LlmOperationService],
})
export class LlmOperationModule {}
