import { Body, Controller, Post } from '@nestjs/common';
import {
  CommitSemanticRuleSetDraftDto,
  GenerateSemanticRuleSetDraftDto,
} from './semantic-rule-generation.dto';
import { SemanticRuleGenerationService } from './semantic-rule-generation.service';

@Controller('semantic-rule-generations')
export class SemanticRuleGenerationController {
  constructor(
    private readonly semanticRuleGenerationService: SemanticRuleGenerationService
  ) {}

  @Post('draft')
  async generateDraft(@Body() body: GenerateSemanticRuleSetDraftDto) {
    return this.semanticRuleGenerationService.generateDraft(body);
  }

  @Post('draft/commit')
  async commitDraft(@Body() body: CommitSemanticRuleSetDraftDto) {
    return this.semanticRuleGenerationService.commitDraft(body);
  }
}
