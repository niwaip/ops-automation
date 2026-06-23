import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  CreateSemanticRuleErrorLogDto,
  ListSemanticRuleErrorLogsQueryDto,
} from './semantic-rule-error-log.dto';
import { SemanticRuleErrorLogService } from './semantic-rule-error-log.service';

@Controller()
export class SemanticRuleErrorLogController {
  constructor(private readonly semanticRuleErrorLogService: SemanticRuleErrorLogService) {}

  @Post('runtime/semantic-rules/error-logs')
  async create(@Body() body: CreateSemanticRuleErrorLogDto) {
    return this.semanticRuleErrorLogService.create(body);
  }

  @Get('semantic-rule-error-logs')
  async list(@Query() query: ListSemanticRuleErrorLogsQueryDto) {
    return this.semanticRuleErrorLogService.list(query);
  }
}
