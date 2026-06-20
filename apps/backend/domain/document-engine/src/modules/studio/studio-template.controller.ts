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
import { PreviewService } from './preview.service';
import { AIIdentifierService } from './ai-identifier.service';
import { DocumentStructure, DocumentStructureService } from './document-structure.service';
import { TemplateRepository } from './template.repository';
import { SkillRepository } from './skill.repository';
import { RenderOutputRepository } from './render-output.repository';
import {
  WorkflowDocumentIR,
  WorkflowSaveMeta,
  WorkflowTemplateFieldSpec,
  TemplateWorkflowService,
} from './template-workflow.service';
import { SaveMarkingsDto, SaveTemplateConfigDto } from './studio.dto';
import { StudioControllerBase } from './studio.controller.base';
import { TemplateResponse } from './studio.types';

@ApiTags('studio')
@Controller('studio')
export class StudioTemplateController extends StudioControllerBase {
  constructor(
    previewService: PreviewService,
    aiIdentifierService: AIIdentifierService,
    documentStructureService: DocumentStructureService,
    templateRepository: TemplateRepository,
    skillRepository: SkillRepository,
    renderOutputRepository: RenderOutputRepository,
    templateWorkflowService: TemplateWorkflowService
  ) {
    super(
      previewService,
      aiIdentifierService,
      documentStructureService,
      templateRepository,
      skillRepository,
      renderOutputRepository,
      templateWorkflowService
    );
  }

  /**
   * 获取可用格式化器列表
   */
  @Get('formatters')
  @ApiOperation({ summary: 'Get available formatters' })
  async getFormatters(): Promise<{ formatters: string[] }> {
    return { formatters: this.engine.getAvailableFormatters() };
  }

  /**
   * 列出所有模板
   */
  @Get('templates')
  @ApiOperation({ summary: 'List all templates' })
  async listTemplates(): Promise<{ templates: TemplateResponse[] }> {
    return { templates: await this.listTemplateMetasWithDbFallback() };
  }

