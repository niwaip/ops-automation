import { Module } from '@nestjs/common';
import { SemanticRuleRuntimeController } from './semantic-rule-runtime.controller';
import { SemanticRuleRuntimeService } from './semantic-rule-runtime.service';

@Module({
  controllers: [SemanticRuleRuntimeController],
  providers: [SemanticRuleRuntimeService],
  exports: [SemanticRuleRuntimeService],
})
export class SemanticRuleRuntimeModule {}
