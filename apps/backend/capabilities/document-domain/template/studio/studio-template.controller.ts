/**
 * Carbone Engine - Studio Template Controller
 */

import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { PreviewService } from '../../render/preview/preview.service';
import { AIIdentifierService } from '../workflow-authoring/ai-identifier.service';
import { DocumentStructure, DocumentStructureService } from '../workflow-authoring/document-structure.service';
import { TemplateRepository } from '../repository/template.repository';
import { SkillRepository } from '../repository/skill.repository';
import { RenderOutputRepository } from '../repository/render-output.repository';
import {
  WorkflowDocumentIR,
  WorkflowSaveMeta,
  WorkflowTemplateFieldSpec,
  TemplateWorkflowService,
} from '../workflow-authoring/template-workflow.service';
import { SaveMarkingsDto, SaveTemplateConfigDto } from './studio.dto';
import { TemplateResponse } from './studio.types';
import {
  deleteStoredTemplate,
  readTemplateSourcePreview,
  renameStoredTemplate,
  saveStoredTemplateConfig,
  saveStoredTemplateMarkings,
} from './utils/studio-template-controller.helper';
import { createStudioControllerRuntime, isStudioPlainObject } from './utils/studio-runtime.helper';
import {
  createStudioSkillSupport,
  createStudioTemplateSupport,
  type StudioSkillSupport,
  type StudioTemplateSupport,
} from './utils/studio-controller-composition.helper';
import { saveStoredTemplateFull } from './utils/studio-template-save-full.helper';
import { readStudioTemplateDocumentStructure } from './utils/studio-template-structure.helper';

@ApiTags('studio')
@Controller('studio')
export class StudioTemplateController {
  private readonly studio = createStudioControllerRuntime(StudioTemplateController.name);
  private readonly templateSupport: StudioTemplateSupport;
  private readonly skillSupport: StudioSkillSupport;

  constructor(
    private readonly previewService: PreviewService,
    private readonly aiIdentifierService: AIIdentifierService,
    private readonly documentStructureService: DocumentStructureService,
    private readonly templateRepository: TemplateRepository,
    private readonly skillRepository: SkillRepository,
    private readonly renderOutputRepository: RenderOutputRepository,
    private readonly templateWorkflowService: TemplateWorkflowService
  ) {
    this.templateSupport = createStudioTemplateSupport({
      templatesDir: this.studio.templatesDir,
      aiIdentifierService: this.aiIdentifierService,
      templateRepository: this.templateRepository,
      logger: this.studio.logger,
    });
    this.skillSupport = createStudioSkillSupport({
      skillRepository: this.skillRepository,
      templatesDir: this.studio.templatesDir,
      logger: this.studio.logger,
    });
  }

  /**
   * 获取可用格式化器列表
   */
  @Get('formatters')
  @ApiOperation({ summary: 'Get available formatters' })
  async getFormatters(): Promise<{ formatters: string[] }> {
    return { formatters: this.studio.engine.getAvailableFormatters() };
  }

  /**
   * 列出所有模板
   */
  @Get('templates')
  @ApiOperation({ summary: 'List all templates' })
  async listTemplates(): Promise<{ templates: TemplateResponse[] }> {
    return {
      templates: await this.templateSupport.listTemplateMetasWithDbFallback(),
    };
  }

