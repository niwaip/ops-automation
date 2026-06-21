import { Module } from '@nestjs/common';
import { SemanticRuleHitLogController } from './semantic-rule-hit-log.controller';
import { SemanticRuleHitLogService } from './semantic-rule-hit-log.service';

@Module({
  controllers: [SemanticRuleHitLogController],
  providers: [SemanticRuleHitLogService],
  exports: [SemanticRuleHitLogService],
})
export class SemanticRuleHitLogModule {}
