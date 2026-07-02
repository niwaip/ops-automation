import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Delete,
  Patch,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TemplateService } from './template.service';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
  PublishTemplateDto,
  CompileScriptDto,
  ValidateTemplateDto,
  ListTemplatesQueryDto,
} from './template.dto';
import { TemplateJSON, ValidationResult } from './types/template.types';
import { PlaywrightCompiler } from './compiler/playwright-to-json';
import { TemplateValidator } from './validators/template.validator';

@Controller('templates')
export class TemplateController {
  constructor(
    private readonly templateService: TemplateService,
    private readonly compiler: PlaywrightCompiler,
    private readonly templateValidator: TemplateValidator
  ) {}

  @Get()
  async list(@Query() query: ListTemplatesQueryDto) {
    return this.templateService.list(query);
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<TemplateJSON> {
    return this.templateService.get(id);
  }

  @Post()
  async create(@Body() dto: CreateTemplateDto): Promise<TemplateJSON> {
    return this.templateService.create(dto);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateTemplateDto): Promise<TemplateJSON> {
    return this.templateService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string): Promise<void> {
    return this.templateService.delete(id);
  }

  @Post(':id/review')
  async submitForReview(@Param('id') id: string): Promise<TemplateJSON> {
    return this.templateService.submitForReview(id);
  }

  @Post(':id/publish')
  async publish(@Param('id') id: string, @Body() dto: PublishTemplateDto): Promise<TemplateJSON> {
    return this.templateService.publish(id, dto);
  }

  @Post(':id/deprecate')
  async deprecate(@Param('id') id: string): Promise<TemplateJSON> {
    return this.templateService.deprecate(id);
  }

  @Post(':id/revoke')
  async revoke(@Param('id') id: string): Promise<TemplateJSON> {
    return this.templateService.revoke(id);
  }

  @Post('compile')
  async compile(
    @Body() dto: CompileScriptDto
  ): Promise<{ template: TemplateJSON; validation: ValidationResult }> {
    const systemUserId = 'system-compiler';
    return this.compiler.compile(dto.script, systemUserId, dto.intent);
  }

  @Post('validate')
  async validate(@Body() dto: ValidateTemplateDto): Promise<ValidationResult> {
    const template: TemplateJSON = {
      id: 'validation-check',
      name: dto.name,
      version: dto.version,
      status: dto.status,
      description: undefined,
      params_schema: dto.params_schema,
      steps: dto.steps,
      guards: dto.guards || [],
      config: dto.config || {},
      created_by: dto.created_by,
      reviewed_by: null,
      published_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deprecated_at: null,
      metadata: {
        created_by: dto.created_by,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    };
    return this.templateValidator.validate(template);
  }
}