  /**
   * 删除模板
   */
  @Post('templates/:id/delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete template' })
  async deleteTemplate(@Param('id') id: string): Promise<{ success: boolean }> {
    return deleteStoredTemplate(
      {
        templatesDir: this.studio.templatesDir,
        getTemplateMetaWithDbFallback: this.templateSupport.getTemplateMetaWithDbFallback,
        deleteTemplateRecord: this.templateRepository.delete.bind(this.templateRepository),
        logger: this.studio.logger,
      },
      id
    );
  }

  /**
   * 重命名模板
   */
  @Post('templates/:id/rename')
  @ApiOperation({ summary: 'Rename template' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        newName: { type: 'string', description: 'New template name' },
      },
      required: ['newName'],
    },
  })
  async renameTemplate(
    @Param('id') id: string,
    @Body() body: { newName: string }
  ): Promise<{ success: boolean; fileName: string }> {
    return renameStoredTemplate(
      {
        templatesDir: this.studio.templatesDir,
        getTemplateMeta: this.templateSupport.getTemplateMeta,
        syncTemplateMetaToDb: this.templateSupport.syncTemplateMetaToDb,
      },
      { id, newName: body.newName }
    );
  }

  /**
   * 获取模板源文件预览
   */
  @Get('templates/:id/preview-source')
  @ApiOperation({ summary: 'Get template source preview' })
  async getTemplateSourcePreview(@Param('id') id: string): Promise<{
    content: string;
    format: string;
    type: 'xml' | 'html';
  }> {
    const meta = this.templateSupport.getTemplateMeta(id);
    return readTemplateSourcePreview({
      templatesDir: this.studio.templatesDir,
      meta,
      id,
    });
  }

  /**
   * 保存模板标记配置
   */
  @Post('templates/:id/markings')
  @ApiOperation({ summary: 'Save template markings' })
  @ApiBody({ type: SaveMarkingsDto })
  async saveMarkings(
    @Param('id') id: string,
    @Body() dto: SaveMarkingsDto
  ): Promise<{ success: boolean; savedAt: string }> {
    return saveStoredTemplateMarkings(
      {
        templatesDir: this.studio.templatesDir,
        getTemplateMeta: this.templateSupport.getTemplateMeta,
        syncTemplateMarkingsToDb: this.templateSupport.syncTemplateMarkingsToDb,
      },
      { id, dto }
    );
  }

  /**
   * 获取模板标记配置
   */
  @Get('templates/:id/markings')
  @ApiOperation({ summary: 'Get template markings' })
  async getMarkings(@Param('id') id: string): Promise<{
    markings: Array<{ path: string; text: string; formatters?: string[] }>;
    ignoredElements?: number[];
    elementGroups?: Record<string, number[]>;
    ignoredGroups?: string[];
    savedAt?: string;
  }> {
    const meta = this.templateSupport.getTemplateMeta(id);
    return {
      markings: meta.markings || [],
      ignoredElements: meta.ignoredElements || [],
      elementGroups: meta.elementGroups || {},
      ignoredGroups: meta.ignoredGroups || [],
      savedAt: meta.savedAt,
    };
  }

  /**
   * 保存AI生成的模板配置
   */
  @Post('templates/:id/config')
  @ApiOperation({ summary: 'Save AI-generated template configuration' })
  @ApiBody({ type: SaveTemplateConfigDto })
  async saveTemplateConfig(
    @Param('id') id: string,
    @Body() dto: SaveTemplateConfigDto
  ): Promise<{ success: boolean; savedAt: string }> {
    return saveStoredTemplateConfig(
      {
        templatesDir: this.studio.templatesDir,
        getTemplateMeta: this.templateSupport.getTemplateMeta,
        syncTemplateConfigToDb: this.templateSupport.syncTemplateConfigToDb,
        syncTemplateMetaToDb: this.templateSupport.syncTemplateMetaToDb,
      },
      { id, dto }
    );
  }

  /**
   * 获取AI生成的模板配置
   */
  @Get('templates/:id/config')
  @ApiOperation({ summary: 'Get AI-generated template configuration' })
  async getTemplateConfig(@Param('id') id: string): Promise<{
    templateConfig?: any;
    configSavedAt?: string;
    suggestions?: any[];
    rawSuggestions?: any[];
  }> {
    const meta = this.templateSupport.getTemplateMeta(id);
    return {
      templateConfig: meta.templateConfig || null,
      configSavedAt: meta.configSavedAt,
      suggestions: Array.isArray(meta.suggestions) ? meta.suggestions : undefined,
      rawSuggestions: Array.isArray(meta.rawSuggestions) ? meta.rawSuggestions : undefined,
    };
  }

  /**
   * 获取文档结构化元素
   */
  @Get('templates/:id/structure')
  @ApiOperation({ summary: 'Get document structure elements for element-level selection' })
  async getDocumentStructure(@Param('id') id: string): Promise<DocumentStructure> {
    return readStudioTemplateDocumentStructure({
      id,
      templatesDir: this.studio.templatesDir,
      meta: this.templateSupport.getTemplateMeta(id),
      documentStructureService: this.documentStructureService,
    });
  }

  /**
   * 保存完整模板（包含模板文件和AI Skill）
   */
  @Post('save-template-full')
  @ApiOperation({ summary: 'Save template with AI skill' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        templateId: {
          type: 'string',
          description: 'Existing template ID (optional, reuse from preview)',
        },
        documentContent: { type: 'string', description: 'Document content (base64)' },
        suggestions: { type: 'array', description: 'Applied suggestions' },
        templateConfig: { type: 'object', description: 'Template configuration' },
        templateMeta: { type: 'object', description: 'Template asset metadata' },
        templateDocumentIr: {
          type: 'object',
          description: 'Template document IR for persisted asset metadata',
        },
        templateFieldSpecs: { type: 'array', description: 'Template asset field specs' },
        skill: { type: 'object', description: 'AI Skill guide' },
        skillId: { type: 'string', description: 'Existing skill ID to associate' },
        format: { type: 'string', description: 'Document format' },
        templateName: { type: 'string', description: 'Template name' },
      },
    },
  })
  async saveTemplateFull(
    @Body()
    body: {
      templateId?: string; // 支持复用已有的模版ID
      documentContent?: string; // 如果使用已有模版ID，可以不传
      suggestions?: any[];
      templateConfig?: any;
      templateMeta?: WorkflowSaveMeta;
      templateDocumentIr?: WorkflowDocumentIR;
      templateFieldSpecs?: WorkflowTemplateFieldSpec[];
      skill?: any;
      skillId?: string;
      format?: string;
      templateName?: string;
    }
  ): Promise<{
    success: boolean;
    templateId?: string;
    skillId?: string;
    downloadUrl?: string;
    skillDownloadUrl?: string;
    error?: string;
  }> {
    return saveStoredTemplateFull(
      {
        templatesDir: this.studio.templatesDir,
        logger: this.studio.logger,
        templateWorkflowService: this.templateWorkflowService,
        syncSkillToDb: this.skillSupport.syncSkillToDb,
        syncTemplateMetaToDb: this.templateSupport.syncTemplateMetaToDb,
        isPlainObject: isStudioPlainObject,
      },
      body
    );
  }
}
