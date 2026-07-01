import { Body, Controller, Param, Post } from '@nestjs/common';
import {
  PromoteSemanticRuleSetToActiveDto,
  PromoteSemanticRuleSetToCanaryDto,
  RollbackSemanticRuleSetDto,
} from './semantic-rule-release.dto';
import { SemanticRuleReleaseService } from './semantic-rule-release.service';

@Controller('semantic-rule-sets')
export class SemanticRuleReleaseController {
  constructor(private readonly semanticRuleReleaseService: SemanticRuleReleaseService) {}

  @Post(':id/promote/canary')
  async promoteToCanary(@Param('id') id: string, @Body() body: PromoteSemanticRuleSetToCanaryDto) {
    return this.semanticRuleReleaseService.promoteToCanary(id, body);
  }

  @Post(':id/promote/active')
  async promoteToActive(@Param('id') id: string, @Body() body: PromoteSemanticRuleSetToActiveDto) {
    return this.semanticRuleReleaseService.promoteToActive(id, body);
  }

  @Post(':id/rollback')
  async rollback(@Param('id') id: string, @Body() body: RollbackSemanticRuleSetDto) {
    return this.semanticRuleReleaseService.rollback(id, body);
  }

  @Post(':id/validate')
  async validate(@Param('id') id: string) {
    return this.semanticRuleReleaseService.validate(id);
  }
}