  /**
   * 删除模板
   */
  @Post('templates/:id/delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete template' })
  async deleteTemplate(@Param('id') id: string): Promise<{ success: boolean }> {
    try {
      const meta = await this.getTemplateMetaWithDbFallback(id);
      const templatePath = path.join(this.templatesDir, `${id}.${meta.format}`);
      const metaPath = path.join(this.templatesDir, `${id}.json`);

      // 1. 删除文件
      if (fs.existsSync(templatePath)) {
        fs.unlinkSync(templatePath);
      }
      if (fs.existsSync(metaPath)) {
        fs.unlinkSync(metaPath);
      }

      // 2. 删除关联的 skill 文件
      if (meta.skillId) {
        const skillPath = path.join(this.templatesDir, `skill_${meta.skillId}.json`);
        if (fs.existsSync(skillPath)) {
          fs.unlinkSync(skillPath);
        }
      }

      // 3. 递归删除数据库记录
      await this.templateRepository.delete(id);

      return { success: true };
    } catch (error: unknown) {
      this.logger.error(
        `Failed to delete template ${id}: ${error instanceof Error ? error.message : String(error)}`
      );
      throw new HttpException(
        `Failed to delete template: ${error instanceof Error ? error.message : 'Unknown error'}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
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
    const meta = this.getTemplateMeta(id);
    const metaPath = path.join(this.templatesDir, `${id}.json`);

    // 更新元数据中的fileName
    const ext = path.extname(meta.fileName || `${id}.${meta.format}`);
    const newFileName = body.newName.endsWith(ext) ? body.newName : `${body.newName}.${ext}`;

    // 读取现有元数据并更新
    const existingMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    existingMeta.fileName = newFileName;
    existingMeta.updatedAt = new Date().toISOString();

    fs.writeFileSync(metaPath, JSON.stringify(existingMeta, null, 2));
    await this.syncTemplateMetaToDb(id, existingMeta);

    return { success: true, fileName: newFileName };
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
    const meta = this.getTemplateMeta(id);
    const templatePath = path.join(this.templatesDir, `${id}.${meta.format}`);

    if (!fs.existsSync(templatePath)) {
      throw new HttpException('Template file not found', HttpStatus.NOT_FOUND);
    }

    try {
      const JSZip = require('jszip');
      const buffer = fs.readFileSync(templatePath);
      const zip = await JSZip.loadAsync(buffer);

      // 根据格式获取主要内容
      let mainXmlPath = '';
      switch (meta.format) {
        case 'docx':
          mainXmlPath = 'word/document.xml';
          break;
        case 'xlsx':
          mainXmlPath = 'xl/worksheets/sheet1.xml';
          break;
        case 'pptx':
          mainXmlPath = 'ppt/slides/slide1.xml';
          break;
        case 'html':
          // HTML直接读取文件内容
          const htmlContent = buffer.toString('utf-8');
          return {
            content: htmlContent,
            format: meta.format,
            type: 'html',
          };
        default:
          throw new HttpException('Unsupported format', HttpStatus.BAD_REQUEST);
      }

      const file = zip.file(mainXmlPath);
      if (!file) {
        throw new HttpException('Main content not found in template', HttpStatus.NOT_FOUND);
      }

      const content = await file.async('text');

      return {
        content,
        format: meta.format,
        type: 'xml',
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new HttpException(
        `Failed to read template: ${message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
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
    const meta = this.getTemplateMeta(id);
    const metaPath = path.join(this.templatesDir, `${id}.json`);

    // 更新元数据中的标记信息
    const updatedMeta = {
      ...meta,
      markings: dto.markings,
      ignoredElements: dto.ignoredElements || [],
      elementGroups: dto.elementGroups || {},
      ignoredGroups: dto.ignoredGroups || [],
      savedAt: new Date().toISOString(),
    };

    fs.writeFileSync(metaPath, JSON.stringify(updatedMeta, null, 2));
    await this.syncTemplateMarkingsToDb(id, updatedMeta);

    return {
      success: true,
      savedAt: updatedMeta.savedAt,
    };
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
    const meta = this.getTemplateMeta(id);
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
    const meta = this.getTemplateMeta(id);
    const metaPath = path.join(this.templatesDir, `${id}.json`);

    // 更新元数据中的模板配置信息
    const updatedMeta = {
      ...meta,
      templateConfig: dto.templateConfig,
      suggestions: Array.isArray(dto.suggestions) ? dto.suggestions : meta.suggestions,
      rawSuggestions: Array.isArray(dto.rawSuggestions) ? dto.rawSuggestions : meta.rawSuggestions,
      configSavedAt: new Date().toISOString(),
    };

    fs.writeFileSync(metaPath, JSON.stringify(updatedMeta, null, 2));
    await this.syncTemplateConfigToDb(id, dto.templateConfig, updatedMeta.configSavedAt);
    await this.syncTemplateMetaToDb(id, updatedMeta);

    return {
      success: true,
      savedAt: updatedMeta.configSavedAt,
    };
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
    const meta = this.getTemplateMeta(id);
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
    const meta = this.getTemplateMeta(id);
    const templatePath = path.join(this.templatesDir, `${id}.${meta.format}`);

    if (!fs.existsSync(templatePath)) {
      throw new HttpException('Template file not found', HttpStatus.NOT_FOUND);
    }

    if (meta.format !== 'docx') {
      throw new HttpException(
        'Structure parsing is only supported for DOCX files',
        HttpStatus.BAD_REQUEST
      );
    }

    try {
      const buffer = fs.readFileSync(templatePath);
      return await this.documentStructureService.parseDocx(buffer);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new HttpException(
        `Failed to parse document structure: ${message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
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
    try {
      // 支持复用已有的模版ID（从预览生成的模版）
      let templateId = body.templateId;
      const format = body.format || 'docx';
      let isNewTemplate = false;

      // 如果传入了模版ID，检查是否存在
      if (templateId) {
        const existingMetaPath = path.join(this.templatesDir, `${templateId}.json`);
        if (fs.existsSync(existingMetaPath)) {
          // 模版已存在，复用
          this.logger.debug(`复用已有模版: ${templateId}`);
        } else {
          // 模版不存在，需要生成新的
          templateId = uuidv4();
          isNewTemplate = true;
        }
      } else {
        // 没有传入模版ID，生成新的
        templateId = uuidv4();
        isNewTemplate = true;
      }

      const templateName = body.templateName || `template_${templateId}`;
      const normalizedTemplateFileName = templateName
        .toLowerCase()
        .endsWith(`.${format.toLowerCase()}`)
        ? templateName
        : `${templateName}.${format}`;

      // 如果是新模版，保存模板文件
      if (isNewTemplate && body.documentContent) {
        const templatePath = path.join(this.templatesDir, `${templateId}.${format}`);
        let templateBuffer: Buffer;
        if (body.documentContent.startsWith('base64:')) {
          templateBuffer = Buffer.from(body.documentContent.substring(7), 'base64');
        } else {
          try {
            templateBuffer = Buffer.from(body.documentContent, 'base64');
          } catch {
            templateBuffer = Buffer.from(body.documentContent, 'utf-8');
          }
        }
        fs.writeFileSync(templatePath, templateBuffer);
      }

      // 处理skill
      let skillId = body.skillId;
      if (body.skill && !skillId) {
        skillId = uuidv4();
        const skill = {
          ...body.skill,
          id: skillId,
          templateId,
          updatedAt: new Date().toISOString(),
        };
        const skillPath = path.join(this.templatesDir, `skill_${skillId}.json`);
        fs.writeFileSync(skillPath, JSON.stringify(skill, null, 2));
        await this.syncSkillToDb(skill as Record<string, unknown>, templateId);
      }

      // 保存或更新模板元数据
      const templateConfig = body.templateConfig || {};
      const metaPath = path.join(this.templatesDir, `${templateId}.json`);

      // 如果是复用已有模版，读取现有元数据并更新
      let existingMeta: any = {};
      if (!isNewTemplate && fs.existsSync(metaPath)) {
        existingMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      }

      const normalizedTemplateMeta = this.isPlainObject(body.templateMeta)
        ? ({
            ...body.templateMeta,
            templateName: normalizedTemplateFileName,
          } as WorkflowSaveMeta)
        : undefined;
      const normalizedTemplateFieldSpecs = Array.isArray(body.templateFieldSpecs)
        ? body.templateFieldSpecs.filter((field): field is WorkflowTemplateFieldSpec =>
            this.isPlainObject(field)
          )
        : [];
      const hasTemplateAssetPayload = normalizedTemplateFieldSpecs.length > 0;
      const hasValidFile =
        existingMeta?.hasValidFile ??
        fs.existsSync(path.join(this.templatesDir, `${templateId}.${format}`));

      let nextMeta: Record<string, any>;
      if (hasTemplateAssetPayload) {
        const workflowResult = this.templateWorkflowService.compileAndPersistTemplate(
          templateId,
          normalizedTemplateMeta,
          normalizedTemplateFieldSpecs,
          'publish',
          format
        );

        nextMeta = {
          ...this.buildWorkflowMetaDocument(
            templateId,
            {
              templateMeta: normalizedTemplateMeta,
              templateDocumentIr: body.templateDocumentIr,
              templateFieldSpecs: normalizedTemplateFieldSpecs,
            },
            workflowResult,
            {
              ...(existingMeta || {}),
              format,
              fileName: normalizedTemplateFileName,
              hasValidFile,
            }
          ),
          config: templateConfig,
          suggestions: body.suggestions || [],
          skillId,
          updatedAt: workflowResult.updatedAt,
          createdAt: existingMeta.createdAt || workflowResult.updatedAt,
        };
      } else {
        nextMeta = {
          ...existingMeta,
          id: templateId,
          format,
          fileName: normalizedTemplateFileName,
          config: templateConfig,
          suggestions: body.suggestions || [],
          skillId,
          hasValidFile,
          updatedAt: new Date().toISOString(),
          createdAt: existingMeta.createdAt || new Date().toISOString(),
        };
      }

      fs.writeFileSync(metaPath, JSON.stringify(nextMeta));
      const latestMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      await this.syncTemplateMetaToDb(templateId, latestMeta);

      return {
        success: true,
        templateId,
        skillId,
        downloadUrl: `/studio/download-template/${templateId}`,
        skillDownloadUrl: skillId ? `/studio/download-skill/${skillId}` : undefined,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: message,
      };
    }
  }
}
