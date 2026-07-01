import { Module } from '@nestjs/common';
import { SemanticRuleSetModule } from '../browser-domain-semantics.bridge';
import { SemanticRuleGenerationController } from './semantic-rule-generation.controller';
import { SemanticRuleGenerationService } from './semantic-rule-generation.service';

@Module({
  imports: [SemanticRuleSetModule],
  controllers: [SemanticRuleGenerationController],
  providers: [SemanticRuleGenerationService],
  exports: [SemanticRuleGenerationService],
})
export class SemanticRuleGenerationModule {}
