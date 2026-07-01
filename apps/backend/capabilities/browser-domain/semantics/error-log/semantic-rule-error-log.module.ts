import { Module } from '@nestjs/common';
import { SemanticRuleErrorLogController } from './semantic-rule-error-log.controller';
import { SemanticRuleErrorLogService } from './semantic-rule-error-log.service';

@Module({
  controllers: [SemanticRuleErrorLogController],
  providers: [SemanticRuleErrorLogService],
  exports: [SemanticRuleErrorLogService],
})
export class SemanticRuleErrorLogModule {}
