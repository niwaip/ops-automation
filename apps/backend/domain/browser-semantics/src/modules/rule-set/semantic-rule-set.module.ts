import { Module } from '@nestjs/common';
import { SemanticRuleSetController } from './semantic-rule-set.controller';
import { SemanticRuleSetService } from './semantic-rule-set.service';

@Module({
  controllers: [SemanticRuleSetController],
  providers: [SemanticRuleSetService],
  exports: [SemanticRuleSetService],
})
export class SemanticRuleSetModule {}
