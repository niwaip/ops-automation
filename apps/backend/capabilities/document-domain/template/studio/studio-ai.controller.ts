/**
 * Carbone Engine - Studio AI Controller
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
  Query,
  Res,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { PreviewService } from '../../render/preview/preview.service';
import {
  AIIdentifierService,
  AIIdentifyResponse,
} from '../workflow-authoring/ai-identifier.service';
import { DocumentStructureService } from '../workflow-authoring/document-structure.service';
import { TemplateRepository } from '../repository/template.repository';
import { SkillRepository } from '../repository/skill.repository';
import { RenderOutputRepository } from '../repository/render-output.repository';
import { TemplateWorkflowService } from '../workflow-authoring/template-workflow.service';
import { isStudioSkillDebugEnabled, isStudioVerboseDebugEnabled } from './studio-debug.helper';
import { AIIdentifyDto, AIVerifyDto, DirectAIIdentifyDto } from './studio.dto';
import {
  executeDirectAiIdentify,
  executeDirectAiIdentifyMultistage,
  executeDirectAiIdentifyWithProgress,
} from './utils/studio-ai-direct-identify.helper';
import {
  executeTemplateAiIdentify,
  executeTemplateAiIdentifyStream,
} from './utils/studio-ai-identify.helper';
import { executePreviewWithSkill } from './utils/studio-ai-preview-skill.helper';
import { getStudioAiSkillOrThrow } from './utils/studio-ai-skill-query.helper';
import { executeGenerateAiSkill } from './utils/studio-ai-skill.helper';
import {
  buildHydratedStudioSkillSampleData,
  generateStudioSimulatedData,
  normalizeStudioRenderData,
} from './utils/studio-controller-data.helper';
import {
  cacheStudioTemplateSuggestions,
} from './utils/studio-template-meta.helper';
import { createStudioControllerRuntime } from './utils/studio-runtime.helper';
import type { TemplateResponse } from './studio.types';
import {
  createStudioRenderOutputSupport,
  createStudioSkillSupport,
  createStudioTemplateSupport,
  type StudioRenderOutputSupport,
  type StudioSkillSupport,
  type StudioTemplateSupport,
} from './utils/studio-controller-composition.helper';
import { executeAiVerifyTemplate } from './utils/studio-ai-verify.helper';
import { executeAiVerifyTemplateStreamResponse } from './utils/studio-ai-verify-stream.helper';
import { parseJsonObjectOrDefault } from './utils/studio-ai-controller.helper';

@ApiTags('studio')
@Controller('studio')
export class StudioAiController {
  private readonly studio = createStudioControllerRuntime(StudioAiController.name);
  private readonly verboseDebugEnabled = isStudioVerboseDebugEnabled();
  private readonly skillDebugEnabled = isStudioSkillDebugEnabled();
  private readonly templateSupport: StudioTemplateSupport;
  private readonly skillSupport: StudioSkillSupport;
  private readonly renderOutputSupport: StudioRenderOutputSupport;
  private readonly cacheTemplateSuggestions: (
    templateId: string,
    meta: TemplateResponse,
    result: Pick<AIIdentifyResponse, 'suggestions' | 'rawSuggestions' | 'templateConfig'>
  ) => Promise<void>;

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
    this.renderOutputSupport = createStudioRenderOutputSupport({
      renderOutputRepository: this.renderOutputRepository,
      logger: this.studio.logger,
    });
    this.cacheTemplateSuggestions = (templateId, meta, result) =>
      cacheStudioTemplateSuggestions(
        {
          templatesDir: this.studio.templatesDir,
          syncTemplateMetaToDb: this.templateSupport.syncTemplateMetaToDb,
        },
        templateId,
        meta,
        result
      );
  }

  /**
   * AI自动识别模板变量（流式响应）
   */
  @Post('templates/:id/ai-identify-stream')
  @ApiOperation({ summary: 'AI identify potential variables with streaming response' })
  async aiIdentifyVariablesStream(
    @Param('id') id: string,
    @Body() dto: AIIdentifyDto,
    @Res() res: Response
  ): Promise<void> {
    return executeTemplateAiIdentifyStream(
      {
        templatesDir: this.studio.templatesDir,
        aiIdentifierService: this.aiIdentifierService,
        documentStructureService: this.documentStructureService,
        cacheTemplateSuggestions: this.cacheTemplateSuggestions,
      },
      {
        id,
        meta: this.templateSupport.getTemplateMeta(id),
        dto,
        res,
      }
    );
  }

  /**
   * AI自动识别模板变量
   */
  @Post('templates/:id/ai-identify')
  @ApiOperation({ summary: 'AI identify potential variables in template' })
  @ApiBody({ type: AIIdentifyDto })
  async aiIdentifyVariables(
    @Param('id') id: string,
    @Body() dto: AIIdentifyDto
  ): Promise<AIIdentifyResponse> {
    return executeTemplateAiIdentify(
      {
        templatesDir: this.studio.templatesDir,
        aiIdentifierService: this.aiIdentifierService,
        documentStructureService: this.documentStructureService,
        cacheTemplateSuggestions: this.cacheTemplateSuggestions,
      },
      {
        id,
        meta: this.templateSupport.getTemplateMeta(id),
        dto,
      }
    );
  }

  /**
   * 直接AI识别文档内容 - 用于Office插件
   */
  @Post('direct-ai-identify')
  @ApiOperation({
    summary: 'Direct AI identify variables from document content (for Office Add-in)',
  })
  @ApiBody({ type: DirectAIIdentifyDto })
  @ApiResponse({ status: 200, description: 'AI identification result with suggestions' })
  async directAIIdentify(@Body() dto: DirectAIIdentifyDto): Promise<AIIdentifyResponse> {
    return executeDirectAiIdentify(
      {
        templatesDir: this.studio.templatesDir,
        verboseDebugEnabled: this.verboseDebugEnabled,
        logger: this.studio.logger,
        aiIdentifierService: this.aiIdentifierService,
      },
      dto
    );
  }

  /**
   * 多阶段AI识别文档内容 - 用于Office插件（新接口）
   */
  @Post('direct-ai-identify-multistage')
  @ApiOperation({
    summary: 'Multi-stage AI identify variables with real-time progress (for Office Add-in)',
  })
  @ApiBody({ type: DirectAIIdentifyDto })
  @ApiResponse({ status: 200, description: 'AI identification result with suggestions' })
  async directAIIdentifyMultistage(@Body() dto: DirectAIIdentifyDto): Promise<AIIdentifyResponse> {
    return executeDirectAiIdentifyMultistage(
      {
        templatesDir: this.studio.templatesDir,
        verboseDebugEnabled: this.verboseDebugEnabled,
        logger: this.studio.logger,
        aiIdentifierService: this.aiIdentifierService,
      },
      dto
    );
  }

  /**
   * 多阶段AI识别 - SSE实时进度版本
   */
  @Get('direct-ai-identify-progress')
  @ApiOperation({ summary: 'Multi-stage AI identify with SSE progress stream' })
  @ApiQuery({ name: 'documentContent', required: true, description: 'Document text content' })
  @ApiQuery({
    name: 'documentType',
    required: true,
    description: 'Document type (docx/xlsx/pptx/text)',
  })
  @ApiQuery({
    name: 'templateType',
    required: false,
    description: 'Template type (contract/report/etc)',
  })
  @ApiQuery({ name: 'context', required: false, description: 'Context information' })
  @Header('Content-Type', 'text/event-stream')
  @Header('Cache-Control', 'no-cache')
  @Header('Connection', 'keep-alive')
  async directAIIdentifyWithProgress(
    @Query('documentContent') documentContent: string,
    @Query('documentType') documentType: string,
    @Query('templateType') templateType: string,
    @Query('context') context: string,
    @Res() res: Response
  ): Promise<void> {
    return executeDirectAiIdentifyWithProgress(
      {
        templatesDir: this.studio.templatesDir,
        verboseDebugEnabled: this.verboseDebugEnabled,
        logger: this.studio.logger,
        aiIdentifierService: this.aiIdentifierService,
      },
      {
        documentContent,
        documentType,
        templateType,
        context,
        res,
      }
    );
  }

  /**
   * AI验证模版（SSE流式输出）- POST请求用于fetch流式处理
   */
  @Post('templates/:id/ai-verify-stream')
  @ApiOperation({ summary: 'AI verify template with SSE streaming (POST for fetch)' })
  @ApiBody({ type: AIVerifyDto })
  async aiVerifyTemplateStreamPost(
    @Param('id') id: string,
    @Body() dto: AIVerifyDto,
    @Res({ passthrough: false }) res: Response
  ): Promise<void> {
    const meta = this.templateSupport.getTemplateMeta(id);
    return executeAiVerifyTemplateStreamResponse(
      {
        aiIdentifierService: this.aiIdentifierService,
        documentStructureService: this.documentStructureService,
        engine: this.studio.engine,
        syncTemplateMetaToDb: this.templateSupport.syncTemplateMetaToDb,
        syncRenderOutputToDb: this.renderOutputSupport.syncRenderOutputToDb,
        templatesDir: this.studio.templatesDir,
        outputsDir: this.studio.outputsDir,
        verboseDebugEnabled: this.verboseDebugEnabled,
        logger: this.studio.logger,
      },
      {
        id,
        meta,
        prompt: dto.prompt || '生成一份示例报告用于验证模版配置',
        rawTestData: dto.testData || '',
        config: dto.templateConfig || meta.templateConfig || {},
        res,
      }
    );
  }

  /**
   * AI验证模版（SSE流式输出）- GET请求用于EventSource
   */
  @Get('templates/:id/ai-verify-stream')
  @ApiOperation({ summary: 'AI verify template with SSE streaming (GET for EventSource)' })
  @ApiQuery({ name: 'testData', required: false, description: 'Test data JSON string' })
  @ApiQuery({ name: 'templateConfig', required: false, description: 'Template config JSON string' })
  @ApiQuery({ name: 'prompt', required: false, description: 'Verification prompt' })
  async aiVerifyTemplateStream(
    @Param('id') id: string,
    @Res({ passthrough: false }) res: Response,
    @Query('testData') testDataStr?: string,
    @Query('templateConfig') templateConfigStr?: string,
    @Query('prompt') prompt?: string
  ): Promise<void> {
    const meta = this.templateSupport.getTemplateMeta(id);
    return executeAiVerifyTemplateStreamResponse(
      {
        aiIdentifierService: this.aiIdentifierService,
        documentStructureService: this.documentStructureService,
        engine: this.studio.engine,
        syncTemplateMetaToDb: this.templateSupport.syncTemplateMetaToDb,
        syncRenderOutputToDb: this.renderOutputSupport.syncRenderOutputToDb,
        templatesDir: this.studio.templatesDir,
        outputsDir: this.studio.outputsDir,
        verboseDebugEnabled: this.verboseDebugEnabled,
        logger: this.studio.logger,
      },
      {
        id,
        meta,
        prompt: prompt || '生成一份示例报告用于验证模版配置',
        rawTestData: testDataStr || '',
        config: parseJsonObjectOrDefault(templateConfigStr, meta.templateConfig || {}),
        res,
      }
    );
  }

  @Post('templates/:id/ai-verify')
  @ApiOperation({ summary: 'AI verify template by generating sample report' })
  @ApiBody({ type: AIVerifyDto })
  async aiVerifyTemplate(
    @Param('id') id: string,
    @Body() dto: AIVerifyDto
  ): Promise<{ report: string; success: boolean; downloadUrl?: string; previewUrl?: string }> {
    return executeAiVerifyTemplate(
      {
        templatesDir: this.studio.templatesDir,
        outputsDir: this.studio.outputsDir,
        aiIdentifierService: this.aiIdentifierService,
        documentStructureService: this.documentStructureService,
        engine: this.studio.engine,
      },
      {
        id,
        meta: this.templateSupport.getTemplateMeta(id),
        prompt: dto.prompt,
        testData: dto.testData,
        templateConfig: dto.templateConfig,
      }
    );
  }

  /**
   * 生成AI使用指南Skill
   */
  @Post('generate-skill')
  @ApiOperation({ summary: 'Generate AI skill guide for template parameterization' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        templateId: { type: 'string', description: 'Template ID (optional if using suggestions)' },
        suggestions: { type: 'array', description: 'Applied AI suggestions' },
        templateConfig: { type: 'object', description: 'Template configuration' },
        templateType: {
          type: 'string',
          description: 'Template type: contract, invoice, report, etc.',
        },
        documentDescription: { type: 'string', description: 'Document usage description' },
      },
    },
  })
  async generateAISkill(
    @Body()
    body: {
      templateId?: string;
      suggestions?: any[];
      templateConfig?: any;
      templateType?: string;
      documentDescription?: string;
    }
  ): Promise<{
    success: boolean;
    skill?: any;
    skillId?: string;
    error?: string;
  }> {
    return executeGenerateAiSkill(
      {
        templatesDir: this.studio.templatesDir,
        skillDebugEnabled: this.skillDebugEnabled,
        logger: this.studio.logger,
        aiIdentifierService: this.aiIdentifierService,
        getTemplateMeta: this.templateSupport.getTemplateMeta,
        syncSkillToDb: this.skillSupport.syncSkillToDb,
        syncTemplateMetaToDb: this.templateSupport.syncTemplateMetaToDb,
      },
      body
    );
  }

  /**
   * 使用AI Skill进行参数化预览
   */
  @Post('preview-with-skill')
  @ApiOperation({ summary: 'Preview template using AI skill guide' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        templateId: { type: 'string', description: 'Template ID' },
        skillId: { type: 'string', description: 'AI Skill ID' },
        skill: { type: 'object', description: 'AI Skill object (if no skillId)' },
        simulatedData: {
          type: 'object',
          description: 'Simulated data (optional, will generate if not provided)',
        },
      },
    },
  })
  async previewWithSkill(
    @Body() body: { templateId?: string; skillId?: string; skill?: any; simulatedData?: any }
  ): Promise<{
    success: boolean;
    previewUrl?: string;
    downloadUrl?: string;
    generatedData?: any;
    skillUsed?: any;
    error?: string;
    debugLogs?: string[];
  }> {
    return executePreviewWithSkill(
      {
        templatesDir: this.studio.templatesDir,
        outputsDir: this.studio.outputsDir,
        verboseDebugEnabled: this.verboseDebugEnabled,
        logger: this.studio.logger,
        engine: this.studio.engine,
        getSkillWithDbFallback: this.skillSupport.getSkillWithDbFallback,
        buildHydratedSkillSampleData: buildHydratedStudioSkillSampleData,
        generateSimulatedData: generateStudioSimulatedData,
        normalizeRenderData: normalizeStudioRenderData,
        getTemplateMeta: this.templateSupport.getTemplateMeta,
        syncRenderOutputToDb: this.renderOutputSupport.syncRenderOutputToDb,
      },
      { body }
    );
  }

  /**
   * 已下线的旧参数生成入口
   */
  @Post('generate-parameters')
  @ApiOperation({ summary: 'Disabled generate-parameters endpoint' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        description: { type: 'string', description: '用户描述/元数据内容' },
        skill: { type: 'object', description: 'AI Skill guide' },
        skillId: { type: 'string', description: 'AI Skill ID (if skill not provided)' },
      },
    },
  })
  async generateParameters(
    @Body() _body: { description: string; skill?: any; skillId?: string }
  ): Promise<never> {
    throw new HttpException(
      {
        success: false,
        error:
          'generate-parameters 已下线。请改用统一文档主链路：skill match -> planner -> execution -> waiting_input -> render。',
      },
      HttpStatus.GONE
    );
  }

  /**
   * 下载AI Skill文件
   */
  @Get('download-skill/:id')
  @ApiOperation({ summary: 'Download AI skill file' })
  @Header('Content-Type', 'application/json')
  async downloadSkill(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response
  ): Promise<any> {
    return getStudioAiSkillOrThrow(this.skillSupport.getSkillWithDbFallback, id);
  }

  /**
   * 获取AI Skill
   */
  @Get('skill/:id')
  @ApiOperation({ summary: 'Get AI skill by ID' })
  async getSkill(@Param('id') id: string): Promise<any> {
    return getStudioAiSkillOrThrow(this.skillSupport.getSkillWithDbFallback, id);
  }
}
