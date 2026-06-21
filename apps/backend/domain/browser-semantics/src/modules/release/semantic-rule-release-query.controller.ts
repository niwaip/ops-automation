import { Controller, Get, Query } from '@nestjs/common';
import { ListSemanticRuleReleasesQueryDto } from './semantic-rule-release.dto';
import { SemanticRuleReleaseService } from './semantic-rule-release.service';

@Controller()
export class SemanticRuleReleaseQueryController {
  constructor(private readonly semanticRuleReleaseService: SemanticRuleReleaseService) {}

  @Get('semantic-rule-releases')
  async list(@Query() query: ListSemanticRuleReleasesQueryDto) {
    return this.semanticRuleReleaseService.list(query);
  }
}
