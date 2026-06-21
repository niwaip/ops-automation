import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CreateSemanticRuleHitLogDto, ListSemanticRuleHitLogsQueryDto } from './semantic-rule-hit-log.dto';
import { SemanticRuleHitLogService } from './semantic-rule-hit-log.service';

@Controller()
export class SemanticRuleHitLogController {
  constructor(private readonly semanticRuleHitLogService: SemanticRuleHitLogService) {}

  @Post('runtime/semantic-rules/hit-logs')
  async create(@Body() body: CreateSemanticRuleHitLogDto) {
    return this.semanticRuleHitLogService.create(body);
  }

  @Get('semantic-rule-hit-logs')
  async list(@Query() query: ListSemanticRuleHitLogsQueryDto) {
    return this.semanticRuleHitLogService.list(query);
  }
}
