import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { TemplateService } from './template.service';
import {
  CreateReportTemplateDTO,
  UpdateReportTemplateDTO,
} from './template.dto';
import { ReportTemplateDTO } from '../../interfaces';

@ApiTags('Report Templates')
@Controller('report-templates')
export class TemplateController {
  constructor(private readonly templateService: TemplateService) {}

  @Get()
  @ApiOperation({ summary: 'List all report templates' })
  @ApiResponse({ status: 200, description: 'Returns list of templates' })
  async findAll(): Promise<{ templates: ReportTemplateDTO[] }> {
    const templates = await this.templateService.findAll();
    return { templates };
  }

  @Post()
  @ApiOperation({ summary: 'Create a new report template' })
  @ApiResponse({ status: 201, description: 'Template created successfully' })
  async create(@Body() dto: CreateReportTemplateDTO): Promise<ReportTemplateDTO> {
    return this.templateService.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific report template' })
  @ApiResponse({ status: 200, description: 'Returns template details' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async findOne(@Param('id') id: string): Promise<ReportTemplateDTO> {
    return this.templateService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a report template' })
  @ApiResponse({ status: 200, description: 'Template updated successfully' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateReportTemplateDTO,
  ): Promise<ReportTemplateDTO> {
    return this.templateService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a report template' })
  @ApiResponse({ status: 200, description: 'Template deleted successfully' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async remove(@Param('id') id: string): Promise<{ success: boolean }> {
    await this.templateService.remove(id);
    return { success: true };
  }
}