/**
 * Carbone Engine - Studio Render Controller
 */

import {
  Body,
  Controller,
  Get,
  Header,
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
import { PreviewDto } from '../preview/preview.dto';
import { PreviewService } from '../preview/preview.service';
import { type RenderResponse } from '../contracts';
import { ValidateDto } from '../validation/validation.dto';
import { AIIdentifierService } from '../../template/workflow-authoring/ai-identifier.service';
import { DocumentStructureService } from '../../template/workflow-authoring/document-structure.service';
import { TemplateWorkflowService } from '../../template/workflow-authoring/template-workflow.service';
import { RenderOutputRepository } from '../../template/repository/render-output.repository';
import { SkillRepository } from '../../template/repository/skill.repository';
import { TemplateRepository } from '../../template/repository/template.repository';
import { generateStudioTemplateSampleData } from '../../template/studio/utils/studio-controller-data.helper';
import { normalizeStudioRenderData } from '../../template/studio/utils/studio-controller-data.helper';
import { createStudioControllerRuntime } from '../../template/studio/utils/studio-runtime.helper';
import {
  createStudioRenderOutputSupport,
  createStudioSkillSupport,
  createStudioTemplateSupport,
  type StudioRenderOutputSupport,
  type StudioSkillSupport,
  type StudioTemplateSupport,
} from '../../template/studio/utils/studio-controller-composition.helper';
import { readStudioWorkflowConfig } from '../../template/studio/utils/studio-workflow-config.helper';
import { RenderResolvedDto } from '../../runtime-facade/render-entry/document-runtime-facade.dto';
import { debugStudioRenderHypothesis } from './utils/studio-render-debug.helper';
import {
  previewStudioTemplateContent,
  validateStudioTemplateContent,
} from './utils/studio-render-content.helper';
import {
  getStudioRenderContentType,
  loadTemplateHtmlPreview,
  streamStoredRenderFile,
} from './utils/studio-render-file.helper';
import { generateStudioTemplateFromContent } from './utils/studio-render-generate.helper';
import { validateStudioTemplateRender } from './utils/studio-render-validate.helper';
import {
  executeResolvedRender,
  generateStudioRenderOutputFileName,
  resolveStudioRenderTarget,
} from './utils/studio-render-controller.helper';

@ApiTags('studio')
@Controller('studio')
export class StudioRenderController {
  private readonly studio = createStudioControllerRuntime(StudioRenderController.name);
  private readonly templateSupport: StudioTemplateSupport;
  private readonly skillSupport: StudioSkillSupport;
  private readonly renderOutputSupport: StudioRenderOutputSupport;

  private debugReport(hypothesisId: string, msg: string, data: Record<string, unknown> = {}): void {
    debugStudioRenderHypothesis(hypothesisId, msg, data);
  }

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
    this.renderOutputSupport = createStudioRenderOutputSupport({
      renderOutputRepository: this.renderOutputRepository,
      logger: this.studio.logger,
    });
    this.skillSupport = createStudioSkillSupport({
      skillRepository: this.skillRepository,
      templatesDir: this.studio.templatesDir,
      logger: this.studio.logger,
    });
  }

  @Post('render-resolved')
  @Header('X-Document-Render-Entry', 'unified-runtime')
  @ApiOperation({
    summary: 'Render document with resolved template and skill context',
    description:
      '正式文档运行时统一入口。Capability Runtime、AI tool、Temporal Activity 等正式调用方应收口到该接口。',
  })
  @ApiBody({ type: RenderResolvedDto })
  async renderResolved(@Body() dto: RenderResolvedDto): Promise<RenderResponse> {
    const resolved = await resolveStudioRenderTarget(
      {
        getSkillWithDbFallback: this.skillSupport.getSkillWithDbFallback,
      },
      {
        templateId: dto.templateId,
        skillId: dto.skillId,
        publishedSkillId: dto.publishedSkillId,
      }
    );

    return executeResolvedRender(
      {
        templatesDir: this.studio.templatesDir,
        outputsDir: this.studio.outputsDir,
        getTemplateMetaWithDbFallback: this.templateSupport.getTemplateMetaWithDbFallback,
        readWorkflowConfig: readStudioWorkflowConfig,
        normalizeRenderData: normalizeStudioRenderData,
        documentStructureService: this.documentStructureService,
        engine: this.studio.engine,
        generateOutputFileName: generateStudioRenderOutputFileName,
        syncRenderOutputToDb: this.renderOutputSupport.syncRenderOutputToDb,
        debugReport: this.debugReport.bind(this),
        logger: this.studio.logger,
      },
      {
        templateId: resolved.templateId,
        skillId: resolved.skillId,
        publishedSkillId: resolved.publishedSkillId,
        data: dto.data || {},
        workflowInputParams: dto.workflowInputParams,
        workflowInputPolicy: dto.workflowInputPolicy,
        outputFormat: dto.outputFormat,
        outputName: dto.outputName,
        sourceLanguage: dto.sourceLanguage,
        targetLanguages: dto.targetLanguages,
        prepareLocalizedRenderData: dto.prepareLocalizedRenderData,
      }
    );
  }

  @Post('preview')
  @ApiOperation({ summary: 'Preview template with sample data' })
  @ApiBody({ type: PreviewDto })
  async previewTemplate(
    @Body() dto: PreviewDto,
    @Res({ passthrough: true }) res: Response
  ): Promise<{ preview: StreamableFile; sampleData: any }> {
    const meta = this.templateSupport.getTemplateMeta(dto.templateId);
    const templatePath = path.join(this.studio.templatesDir, `${dto.templateId}.${meta.format}`);

    if (!fs.existsSync(templatePath)) {
      throw new HttpException('Template file not found', HttpStatus.NOT_FOUND);
    }

    try {
      const templateBuffer = fs.readFileSync(templatePath);
      const result = await this.studio.engine.preview(templateBuffer, meta.fileName, {
        maxRows: dto.maxRows || 3,
      });

      res.setHeader('Content-Type', getStudioRenderContentType(meta.format));
      res.setHeader('Content-Disposition', `inline; filename="preview_${meta.fileName}"`);

      return {
        preview: new StreamableFile(result.buffer),
        sampleData: result.sampleData,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new HttpException(
        `Failed to preview template: ${message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('validate-content')
  @ApiOperation({ summary: 'Validate template configuration content' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        template: { type: 'string', description: 'Template configuration JSON string' },
      },
    },
  })
  async validateTemplateContent(@Body() body: { template: string }): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    return validateStudioTemplateContent(body);
  }

  @Post('preview-content')
  @ApiOperation({ summary: 'Preview template content without saving' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        documentContent: { type: 'string', description: 'Document content with variables applied' },
        templateConfig: { type: 'object', description: 'Template configuration' },
        format: { type: 'string', description: 'Document format (docx, xlsx, pptx)' },
      },
    },
  })
  async previewTemplateContent(
    @Body() body: { documentContent: string; templateConfig?: any; format?: string }
  ): Promise<{
    success: boolean;
    previewUrl?: string;
    sampleData?: any;
    error?: string;
  }> {
    return previewStudioTemplateContent({
      body,
      templatesDir: this.studio.templatesDir,
      outputsDir: this.studio.outputsDir,
      engine: this.studio.engine,
    });
  }

  @Post('validate')
  @ApiOperation({ summary: 'Validate template and generate document with saved sample data' })
  @ApiBody({ type: ValidateDto })
  async validateData(@Body() dto: ValidateDto): Promise<{
    valid: boolean;
    missing: string[];
    downloadUrl?: string;
    fileName?: string;
    sampleData?: any;
    markedTemplateId?: string;
  }> {
    return validateStudioTemplateRender(
      {
        templatesDir: this.studio.templatesDir,
        outputsDir: this.studio.outputsDir,
        getTemplateMetaWithDbFallback: this.templateSupport.getTemplateMetaWithDbFallback,
        normalizeTemplateConfig: this.aiIdentifierService.normalizeTemplateConfig.bind(
          this.aiIdentifierService
        ),
        documentStructureService: this.documentStructureService,
        engine: this.studio.engine,
        generateTemplateSampleData: (meta, templateInfo, config, rowCount) =>
          generateStudioTemplateSampleData({
            meta,
            templateInfo,
            config,
            rowCount,
            engine: this.studio.engine,
            getSkillWithDbFallback: this.skillSupport.getSkillWithDbFallback,
          }),
        syncRenderOutputToDb: this.renderOutputSupport.syncRenderOutputToDb,
      },
      {
        templateId: dto.templateId,
        data: dto.data,
      }
    );
  }

  @Post('generate')
  @ApiOperation({ summary: 'Generate template from Office document with suggestions' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        documentContent: { type: 'string', description: 'Document content (base64 for binary)' },
        suggestions: { type: 'array', description: 'Applied suggestions' },
        templateConfig: { type: 'object', description: 'Template configuration' },
        format: { type: 'string', description: 'Document format (docx, xlsx, pptx)' },
      },
    },
  })
  async generateTemplate(
    @Body()
    body: {
      documentContent: string;
      suggestions: any[];
      templateConfig?: any;
      format?: string;
    }
  ): Promise<{
    success: boolean;
    generatedTemplate?: string;
    templateId?: string;
    downloadUrl?: string;
    hasValidFile?: boolean;
    error?: string;
  }> {
    return generateStudioTemplateFromContent(
      {
        templatesDir: this.studio.templatesDir,
        syncTemplateMetaToDb: this.templateSupport.syncTemplateMetaToDb,
        logger: this.studio.logger,
      },
      body
    );
  }

  @Get('download/:id')
  @ApiOperation({ summary: 'Download rendered document' })
  @Header('Content-Type', 'application/octet-stream')
  async downloadDocument(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response
  ): Promise<StreamableFile> {
    return streamStoredRenderFile({
      id,
      metaDir: this.studio.outputsDir,
      fileDir: this.studio.outputsDir,
      res,
      disposition: 'attachment',
      missingMetaMessage: 'Document not found',
      missingFileMessage: 'Document file not found',
      getContentType: getStudioRenderContentType,
    });
  }

  @Get('download-template/:id')
  @ApiOperation({ summary: 'Download marked template file' })
  @Header('Content-Type', 'application/octet-stream')
  async downloadTemplate(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response
  ): Promise<StreamableFile> {
    return streamStoredRenderFile({
      id,
      metaDir: this.studio.templatesDir,
      fileDir: this.studio.templatesDir,
      res,
      disposition: 'attachment',
      missingMetaMessage: 'Template not found',
      missingFileMessage: 'Template file not found',
      getContentType: getStudioRenderContentType,
    });
  }

  @Get('templates/:id/preview-html')
  @ApiOperation({ summary: 'Get template HTML preview for iframe display' })
  async getTemplateHtmlPreview(@Param('id') id: string): Promise<{ html: string; format: string }> {
    return loadTemplateHtmlPreview({
      id,
      templatesDir: this.studio.templatesDir,
      previewService: this.previewService,
      getTemplateMeta: this.templateSupport.getTemplateMeta,
    });
  }

  @Get('preview-file/:id')
  @ApiOperation({ summary: 'Preview rendered file for popup' })
  async previewRenderedFile(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response
  ): Promise<StreamableFile> {
    return streamStoredRenderFile({
      id,
      metaDir: this.studio.outputsDir,
      fileDir: this.studio.outputsDir,
      res,
      disposition: 'inline',
      missingMetaMessage: 'Preview file not found',
      missingFileMessage: 'File not found',
      getContentType: getStudioRenderContentType,
    });
  }
}
