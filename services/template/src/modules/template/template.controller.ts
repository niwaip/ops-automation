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
import { CreateTemplateDto, UpdateTemplateDto, PublishTemplateDto, CompileScriptDto, ValidateTemplateDto } from './template.dto';
import { TemplateJSON, ListTemplatesQuery, ValidationResult } from '../../types/template.types';
import { PlaywrightCompiler } from '../../compiler/playwright-to-json';
import { TemplateValidator } from '../../validators/template.validator';

@Controller('templates')
export class TemplateController {
  constructor(
    private readonly templateService: TemplateService,
    private readonly compiler: PlaywrightCompiler,
    private readonly templateValidator: TemplateValidator,
  ) {}

  /**
   * GET /templates - List templates with pagination
   */
  @Get()
  async list(@Query() query: ListTemplatesQuery) {
    return this.templateService.list(query);
  }

  /**
   * GET /templates/:id - Get template by ID
   */
  @Get(':id')
  async get(@Param('id') id: string): Promise<TemplateJSON> {
    return this.templateService.get(id);
  }

  /**
   * POST /templates - Create new template
   */
  @Post()
  async create(@Body() dto: CreateTemplateDto): Promise<TemplateJSON> {
    return this.templateService.create(dto);
  }

  /**
   * PATCH /templates/:id - Update template
   */
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateTemplateDto): Promise<TemplateJSON> {
    return this.templateService.update(id, dto);
  }

  /**
   * DELETE /templates/:id - Delete template
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string): Promise<void> {
    return this.templateService.delete(id);
  }

  /**
   * POST /templates/:id/review - Submit template for review (DRAFT -> REVIEW)
   */
  @Post(':id/review')
  async submitForReview(@Param('id') id: string): Promise<TemplateJSON> {
    return this.templateService.submitForReview(id);
  }

  /**
   * POST /templates/:id/publish - Publish template (REVIEW -> PUBLISHED)
   */
  @Post(':id/publish')
  async publish(@Param('id') id: string, @Body() dto: PublishTemplateDto): Promise<TemplateJSON> {
    return this.templateService.publish(id, dto);
  }

  /**
   * POST /templates/:id/deprecate - Deprecate template (PUBLISHED -> DEPRECATED)
   */
  @Post(':id/deprecate')
  async deprecate(@Param('id') id: string): Promise<TemplateJSON> {
    return this.templateService.deprecate(id);
  }

  /**
   * POST /templates/:id/revoke - Revoke template (any -> REVOKED)
   */
  @Post(':id/revoke')
  async revoke(@Param('id') id: string): Promise<TemplateJSON> {
    return this.templateService.revoke(id);
  }

  /**
   * POST /templates/compile - Compile Playwright script to JSON template
   */
  @Post('compile')
  async compile(@Body() dto: CompileScriptDto): Promise<{ template: TemplateJSON; validation: ValidationResult }> {
    // Use a system user ID for compilation
    const systemUserId = 'system-compiler';
    return this.compiler.compile(dto.script, systemUserId);
  }

  /**
   * POST /templates/validate - Validate template structure
   */
  @Post('validate')
  async validate(@Body() dto: ValidateTemplateDto): Promise<ValidationResult> {
    const template: TemplateJSON = {
      id: 'validation-check',
      name: dto.name,
      version: dto.version,
      status: dto.status,
      params_schema: dto.params_schema,
      steps: dto.steps,
      metadata: {
        created_by: dto.created_by,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    };
    return this.templateValidator.validate(template);
  }
}