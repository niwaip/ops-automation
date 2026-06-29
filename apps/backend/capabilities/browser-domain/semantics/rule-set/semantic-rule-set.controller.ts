import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import {
  CreateSemanticRuleSetDto,
  ListSemanticRuleSetsQueryDto,
  ReplaceSemanticRuleCategoryDto,
  ReplaceSemanticRuleCategoryParamsDto,
  UpdateSemanticRuleSetDto,
} from './semantic-rule-set.dto';
import { SemanticRuleSetService } from './semantic-rule-set.service';

@Controller('semantic-rule-sets')
export class SemanticRuleSetController {
  constructor(private readonly semanticRuleSetService: SemanticRuleSetService) {}

  @Get()
  async list(@Query() query: ListSemanticRuleSetsQueryDto) {
    return this.semanticRuleSetService.list(query);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.semanticRuleSetService.getById(id);
  }

  @Post()
  async create(@Body() body: CreateSemanticRuleSetDto) {
    return this.semanticRuleSetService.create(body);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: UpdateSemanticRuleSetDto) {
    return this.semanticRuleSetService.update(id, body);
  }

  @Put(':id/categories/:category')
  async replaceCategoryRules(
    @Param() params: ReplaceSemanticRuleCategoryParamsDto,
    @Body() body: ReplaceSemanticRuleCategoryDto
  ) {
    return this.semanticRuleSetService.replaceCategoryRules(params.id, params.category, body);
  }
}
