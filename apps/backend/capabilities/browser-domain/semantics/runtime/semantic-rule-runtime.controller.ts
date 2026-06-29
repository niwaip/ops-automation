import { Controller, Get, Query } from '@nestjs/common';
import { ResolveRuntimeSemanticRuleSetQueryDto } from './semantic-rule-runtime.dto';
import { SemanticRuleRuntimeService } from './semantic-rule-runtime.service';

@Controller('runtime/semantic-rules')
export class SemanticRuleRuntimeController {
  constructor(private readonly semanticRuleRuntimeService: SemanticRuleRuntimeService) {}

  @Get('resolve')
  async resolve(@Query() query: ResolveRuntimeSemanticRuleSetQueryDto) {
    return this.semanticRuleRuntimeService.resolve(query);
  }
}
